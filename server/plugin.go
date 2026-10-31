package main

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // HMAC-SHA1 is mandated by the TURN REST API / coturn use-auth-secret.
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	defaultTURNCredentialTTL = 12 * time.Hour

	// minTURNCredentialTTL must comfortably exceed the webapp's 30 minute config refresh.
	minTURNCredentialTTL = time.Hour
)

// Plugin implements the interface expected by the Mattermost server to
// communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	signalOnce sync.Once
	signal     *signalBroker

	// roomsLock serialises voice-room directory updates on this node; cross-node
	// races are handled with an atomic compare-and-set in the KV store.
	roomsLock sync.Mutex

	// now is overridable in tests.
	now func() time.Time
}

func (p *Plugin) getSignal() *signalBroker {
	p.signalOnce.Do(func() {
		p.signal = newSignalBroker()
	})
	return p.signal
}

func (p *Plugin) clock() time.Time {
	if p.now != nil {
		return p.now()
	}
	return time.Now()
}

// ServeHTTP handles HTTP requests.
// See https://docs.mattermost.com/developers/integrate/reference/server
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/v1/config":
		p.handleConfig(w, r)
	case path == "/v1/signal/publish":
		p.handleSignalPublish(w, r)
	case path == "/v1/signal/stream":
		p.handleSignalStream(w, r)
	case path == "/v1/voice/rooms":
		p.handleVoiceRooms(w, r)
	case strings.HasPrefix(path, "/v1/voice/rooms/"):
		p.handleVoiceRoom(w, r, strings.TrimPrefix(path, "/v1/voice/rooms/"))
	default:
		http.NotFound(w, r)
	}
}

// userID returns the authenticated Mattermost user making the request. The server
// only sets this header after validating the session (and CSRF token for cookie POSTs).
func userID(r *http.Request) string {
	return r.Header.Get("Mattermost-User-Id")
}

func (p *Plugin) isUserAuthenticated(r *http.Request) bool {
	return userID(r) != ""
}

// ConfigJSON is the ICE configuration served to the webapp.
type ConfigJSON struct {
	STUNServer           string
	TURNServer           string
	TURNServerUsername   string
	TURNServerCredential string
}

func (p *Plugin) handleConfig(w http.ResponseWriter, r *http.Request) {
	if !p.isUserAuthenticated(r) {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}

	config := p.getConfiguration()
	out := ConfigJSON{
		STUNServer:           strings.TrimSpace(config.STUNServer),
		TURNServer:           strings.TrimSpace(config.TURNServer),
		TURNServerUsername:   strings.TrimSpace(config.TURNServerUsername),
		TURNServerCredential: strings.TrimSpace(config.TURNServerCredential),
	}

	if secret := strings.TrimSpace(config.TURNServerSharedSecret); secret != "" && out.TURNServer != "" {
		ttl := defaultTURNCredentialTTL
		if config.TURNCredentialTTLMinutes > 0 {
			ttl = max(time.Duration(config.TURNCredentialTTLMinutes)*time.Minute, minTURNCredentialTTL)
		}
		out.TURNServerUsername, out.TURNServerCredential = turnRESTCredentials(secret, userID(r), p.clock().Add(ttl))
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(out); err != nil && p.API != nil {
		p.API.LogWarn("Failed to write JSON response", "error", err.Error())
	}
}

// turnRESTCredentials implements the TURN REST API credential scheme
// (draft-uberti-behave-turn-rest, coturn "use-auth-secret"):
//
//	username   = "<unix-expiry>:<user id>"
//	credential = base64(HMAC-SHA1(secret, username))
func turnRESTCredentials(secret, user string, expiry time.Time) (string, string) {
	username := strconv.FormatInt(expiry.Unix(), 10) + ":" + user
	mac := hmac.New(sha1.New, []byte(secret))
	_, _ = mac.Write([]byte(username))
	return username, base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
