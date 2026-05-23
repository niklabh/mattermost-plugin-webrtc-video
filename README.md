# Mattermost WebRTC video/audio call plugin

[![CI](https://github.com/niklabh/mattermost-plugin-webrtc-video/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/niklabh/mattermost-plugin-webrtc-video/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/niklabh/mattermost-plugin-webrtc-video)](LICENSE)
[![Release](https://img.shields.io/github/v/release/niklabh/mattermost-plugin-webrtc-video?include_prereleases&label=release)](https://github.com/niklabh/mattermost-plugin-webrtc-video/releases)
[![Mattermost](https://img.shields.io/badge/Mattermost-10%2B-blue)](https://mattermost.com)

Peer-to-peer **video calls** in direct messages and **voice channels** in the left sidebar — powered by browser WebRTC and a plugin-hosted signalling layer (HTTP + Server-Sent Events). No external Signalhub or third-party broker required.

Targets **Mattermost 10+** (`min_server_version` in [`plugin.json`](plugin.json)). The Go server uses [`github.com/mattermost/mattermost/server/public`](https://pkg.go.dev/github.com/mattermost/mattermost/server/public).

![WebRTC plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

### Video calls (1:1 direct messages)

- Start a call from the **channel header**, **main menu**, **user profile popover**, or the **left sidebar** “Video call…” button.
- Pick a user from a DM picker; the callee gets an incoming-call modal with ringtone and browser notification.
- Call controls: mute mic, toggle camera, end call; remote video with a small picture-in-picture preview of your camera.
- A **call invite post** appears in the DM thread so both sides see call status in channel history.

Video calls are limited to **1:1 direct messages** — not group DMs or regular channels.

### Voice channels (sidebar)

- Create named **voice channels** from the left sidebar panel.
- Join, leave, mute/unmute, and see who is connected.
- Channel creators can **delete** a voice channel for everyone.
- Room discovery is broadcast over the plugin signal broker; active audio uses WebRTC mesh via [`webrtc-swarm`](https://github.com/tom-james-watson/webrtc-swarm).

## Architecture

```
Browser A  ←—— WebRTC (media) ——→  Browser B
    │                                  │
    │  POST /v1/signal/publish         │
    │  GET  /v1/signal/stream (SSE)    │
    └──────────► Plugin (Go) ◄─────────┘
                      │
              In-memory signal broker
```

| Component | Role |
|-----------|------|
| **Plugin HTTP API** | Serves ICE config (`/v1/config`) and signalling (`/v1/signal/*`). |
| **SSE stream** | Delivers signal messages to subscribed clients (webrtc-swarm compatible). |
| **STUN / TURN** | Configured in System Console; used by the browser for NAT traversal. |
| **Mattermost webapp** | Supplies React, Redux, PropTypes, and React Bootstrap at runtime (webpack externals). |

**Production note:** the signal broker is **in-memory inside the plugin process**. It does not span multiple Mattermost app nodes. High-availability or multi-node deployments need shared storage or an external signal layer.

## Requirements

| Tool | Version |
|------|---------|
| Mattermost Server | 10.0.0+ |
| Go | See [`go.mod`](go.mod) (currently 1.25+) |
| Node.js | 20+ recommended (CI uses 20) |
| npm | Bundled with Node |

Supported plugin binaries: **linux/amd64**, **linux/arm64**, **darwin/amd64**, **darwin/arm64**, **windows/amd64**.

## Installation

1. Build the plugin bundle (see [Build](#build)) or download a release `.tar.gz` from [GitHub Releases](https://github.com/niklabh/mattermost-plugin-webrtc-video/releases).
2. In Mattermost: **System Console → Plugins → Plugin Management → Upload**.
3. Enable the plugin and grant any requested permissions.

See also the [Mattermost plugin developer docs](https://developers.mattermost.com/integrate/plugins/) and [product documentation](https://docs.mattermost.com/).

## Configuration

**System Console → Plugins → WebRTC Video**

| Setting | Description |
|---------|-------------|
| **STUN server** | ICE server for NAT discovery. Format: `stun:host:port`. If unset, the client falls back to public Google STUN URLs. |
| **TURN server** | Relay for restrictive NATs. Format: `turn:host:port`. Strongly recommended for production. |
| **TURN username** | Optional credentials for your TURN server. |
| **TURN credential** | Optional password for your TURN server. |

Example STUN:

```text
stun:stun.l.google.com:19302
```

Run or subscribe to your own **TURN** service for reliable connectivity. Do not rely on third-party credentials embedded in documentation.

## Build

From the repository root:

```bash
make          # lint, test, and produce the release bundle
make dist     # build only (skip lint/test)
make deploy   # build and install to a dev server (see below)
```

Output: `dist/mattermost-webrtc-video-<version>.tar.gz`

After changing the version in `plugin.json`, run `make apply` so `server/manifest.go` and `webapp/src/manifest.js` stay in sync.

### Make targets

| Target | Description |
|--------|-------------|
| `make` / `make all` | `check-style`, `test`, and `dist` |
| `make check-style` | Go fmt/vet/lint + ESLint |
| `make test` | Go unit tests + Jest |
| `make server` | Cross-compile Go plugin binaries |
| `make webapp` | Production webpack bundle |
| `make webapp-debug` | Unminified webpack bundle |
| `make deploy` | Upload bundle via API or copy to sibling `mattermost-server` |
| `make clean` | Remove build artifacts and `node_modules` |

### Deploy to a dev server

**Via Mattermost API** (set env vars, then `make deploy`):

```bash
export MM_SERVICESETTINGS_SITEURL=https://localhost:8065
export MM_ADMIN_USERNAME=admin
export MM_ADMIN_PASSWORD=your-password
make deploy
```

**Via filesystem** — if `../mattermost-server` exists, the bundle is extracted into its `plugins/` directory. Restart the server and enable the plugin manually.

## Development

```bash
cd webapp && npm install   # or: make webapp/.npminstall
make check-style           # lint
make test                  # unit tests
make webapp-debug          # faster rebuilds while iterating
```

The webapp is bundled with **webpack 5**. React / Redux / PropTypes / React Bootstrap are **externals** provided by the Mattermost webapp at runtime — do not bundle them.

[`mattermost-redux`](https://www.npmjs.com/package/mattermost-redux) is pinned for selector compatibility with the host webapp. Keep it aligned with your Mattermost server version family.

### Project layout

```
plugin.json          Plugin manifest and settings schema
server/              Go plugin (HTTP handlers, signal broker, config)
webapp/src/          React UI (modals, sidebar, call invite posts)
webapp/webpack.config.js
Makefile
```

### CI

GitHub Actions runs `make check-style` and `make test` on push/PR (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Calls connect but no audio/video | Missing or misconfigured TURN; check browser console and ICE candidate logs. |
| `backend executable not found for environment: darwin/arm64` | Rebuild from a branch whose `plugin.json` includes `darwin-arm64`, then re-upload the bundle. |
| Signalling works on one node only | Expected with in-memory broker on multi-node Mattermost; see [Architecture](#architecture). |
| Plugin fails to load after upgrade | Confirm Mattermost meets `min_server_version` and upload a fresh bundle built for your OS/arch. |

Enable browser devtools and look for `[mattermost-webrtc-video]` debug output (see `webapp/src/utils/debug.js`).

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/niklabh/mattermost-plugin-webrtc-video).

## License

[Apache License 2.0](LICENSE)

## History

- **1.1.0** — Modernized for Mattermost 10+: `mattermost/server/public` SDK, plugin HTTP/SSE signalling (no external Signalhub), ICE and UI updates, voice channel improvements, dependency refresh (webpack 5, updated axios/mattermost-redux).
- **0.0.1** — Initial release (2018). See [CHANGELOG.md](CHANGELOG.md).
