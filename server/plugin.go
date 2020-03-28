package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/mattermost/mattermost-server/v5/plugin"
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
}

// ServeHTTP handles HTTP requests.
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	config := p.getConfiguration()

	if err := config.IsValid(); err != nil {
		http.Error(w, fmt.Sprintf("Plugin is not configured: %v", err.Error()), http.StatusNotImplemented)
		return
	}

	switch path := r.URL.Path; path {
	case "/v1/config":
		p.handleConfig(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (p *Plugin) isUserAuthenticated(r *http.Request) bool {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID != "" {
		return true
	}
	return false
}

func (p *Plugin) handleConfig(w http.ResponseWriter, r *http.Request) {
	if !p.isUserAuthenticated(r) {
		http.Error(w, "not authenticated", http.StatusForbidden)
		return
	}

	config := p.getConfiguration()
	signalhubURL := strings.TrimSpace(config.SignalhubURL)

	type ConfigJSON struct {
		SignalhubURL string
	}
	configJSON := ConfigJSON{
		SignalhubURL: signalhubURL,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(configJSON); err != nil {
		p.API.LogWarn("Failed to write JSON response", "error", err.Error())
		return
	}
}

// See https://developers.mattermost.com/extend/plugins/server/reference/
