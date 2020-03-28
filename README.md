# Mattermost WebRTC video call plugin

This plugin add video call feature to Mattermost. The plugin uses WebRTC
protocol built into the browser, but but you need to provide and configure your
own Signalhub, STUN and TURN servers.

## Getting Started

Click on the video call button on channel header button when messaging a user.

## Build

Build your plugin:
```
make
```

This will produce a single plugin file (with support for multiple
architectures) for upload to your Mattermost server:

```
dist/mattermost-webrtc-video-<version>.tar.gz

```


## Contributions

Contributions are welcome


## Todo:

- Bug fixes
- Signal using mattermost redux
- turn off video
- mute audio
- end call from source works


## Latest Release

https://github.com/niklabh/mattermost-plugin-webrtc-video/releases/
