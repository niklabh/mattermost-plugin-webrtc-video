# Mattermost webrtc video call plugin

This plugin add video call capabilities to mattermost client with webrtc. Users can call other users. Communication is browser to browser and serverless.

## Getting Started
Click on the video call button on channel header button when messaging a user.

## Build

Build your plugin:
```
make
```

This will produce a single plugin file (with support for multiple architectures) for upload to your Mattermost server:

```
dist/com.example.my-plugin.tar.gz
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

https://github.com/niklabh/mattermost-plugin-webrtc-video/releases/tag/0.1.0
