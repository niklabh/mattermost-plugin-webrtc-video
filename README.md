# Mattermost WebRTC video/audio call plugin

This plugin adds peer-to-peer **video calls** (direct messages) and a **voice channel** sidebar panel. It uses browser WebRTC; you must provide your own **Signalhub** (signalling), **STUN**, and usually **TURN** servers.

Current release targets **Mattermost 10+** (see `min_server_version` in `plugin.json`). The Go server uses [`github.com/mattermost/mattermost/server/public`](https://pkg.go.dev/github.com/mattermost/mattermost/server/public/plugin) per current plugin development practice.

![WebRTC plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

- Start a video call from a **direct message** channel via the header button; the callee gets an incoming-call UI.
- Optional **voice channel** controls in the left sidebar (microphone / speaker).
- Call controls: mute mic, toggle camera, end call; remote video with a small **picture-in-picture** preview of your own camera.

## Installation

1. Build the plugin bundle (see **Build** below) or download a release `.tar.gz` if available.
2. Upload via **System Console → Plugins → Plugin Management** (or your deployment’s equivalent). See [Mattermost plugin documentation](https://developers.mattermost.com/integrate/plugins/) and [product docs](https://docs.mattermost.com/).

## Configuration

In **System Console → Plugins → WebRTC Video**, set:

| Setting | Notes |
|--------|--------|
| **Signalhub URL** | **Required.** HTTPS URL of your [signalhub](https://github.com/mafintosh/signalhub) server. There is no built-in default; public demo hubs are not shipped. |
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

## Contributing

Contributions are welcome via issues and pull requests on the repository.

## History

- **1.1.0** — Server SDK on `mattermost/server/public`, signalling/ICE fixes, removed deprecated default Signalhub host, updated video call UI, dependency refresh.
