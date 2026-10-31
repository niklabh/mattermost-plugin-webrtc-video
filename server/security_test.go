package main

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // matches production algorithm
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestSignalPublishOverwritesSpoofedSender(t *testing.T) {
	p := &Plugin{}
	ch, unsub := p.getSignal().subscribe("call/abc")
	defer unsub()

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodPost, "/v1/signal/publish",
		strings.NewReader(`{"topic":"call/abc","payload":{"type":"invite","_sender":"someone-else"}}`)))
	require.Equal(t, http.StatusOK, w.Result().StatusCode)

	select {
	case msg := <-ch:
		assert.JSONEq(t, `{"type":"invite","_sender":"user-1"}`, string(msg))
	case <-time.After(time.Second):
		t.Fatal("no message delivered")
	}
}

func TestSignalPublishRejectsNonObjectPayload(t *testing.T) {
	for _, payload := range []string{`"a string"`, `42`, `[1,2]`, `null`} {
		p := &Plugin{}
		w := httptest.NewRecorder()
		p.ServeHTTP(nil, w, authReq(http.MethodPost, "/v1/signal/publish",
			strings.NewReader(`{"topic":"t","payload":`+payload+`}`)))
		assert.Equal(t, http.StatusBadRequest, w.Result().StatusCode, payload)
	}
}

func TestSignalPublishRejectsInvalidTopicCharacters(t *testing.T) {
	p := &Plugin{}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodPost, "/v1/signal/publish",
		strings.NewReader(`{"topic":"bad topic\n","payload":{}}`)))
	assert.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
}

func TestSignalPublishRejectsOversizedBody(t *testing.T) {
	p := &Plugin{}
	big := strings.Repeat("x", maxSignalBodyBytes)
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodPost, "/v1/signal/publish",
		strings.NewReader(`{"topic":"t","payload":{"x":"`+big+`"}}`)))
	assert.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
}

func TestSignalStreamInboxIsPrivate(t *testing.T) {
	p := &Plugin{}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodGet, "/v1/signal/stream?topic=inbox/someone-else", nil))
	assert.Equal(t, http.StatusForbidden, w.Result().StatusCode)
}

func TestCanSubscribe(t *testing.T) {
	assert.True(t, canSubscribe("u1", "inbox/u1"))
	assert.True(t, canSubscribe("u1", "inbox/u1/sub"))
	assert.False(t, canSubscribe("u1", "inbox/u2"))
	assert.False(t, canSubscribe("u1", "inbox/u1x"))
	assert.True(t, canSubscribe("u1", "call/xyz/all"))
}

func TestSignalPublishFansOutToCluster(t *testing.T) {
	api := &plugintest.API{}
	api.On("PublishPluginClusterEvent", mock.MatchedBy(func(ev model.PluginClusterEvent) bool {
		var msg clusterSignal
		return ev.Id == clusterEventSignal &&
			json.Unmarshal(ev.Data, &msg) == nil &&
			msg.Topic == "call/abc"
	}), mock.Anything).Return(nil).Once()
	defer api.AssertExpectations(t)

	p := &Plugin{}
	p.SetAPI(api)

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodPost, "/v1/signal/publish",
		strings.NewReader(`{"topic":"call/abc","payload":{}}`)))
	assert.Equal(t, http.StatusOK, w.Result().StatusCode)
}

func TestOnPluginClusterEventDeliversLocally(t *testing.T) {
	p := &Plugin{}
	ch, unsub := p.getSignal().subscribe("voice/r1")
	defer unsub()

	data, _ := json.Marshal(clusterSignal{Topic: "voice/r1", Payload: json.RawMessage(`{"a":1}`)})
	p.OnPluginClusterEvent(nil, model.PluginClusterEvent{Id: clusterEventSignal, Data: data})

	select {
	case msg := <-ch:
		assert.JSONEq(t, `{"a":1}`, string(msg))
	case <-time.After(time.Second):
		t.Fatal("cluster event not delivered")
	}

	// Unknown event ids are ignored.
	p.OnPluginClusterEvent(nil, model.PluginClusterEvent{Id: "other", Data: data})
	select {
	case <-ch:
		t.Fatal("unexpected delivery for unrelated event")
	case <-time.After(20 * time.Millisecond):
	}
}

func TestHandleConfigGeneratesEphemeralTURNCredentials(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	p := &Plugin{
		now: func() time.Time { return now },
		configuration: &configuration{
			TURNServer:               "turn:turn.example.com:3478",
			TURNServerUsername:       "static-user",
			TURNServerCredential:     "static-pass",
			TURNServerSharedSecret:   "s3cret",
			TURNCredentialTTLMinutes: 60,
		},
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodGet, "/v1/config", nil))
	require.Equal(t, http.StatusOK, w.Result().StatusCode)

	var got ConfigJSON
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))

	wantUser := "1700003600:user-1"
	mac := hmac.New(sha1.New, []byte("s3cret"))
	mac.Write([]byte(wantUser))
	assert.Equal(t, wantUser, got.TURNServerUsername)
	assert.Equal(t, base64.StdEncoding.EncodeToString(mac.Sum(nil)), got.TURNServerCredential)
	assert.NotContains(t, w.Body.String(), "static-pass")
}

func TestHandleConfigEnforcesMinimumTURNTTL(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	p := &Plugin{
		now: func() time.Time { return now },
		configuration: &configuration{
			TURNServer:               "turn:turn.example.com:3478",
			TURNServerSharedSecret:   "s3cret",
			TURNCredentialTTLMinutes: 5,
		},
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, authReq(http.MethodGet, "/v1/config", nil))

	var got ConfigJSON
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.Equal(t, "1700003600:user-1", got.TURNServerUsername)
}
