# Mattermost WebRTC video/audio call plugin

[![CI](https://github.com/niklabh/mattermost-plugin-webrtc-video/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/niklabh/mattermost-plugin-webrtc-video/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/niklabh/mattermost-plugin-webrtc-video)](LICENSE)
[![Release](https://img.shields.io/github/v/release/niklabh/mattermost-plugin-webrtc-video?include_prereleases&label=release)](https://github.com/niklabh/mattermost-plugin-webrtc-video/releases)
[![Mattermost](https://img.shields.io/badge/Mattermost-10%2B-blue)](https://mattermost.com)

Peer-to-peer **video calls** in direct messages and **voice channels** in the left sidebar — powered by browser WebRTC and a plugin-hosted signalling layer (HTTP + Server-Sent Events). No external Signalhub or third-party broker required.

Targets **Mattermost 10+** (`min_server_version` in [`plugin.json`](plugin.json)), including the React 19 web app in Mattermost v12. Works in **High Availability** clusters. The Go server uses [`github.com/mattermost/mattermost/server/public`](https://pkg.go.dev/github.com/mattermost/mattermost/server/public).

![WebRTC plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

### 1:1 video calls

- Start a call from the **channel header call button** (one click in a DM), the **user profile popover**, the **main menu**, or **Start a video call** in the left sidebar.
- The call picker **searches everyone on the server** (not only existing DMs), shows avatars and presence, and supports keyboard navigation.
- Incoming calls appear as a **non-blocking card** with your Mattermost call ringtone and a desktop notification (works in the Desktop App).
- In-call: mute, camera on/off, **screen sharing**, **full screen**, call timer, remote mute/camera indicators, and **minimize to a floating tile** so you can keep chatting.
- Falls back to **audio-only** if no camera is available, and explains blocked camera/microphone permissions.
- Handles real-world call flow: ring timeout (“No answer”), caller cancel, **busy** when already in a call, reconnect on network blips, and hang-up on tab close.
- The DM gets a **call card** that updates with the outcome — *Missed*, *Declined*, or the call duration — with a **Call back** button.

### Voice channels (sidebar)

- Server-wide **voice channels** stored on the server, so everyone sees the same list, which updates live.
- Join with one click (you join muted), then mute/unmute, turn sound off, and leave from a voice bar.
- **Speaking indicators** and per-participant mute status.
- Only the **creator or a system admin** can delete a channel (with confirmation).
- Audio uses a WebRTC full mesh (up to 8 people per channel), built on the browser's native `RTCPeerConnection`.

## Architecture

```
Browser A  ←————— WebRTC media (DTLS-SRTP) —————→  Browser B
    │                                                   │
    │  POST /v1/signal/publish     GET /v1/signal/stream (SSE)
    └────────────► Plugin (Go) on any node ◄────────────┘
                        │
         signal broker ◄┴► PublishPluginClusterEvent (HA)
```

| Component | Role |
|-----------|------|
| **`/v1/config`** | ICE servers for the browser. With a TURN shared secret, issues per-user, time-limited TURN credentials. |
| **`/v1/signal/publish` + `/v1/signal/stream`** | Signalling over HTTP + Server-Sent Events (with keepalives so proxies don't drop idle streams). |
| **`/v1/voice/rooms`** | Voice channel directory stored in the plugin KV store; changes are pushed over the Mattermost WebSocket. |
| **Cluster events** | Signals are forwarded to every node with `PublishPluginClusterEvent`, so users on different app servers can call each other. |
| **Mesh / Peer** (`webapp/src/signal`) | Native `RTCPeerConnection` wrapper using the W3C *perfect negotiation* pattern, so either side can renegotiate (e.g. screen sharing) and offer collisions resolve on their own. Includes a pre-negotiated data channel, ICE-candidate queueing, one ICE restart on failure, and `bye` messages for instant leave. No third-party WebRTC libraries or Node polyfills. |
| **Mattermost web app** | Supplies React, ReactDOM, Redux, React-Redux and PropTypes at runtime (webpack externals). |

**Signalling security.** The server stamps every signalling message with the authenticated sender (`_sender`), overwriting anything the client claims. Call control (invite/accept/decline/cancel/hangup) goes to a private per-user inbox topic that only its owner can subscribe to. Media negotiation uses a random, unguessable per-call topic, and only the two participants are accepted as peers. Media is end-to-end encrypted by WebRTC (DTLS-SRTP) and never touches the Mattermost server, unless it's relayed through your TURN server (still encrypted).

## Requirements

| Tool | Version |
|------|---------|
| Mattermost Server | 10.0.0+ |
| Go | See [`go.mod`](go.mod) (currently 1.26) |
| Node.js | 26 LTS (see [`.nvmrc`](.nvmrc); minimum 22.18 for Babel 8) |
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
| **TURN username** / **TURN credential** | Static TURN credentials. Every signed-in user can read these, so prefer a shared secret. |
| **TURN shared secret** | *Recommended.* Enables the TURN REST API scheme (coturn `use-auth-secret` + `static-auth-secret`): each user gets a short-lived username/password derived from this secret. |
| **TURN credential lifetime (minutes)** | Lifetime of generated TURN credentials (minimum 60, default 720). The web app refreshes them automatically. |

Example STUN:

```text
stun:stun.l.google.com:19302
```

Run or subscribe to your own **TURN** service for reliable connectivity. Do not rely on third-party credentials embedded in documentation. A minimal coturn setup for the shared-secret mode:

```text
# /etc/turnserver.conf
use-auth-secret
static-auth-secret=<same value as "TURN shared secret">
realm=turn.example.com
```

If you run Mattermost behind nginx, the plugin already sends `X-Accel-Buffering: no` and periodic keepalives on its event streams, so the standard Mattermost nginx config works as-is.

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

The webapp is bundled with **webpack 5** and **Babel 8**, linted with **ESLint 9** (flat config, `webapp/eslint.config.js`) and tested with **Jest 30** + React Testing Library against React 19. React / ReactDOM / Redux / React-Redux / PropTypes are **externals** provided by the Mattermost web app at runtime, so don't bundle them.

Turn on verbose client logging with `localStorage.setItem('webrtc-video-debug', '1')` in the browser console.

[`mattermost-redux`](https://www.npmjs.com/package/mattermost-redux) is pinned for selector compatibility with the host webapp. Keep it aligned with your Mattermost server version family.

### Project layout

```
plugin.json                 Plugin manifest and settings schema
server/                     Go plugin: config, signalling (SSE + cluster), voice room directory
webapp/src/call/            1:1 call controller, media helpers, ringing, call posts
webapp/src/voice/           Voice channel mesh sessions and directory actions
webapp/src/signal/          SSE pub/sub hub, Mesh (peer discovery) and Peer (RTCPeerConnection, perfect negotiation)
webapp/src/components/      Call window, picker, sidebar, buttons, call post card
webapp/src/styles.js        Theme-aware stylesheet (Mattermost CSS variables)
Makefile
```

### CI

GitHub Actions runs `make check-style`, `make test` and `make dist` on push/PR (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Calls connect but no audio/video, or end with “Connection lost” | Missing or misconfigured TURN; check `chrome://webrtc-internals` for ICE candidate errors. |
| “Access to your camera/microphone was blocked” | Allow the site in the browser's permission settings. Calls need Mattermost served over **HTTPS**. |
| `backend executable not found for environment: darwin/arm64` | Rebuild from a branch whose `plugin.json` includes `darwin-arm64`, then re-upload the bundle. |
| Calls between users fail after upgrading to 2.1 | Both sides need the new web app. Ask users to reload the page. |
| Plugin fails to load after upgrade | Confirm Mattermost meets `min_server_version` and upload a fresh bundle built for your OS/arch. |

For client-side logs, run `localStorage.setItem('webrtc-video-debug', '1')` in the browser console, reload, and look for `[webrtc-video]` messages.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/niklabh/mattermost-plugin-webrtc-video).

## License

[Apache License 2.0](LICENSE)

## History

- **2.1.0** — HA support, signalling hardening, TURN REST credentials, server-side voice channels, redesigned call UI, React 19 / Mattermost v12 readiness, toolchain refresh. See [CHANGELOG.md](CHANGELOG.md).
- **1.1.0** — Modernized for Mattermost 10+: `mattermost/server/public` SDK, plugin HTTP/SSE signalling (no external Signalhub), ICE and UI updates, voice channel improvements, dependency refresh (webpack 5, updated axios/mattermost-redux).
- **0.0.1** — Initial release (2018). See [CHANGELOG.md](CHANGELOG.md).
