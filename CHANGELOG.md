# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 2.1.0 - 2026-10-31

### Added
- **High Availability support**: signalling is fanned out to every app node with `PublishPluginClusterEvent` / `OnPluginClusterEvent`, so calls work when users are connected to different servers.
- **Time-limited TURN credentials** (TURN REST API / coturn `use-auth-secret`) via the new *TURN shared secret* and *TURN credential lifetime* settings. The TURN credential settings are now marked secret.
- **Server-side voice channel directory** (`/v1/voice/rooms`) stored in the KV store with atomic compare-and-set and live WebSocket updates. Only the creator or a system admin can delete a channel.
- Channel header **call button** (`registerCallButtonAction`): one click calls the other person in a DM, and opens the picker elsewhere.
- Call picker **searches all users** on the server, with avatars, presence and keyboard navigation.
- Call window: **screen sharing**, **full screen**, call timer, **minimize to a floating tile**, remote mute/camera/screen-share indicators, audio-only fallback, and clear permission errors.
- Call flow: outgoing **ring timeout** (“No answer”), **caller cancel** (previously the callee rang forever), **busy** signal, automatic **reconnect** (20s grace), hang-up when the tab closes.
- DM **call card** updates with the outcome (missed / declined / duration) and offers **Call back**.
- Incoming calls use the user's Mattermost **call ringtone** and **desktop notifications** (Desktop App aware) through `window.WebappUtils`, with fallbacks.
- Voice channels: one-click join (muted), **speaking indicators**, per-participant mute state, turn sound off, voice bar. The session survives the sidebar unmounting.
- Theme-aware UI built on Mattermost CSS variables, with inline SVG icons (no Font Awesome dependency), `prefers-reduced-motion` and small-screen support.
- Jest + React Testing Library tests for the call state machine, signalling security and components (62 tests). Go tests for clustering, sender stamping, inbox privacy, TURN credentials and voice rooms.

### Changed
- **Replaced `webrtc-swarm` and `simple-peer`** with an in-house mesh on the native `RTCPeerConnection` API (`webapp/src/signal/{mesh,peer,hub}.js`): perfect negotiation (glare-safe renegotiation for screen sharing), ordered per-peer signalling, queued ICE candidates, a pre-negotiated data channel, ICE restart on failure, connect timeouts, and `bye` on leave. Removes the GitHub-pinned fork and its deprecated dependencies (`cuid`, `through2`, `readable-stream`) and the Node polyfills (`buffer`, `util`, `stream-browserify`, `process`).
- Call control now uses private per-user inbox topics plus random per-call media topics. The server stamps every message with the authenticated sender (`_sender`), and clients reject spoofed swarm messages. **Both parties must reload after upgrading.**
- SSE streams send keepalives every 25s plus `X-Accel-Buffering: no`, and EventSource reconnects automatically instead of silently dropping signalling.
- Publish requests are limited to 64 KiB and must carry a JSON object payload; topics are validated (max 256 chars, restricted charset).
- Webapp state rewritten around a single call object instead of 20+ independent flags. Components are function components with hooks.
- Debug logging is off by default (`localStorage.setItem('webrtc-video-debug', '1')` to enable).
- Respects the Mattermost site sub-path (`window.basename`) for API and plugin URLs.

### Fixed
- Ending a call now closes the WebRTC swarm, peer connection and SSE streams (they previously leaked), and the other side is told the call ended instead of hanging on “Connecting…”.
- DM picker and DM lookup used `getDirectChannels`, which no longer exists in mattermost-redux 11.
- `setState` was called from `render()` in the voice channel panel (flagged by React 19).

