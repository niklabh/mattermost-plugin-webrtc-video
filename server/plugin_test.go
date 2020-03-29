package main

import (
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHandleConfigAuth(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{configuration: &configuration{
		SignalhubURL:         "http://sighub.example.com",
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
	bodyBytes, err := ioutil.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal("{\"SignalhubURL\":\"http://sighub.example.com\",\"STUNServer\":\"stun:stun.example.com:3498\",\"TURNServer\":\"turn:turn.example.com:3498\",\"TURNServerUsername\":\"username\",\"TURNServerCredential\":\"credential\"}\n", bodyString)
}

func TestHandleConfigAnonymous(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{configuration: &configuration{
		SignalhubURL:         "http://sighub.example.com",
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
	bodyBytes, err := ioutil.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal(http.StatusForbidden, result.StatusCode)
	assert.Equal("not authenticated\n", bodyString)
}
