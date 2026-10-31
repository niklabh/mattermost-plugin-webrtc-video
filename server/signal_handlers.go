package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	maxSignalTopicLen = 256

	// maxSignalBodyBytes bounds a single publish. SDP offers with many ICE candidates
	// are a few KB; 64 KiB leaves ample headroom while preventing abuse.
	maxSignalBodyBytes = 64 << 10

	// sseKeepAliveInterval keeps idle SSE connections alive through reverse proxies
	// (nginx's default proxy_read_timeout is 60s).
	sseKeepAliveInterval = 25 * time.Second

	// senderField is injected by the server into every published payload so receivers
	// can trust who sent a message. Client-supplied values are overwritten.
	senderField = "_sender"

	// inboxPrefix topics are personal: only the owning user may subscribe.
	inboxPrefix = "inbox/"

	clusterEventSignal = "signal"
)

var topicPattern = regexp.MustCompile(`^[A-Za-z0-9_\-./]+$`)

func validTopic(topic string) bool {
	return topic != "" && len(topic) <= maxSignalTopicLen && topicPattern.MatchString(topic)
}

// canSubscribe enforces that personal inbox topics ("inbox/<userID>" and anything
// beneath it) can only be read by their owner. Other topics are capability-style:
// they embed unguessable random ids (call ids, room ids).
func canSubscribe(user, topic string) bool {
	if !strings.HasPrefix(topic, inboxPrefix) {
		return true
	}
	owner := strings.TrimPrefix(topic, inboxPrefix)
	if i := strings.IndexByte(owner, '/'); i >= 0 {
		owner = owner[:i]
	}
	return owner == user
}

// stampSender overwrites the senderField of a JSON object payload with the
// authenticated user id. Non-object payloads are rejected.
func stampSender(payload json.RawMessage, user string) (json.RawMessage, error) {
	if len(payload) == 0 {
		payload = json.RawMessage("{}")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(payload, &obj); err != nil || obj == nil {
		return nil, fmt.Errorf("payload must be a JSON object")
	}
	sender, _ := json.Marshal(user)
	obj[senderField] = sender
	return json.Marshal(obj)
}

type clusterSignal struct {
	Topic   string          `json:"topic"`
	Payload json.RawMessage `json:"payload"`
}

func (p *Plugin) handleSignalPublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !p.isUserAuthenticated(r) {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxSignalBodyBytes)
	var body clusterSignal
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if !validTopic(body.Topic) {
		http.Error(w, "invalid topic", http.StatusBadRequest)
		return
	}
	payload, err := stampSender(body.Payload, userID(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	p.getSignal().publish(body.Topic, payload)
	p.broadcastToCluster(body.Topic, payload)
	w.WriteHeader(http.StatusOK)
}

// broadcastToCluster forwards a signal to the other nodes of a High Availability
// cluster, so peers connected to different app servers can still reach each other.
func (p *Plugin) broadcastToCluster(topic string, payload json.RawMessage) {
	if p.API == nil {
		return
	}
	data, err := json.Marshal(clusterSignal{Topic: topic, Payload: payload})
	if err != nil {
		return
	}
	if err := p.API.PublishPluginClusterEvent(
		model.PluginClusterEvent{Id: clusterEventSignal, Data: data},
		model.PluginClusterEventSendOptions{SendType: model.PluginClusterEventSendTypeReliable},
	); err != nil {
		p.API.LogWarn("Failed to publish signal to cluster", "error", err.Error())
	}
}

// OnPluginClusterEvent receives signals published on other cluster nodes and
// delivers them to subscribers connected to this node.
func (p *Plugin) OnPluginClusterEvent(_ *plugin.Context, ev model.PluginClusterEvent) {
	if ev.Id != clusterEventSignal {
		return
	}
	var msg clusterSignal
	if err := json.Unmarshal(ev.Data, &msg); err != nil || !validTopic(msg.Topic) {
		return
	}
	p.getSignal().publish(msg.Topic, msg.Payload)
}

func (p *Plugin) handleSignalStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !p.isUserAuthenticated(r) {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}
	topic := r.URL.Query().Get("topic")
	if !validTopic(topic) {
		http.Error(w, "invalid topic", http.StatusBadRequest)
		return
	}
	if !canSubscribe(userID(r), topic) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx response buffering

	ch, unsub := p.getSignal().subscribe(topic)
	defer unsub()

	// Flush headers right away so EventSource fires `open` without waiting for data.
	_, _ = fmt.Fprint(w, "retry: 3000\n: connected\n\n")
	fl.Flush()

	ticker := time.NewTicker(sseKeepAliveInterval)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			fl.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", msg); err != nil {
				return
			}
			fl.Flush()
		}
	}
}