### Dependencies
- Go: `mattermost/server/public` v0.3.1 → **v0.6.0**, Go 1.26, testify 1.12, refreshed transitive modules.
- Security: resolves all open Dependabot alerts (fast-uri, follow-redirects, brace-expansion, braces, moment, js-yaml, grpc). Remaining `npm audit` findings are moderate/low and limited to Jest/ESLint dev tooling.
- Webapp: Babel 7 → **8**, ESLint 8 → **9** (flat config), Jest 29 → **30**, webpack-cli 5 → **7**, babel-loader 10, mattermost-redux 11.9.0, react-redux 9, redux 5.
- Removed: axios (native `fetch`), `@babel/polyfill` / core-js 2, TypeScript tooling and `@types/*` (no TS sources), file-loader, unused ring audio files, `.babelrc` / `.eslintrc.json` / `tsconfig.json`.
- Tooling: Node 26 LTS (`.nvmrc`), CI on actions v5/v6 and now also builds the bundle, Dockerfile updated from golang 1.13 to Go 1.26 + Node 26.

## 2.0.1 - 2026-05-23

### Added
- Voice channel deletion: channel creators can remove a voice channel for everyone from the sidebar.
- `darwin-arm64` plugin binary in `plugin.json` so the bundle loads on Apple Silicon Mattermost servers.
- Expanded README with architecture, configuration, build, deploy, and troubleshooting sections; marketplace plugin icon and CI/license/release/Mattermost badges.

### Changed
- Simplified the in-channel call-invite post UI.
- Audio/voice channel UX polish (`Better audio channel`).

### Fixed
- Restored CI after the Dependabot webpack 5 upgrade.

### Security
- Dependency bumps via Dependabot: `axios` 0.28.1 → 0.31.1, `qs` 6.15.1 → 6.15.2, `uuid`, `mattermost-redux`, `serialize-javascript`, `webpack`, `minimatch`, and `@typescript-eslint/{eslint-plugin,parser}`.

## 2.0.0 - 2026-05-05

### Added
- In-process plugin signal broker with HTTP `POST /v1/signal/publish` and SSE `GET /v1/signal/stream` endpoints (`server/signal_broker.go`, `server/signal_handlers.go`), replacing the external Signalhub dependency.
- Webapp `pluginSignalHub` adapter so existing webrtc-swarm clients talk to the plugin broker.
- Left sidebar header with "Video call…" entry point and a DM picker (`video_call_picker`) for starting 1:1 video calls.
- Channel-header popover "Start video call" button (`popover_video_call_button.jsx`).

### Changed
- Configuration surface reduced to STUN/TURN settings only; the Signalhub URL setting is gone (signalling is now plugin-hosted).
- ICE configuration is fetched from the plugin's `/v1/config` endpoint instead of being computed client-side.

### Removed
- External Signalhub dependency and the corresponding `SignalhubURL` plugin setting.

## 1.1.0 - 2026-05-05

### Added
- `min_server_version` bumped to **Mattermost 10.0.0+**.
- Shared `webapp/src/utils/iceServers.js` helper producing `urls`-style `RTCIceServer` entries.
- Redesigned 1:1 video call modal: dark theme, incoming / connecting / ringing states, remote video with picture-in-picture self preview, toolbar, and proper close handling.

### Changed
- Migrated the Go server from `github.com/mattermost/mattermost-server/v5` to `github.com/mattermost/mattermost/server/public` (v0.3.1).
- Switched manifest build tool to `public/model` and `os.WriteFile`; tests use `io.ReadAll`.
- Updated ESLint to `@babel/eslint-parser`; fixed the webpack Babel plugin name.
- Refreshed npm dependencies: `mattermost-redux` 5.33.x, `axios` 0.28.x, `tslib`, etc.
- Rewrote README around the modernised stack and current Mattermost plugin docs.

### Fixed
- `iceServers.concat` result no longer discarded when building the peer configuration.
- Audio/video track toggles hardened.
- Guard signalhub usage when the configured URL is unset; STUN-only defaults (no embedded TURN credentials).

### Removed
- Browser-inappropriate `wrtc` / `os` imports from the webapp bundle.
- Hard-coded `baatcheet.herokuapp.com` signalhub fallback.

## 0.0.1 - 2018-08-16

### Added
- Initial release.
