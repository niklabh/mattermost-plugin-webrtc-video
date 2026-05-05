package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHandleConfigAuth(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{configuration: &configuration{
		STUNServer:           "stun:stun.example.com:3498",
		TURNServer:           "turn:turn.example.com:3498",
		TURNServerUsername:   "username",
		TURNServerCredential: "credential",
	}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/config", nil)
	r.Header = http.Header{
		"Mattermost-User-Id": []string{"123456"},
	}

	plugin.ServeHTTP(nil, w, r)

	result := w.Result()
	assert.NotNil(result)
	bodyBytes, err := io.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal("{\"STUNServer\":\"stun:stun.example.com:3498\",\"TURNServer\":\"turn:turn.example.com:3498\",\"TURNServerUsername\":\"username\",\"TURNServerCredential\":\"credential\"}\n", bodyString)
}

func TestHandleConfigAnonymous(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{configuration: &configuration{
		STUNServer:           "stun:stun.example.com:3498",
		TURNServer:           "turn:turn.example.com:3498",
		TURNServerUsername:   "username",
		TURNServerCredential: "credential",
	}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/config", nil)

	plugin.ServeHTTP(nil, w, r)

	result := w.Result()
	assert.NotNil(result)
	bodyBytes, err := io.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal(http.StatusForbidden, result.StatusCode)
	assert.Equal("not authenticated\n", bodyString)
}

func TestHandleConfigEmptyOK(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{configuration: &configuration{}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/config", nil)
	r.Header = http.Header{
		"Mattermost-User-Id": []string{"123456"},
	}

	plugin.ServeHTTP(nil, w, r)

	result := w.Result()
	assert.Equal(http.StatusOK, result.StatusCode)
	bodyBytes, err := io.ReadAll(result.Body)
	assert.Nil(err)
	assert.Contains(string(bodyBytes), `"STUNServer":""`)
}
