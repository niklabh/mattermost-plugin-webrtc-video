# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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
