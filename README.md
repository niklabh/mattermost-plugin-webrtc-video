# Mattermost WebRTC video/audio call plugin

This plugin adds peer-to-peer **video calls** (direct messages) and a **voice channel** sidebar panel. It uses browser WebRTC. **Signalling runs inside the plugin** (HTTP + Server-Sent Events on the Mattermost server); you still configure **STUN** and usually **TURN** for ICE.
Note: the broker is **in-memory in the plugin process**; it does not span multiple app nodes (no HA) unless you add shared storage or an external signal layer later.

Current release targets **Mattermost 10+** (see `min_server_version` in `plugin.json`). The Go server uses [`github.com/mattermost/mattermost/server/public`](https://pkg.go.dev/github.com/mattermost/mattermost/server/public/plugin) per current plugin development practice.

![WebRTC plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

- Start a video call from a **direct message** channel via the header button; the callee gets an incoming-call UI. The header action applies to **1:1 DMs only** (not group messages or regular channels).
- Optional **voice channel** controls in the left sidebar (microphone / speaker).
- Call controls: mute mic, toggle camera, end call; remote video with a small **picture-in-picture** preview of your own camera.

## Installation

1. Build the plugin bundle (see **Build** below) or download a release `.tar.gz` if available.
2. Upload via **System Console → Plugins → Plugin Management** (or your deployment’s equivalent). See [Mattermost plugin documentation](https://developers.mattermost.com/integrate/plugins/) and [product docs](https://docs.mattermost.com/).

## Configuration

In **System Console → Plugins → WebRTC Video**, set:

| Setting | Notes |
|--------|--------|
| **STUN server** | Optional if unset the client uses a small set of public Google STUN URLs only (no baked-in TURN credentials). Format: `stun:host:port` |
| **TURN server** | Recommended for NAT-heavy networks. Format: `turn:host:port` with username and credential if your TURN server needs them. |

Example STUN (Google public):

```text
stun:stun.l.google.com:19302
```

You must run or subscribe to a **TURN** service for reliable connectivity; configure it in the plugin settings rather than relying on third-party credentials in documentation.

## Build

Requires **Go** (1.22+) and **Node.js** / npm.

```bash
make
```

Produces `dist/mattermost-webrtc-video-<version>.tar.gz`.

After changing `plugin.json` version, run `make apply` so `server/manifest.go` and `webapp/src/manifest.js` stay in sync (or update those files to match).

## Development notes

- Webpack bundles the webapp; React / Redux / PropTypes / React Bootstrap are **externals** supplied by the Mattermost webapp at runtime.
- **`mattermost-redux`** is aligned to a 5.x line compatible with classic selector paths and webpack 4; the host server should be a matching major family (10+).
- **`make`** builds server plugins for **linux/amd64**, **linux/arm64**, **darwin/amd64**, **darwin/arm64** (Apple Silicon), and **windows/amd64**. If Mattermost reports `backend executable not found for environment: darwin/arm64`, rebuild from a branch that includes `darwin-arm64` in `plugin.json` and upload the new bundle.

## Contributing

Contributions are welcome via issues and pull requests on the repository.

## History

- **1.1.0** — Server SDK on `mattermost/server/public`, signalling via plugin HTTP/SSE (no external Signalhub), ICE and UI updates, dependency refresh.
