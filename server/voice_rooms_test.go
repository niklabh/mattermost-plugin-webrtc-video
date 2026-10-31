package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// fakeKV backs KVGet / KVSetWithOptions with an in-memory value honouring
// atomic compare-and-set semantics.
type fakeKV struct {
	value []byte
}

func newRoomsAPI(t *testing.T, kv *fakeKV) *plugintest.API {
	t.Helper()
	api := &plugintest.API{}
	api.On("KVGet", voiceRoomsKVKey).Return(func(string) []byte { return kv.value }, nil).Maybe()
	api.On("KVSetWithOptions", voiceRoomsKVKey, mock.Anything, mock.Anything).Return(
		func(_ string, v []byte, opts model.PluginKVSetOptions) bool {
			if opts.Atomic && string(opts.OldValue) != string(kv.value) {
				return false
			}
			kv.value = v
			return true
		}, nil).Maybe()
	api.On("PublishWebSocketEvent", wsEventVoiceRoomsUpdated, mock.Anything, mock.Anything).Return().Maybe()
	api.On("LogError", mock.Anything, mock.Anything, mock.Anything).Return().Maybe()
	return api
}

func reqAs(user, method, url, body string) *http.Request {
	r := httptest.NewRequest(method, url, strings.NewReader(body))
	if user != "" {
		r.Header.Set("Mattermost-User-Id", user)
	}
	return r
}

func TestVoiceRoomsCreateListDelete(t *testing.T) {
	kv := &fakeKV{}
	api := newRoomsAPI(t, kv)
	api.On("HasPermissionTo", "intruder", model.PermissionManageSystem).Return(false)
	api.On("HasPermissionTo", "admin", model.PermissionManageSystem).Return(true)
	p := &Plugin{}
	p.SetAPI(api)

	// Create.
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodPost, "/v1/voice/rooms", `{"name":"  Daily   standup "}`))
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var room VoiceRoom
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &room))
	assert.Equal(t, "Daily standup", room.Name)
	assert.Equal(t, "alice", room.CreatorID)
	assert.NotEmpty(t, room.ID)
	api.AssertCalled(t, "PublishWebSocketEvent", wsEventVoiceRoomsUpdated, mock.Anything, mock.Anything)

	// List.
	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("bob", http.MethodGet, "/v1/voice/rooms", ""))
	require.Equal(t, http.StatusOK, w.Code)
	var rooms []VoiceRoom
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &rooms))
	require.Len(t, rooms, 1)

	// Non-creator, non-admin cannot delete.
	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("intruder", http.MethodDelete, "/v1/voice/rooms/"+room.ID, ""))
	assert.Equal(t, http.StatusForbidden, w.Code)

	// System admin can delete.
	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("admin", http.MethodDelete, "/v1/voice/rooms/"+room.ID, ""))
	assert.Equal(t, http.StatusNoContent, w.Code)

	// Deleting again is a 404.
	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodDelete, "/v1/voice/rooms/"+room.ID, ""))
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestVoiceRoomsCreatorCanDelete(t *testing.T) {
	kv := &fakeKV{}
	p := &Plugin{}
	p.SetAPI(newRoomsAPI(t, kv))

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodPost, "/v1/voice/rooms", `{"name":"Mine"}`))
	var room VoiceRoom
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &room))

	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodDelete, "/v1/voice/rooms/"+room.ID, ""))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestVoiceRoomsValidation(t *testing.T) {
	p := &Plugin{}
	p.SetAPI(newRoomsAPI(t, &fakeKV{}))

	for _, body := range []string{`{"name":""}`, `{"name":"   "}`, `{"name":"` + strings.Repeat("n", 65) + `"}`, `nope`} {
		w := httptest.NewRecorder()
		p.ServeHTTP(nil, w, reqAs("alice", http.MethodPost, "/v1/voice/rooms", body))
		assert.Equal(t, http.StatusBadRequest, w.Code, body)
	}

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("", http.MethodGet, "/v1/voice/rooms", ""))
	assert.Equal(t, http.StatusForbidden, w.Code)

	w = httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodPut, "/v1/voice/rooms", ""))
	assert.Equal(t, http.StatusMethodNotAllowed, w.Code)
}

func TestVoiceRoomsLimit(t *testing.T) {
	rooms := make([]VoiceRoom, maxVoiceRooms)
	for i := range rooms {
		rooms[i] = VoiceRoom{ID: newRoomID(), Name: "r", CreatorID: "x"}
	}
	data, _ := json.Marshal(rooms)
	p := &Plugin{}
	p.SetAPI(newRoomsAPI(t, &fakeKV{value: data}))

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodPost, "/v1/voice/rooms", `{"name":"one too many"}`))
	assert.Equal(t, http.StatusConflict, w.Code)
}

func TestVoiceRoomsRetriesOnCASConflict(t *testing.T) {
	kv := &fakeKV{}
	api := &plugintest.API{}
	api.On("KVGet", voiceRoomsKVKey).Return(func(string) []byte { return kv.value }, nil)
	calls := 0
	api.On("KVSetWithOptions", voiceRoomsKVKey, mock.Anything, mock.Anything).Return(
		func(_ string, v []byte, _ model.PluginKVSetOptions) bool {
			calls++
			if calls == 1 {
				return false // another node won the race
			}
			kv.value = v
			return true
		}, nil)
	api.On("PublishWebSocketEvent", wsEventVoiceRoomsUpdated, mock.Anything, mock.Anything).Return()
	p := &Plugin{}
	p.SetAPI(api)

	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, reqAs("alice", http.MethodPost, "/v1/voice/rooms", `{"name":"Retry"}`))
	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, 2, calls)
}
