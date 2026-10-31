package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	voiceRoomsKVKey      = "voice_rooms_v1"
	maxVoiceRooms        = 100
	maxVoiceRoomNameLen  = 64
	maxVoiceRoomCASTries = 5

	// wsEventVoiceRoomsUpdated is delivered to clients as
	// "custom_<plugin id>_voice_rooms_updated".
	wsEventVoiceRoomsUpdated = "voice_rooms_updated"
)

// VoiceRoom is a persistent, server-wide voice channel.
type VoiceRoom struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatorID string `json:"creator_id"`
	CreateAt  int64  `json:"create_at"`
}

var (
	errTooManyRooms = errors.New("too many voice channels")
	errRoomNotFound = errors.New("voice channel not found")
	errNotAllowed   = errors.New("only the creator or a system admin can delete this voice channel")
	errKVConflict   = errors.New("voice channel directory is busy, try again")
)

func newRoomID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "vr" + hex.EncodeToString(b)
}

func normalizeRoomName(name string) (string, bool) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" || utf8.RuneCountInString(name) > maxVoiceRoomNameLen {
		return "", false
	}
	return name, true
}

func (p *Plugin) loadRooms() ([]VoiceRoom, []byte, error) {
	raw, appErr := p.API.KVGet(voiceRoomsKVKey)
	if appErr != nil {
		return nil, nil, appErr
	}
	rooms := []VoiceRoom{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &rooms); err != nil {
			return nil, nil, err
		}
	}
	return rooms, raw, nil
}

// updateRooms applies mutate to the room list using an atomic compare-and-set so
// concurrent edits from other cluster nodes are never lost.
func (p *Plugin) updateRooms(mutate func([]VoiceRoom) ([]VoiceRoom, error)) ([]VoiceRoom, error) {
	p.roomsLock.Lock()
	defer p.roomsLock.Unlock()

	for range maxVoiceRoomCASTries {
		rooms, old, err := p.loadRooms()
		if err != nil {
			return nil, err
		}
		next, err := mutate(rooms)
		if err != nil {
			return nil, err
		}
		sort.SliceStable(next, func(i, j int) bool {
			return strings.ToLower(next[i].Name) < strings.ToLower(next[j].Name)
		})
		data, err := json.Marshal(next)
		if err != nil {
			return nil, err
		}
		if bytes.Equal(data, old) {
			return next, nil
		}
		ok, appErr := p.API.KVSetWithOptions(voiceRoomsKVKey, data, model.PluginKVSetOptions{
			Atomic:   true,
			OldValue: old,
		})
		if appErr != nil {
			return nil, appErr
		}
		if ok {
			p.API.PublishWebSocketEvent(wsEventVoiceRoomsUpdated, map[string]any{
				"rooms": string(data),
			}, &model.WebsocketBroadcast{})
			return next, nil
		}
	}
	return nil, errKVConflict
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// handleVoiceRooms serves GET (list) and POST (create) on /v1/voice/rooms.
func (p *Plugin) handleVoiceRooms(w http.ResponseWriter, r *http.Request) {
	user := userID(r)
	if user == "" {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rooms, _, err := p.loadRooms()
		if err != nil {
			p.API.LogError("Failed to load voice channels", "error", err.Error())
			http.Error(w, "failed to load voice channels", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, rooms)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		name, ok := normalizeRoomName(body.Name)
		if !ok {
			http.Error(w, "name must be 1-64 characters", http.StatusBadRequest)
			return
		}
		room := VoiceRoom{ID: newRoomID(), Name: name, CreatorID: user, CreateAt: model.GetMillis()}
		_, err := p.updateRooms(func(rooms []VoiceRoom) ([]VoiceRoom, error) {
			if len(rooms) >= maxVoiceRooms {
				return nil, errTooManyRooms
			}
			return append(rooms, room), nil
		})
		if err != nil {
			p.writeRoomError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, room)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleVoiceRoom serves DELETE /v1/voice/rooms/{id}.
func (p *Plugin) handleVoiceRoom(w http.ResponseWriter, r *http.Request, roomID string) {
	user := userID(r)
	if user == "" {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if roomID == "" || strings.Contains(roomID, "/") {
		http.NotFound(w, r)
		return
	}

	_, err := p.updateRooms(func(rooms []VoiceRoom) ([]VoiceRoom, error) {
		for i, room := range rooms {
			if room.ID != roomID {
				continue
			}
			if room.CreatorID != user && !p.API.HasPermissionTo(user, model.PermissionManageSystem) {
				return nil, errNotAllowed
			}
			return append(rooms[:i:i], rooms[i+1:]...), nil
		}
		return nil, errRoomNotFound
	})
	if err != nil {
		p.writeRoomError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) writeRoomError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errTooManyRooms):
		http.Error(w, err.Error(), http.StatusConflict)
	case errors.Is(err, errRoomNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, errNotAllowed):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, errKVConflict):
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
	default:
		p.API.LogError("Voice channel update failed", "error", err.Error())
		http.Error(w, "voice channel update failed", http.StatusInternalServerError)
	}
}
