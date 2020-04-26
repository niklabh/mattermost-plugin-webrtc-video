# Mattermost WebRTC video/audio call plugin

[![CircleCI](https://circleci.com/gh/niklabh/mattermost-plugin-webrtc-video.svg?style=svg)](https://circleci.com/gh/niklabh/mattermost-plugin-webrtc-video)

This plugin add video call and group audio channel feature to Mattermost. The plugin uses WebRTC
protocol built into the browser, but but you need to provide and configure your
own Signalhub, STUN and TURN servers.


![Webtrc plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

Add ability to do webrtc video call to another user and join a group audio channel. To start the call go to direct message. On top right click video icon. Allow permission to access microphone and camera. Other user will receive a incoming call.

## Usage

Configure stun/turn and signalhub servers setting as mentioned below. To start video call go to direct message and click on the video call button on channel header button on top right:

![Header button screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/header-button.png)

Other user will see a incoming call:

![Header button screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/calling.png)

To join audio channel click on unmute icon on top left. To start listening click on speaker icon.

![Header button screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/voice-channel.png)

# Installation

1. Go to https://github.com/niklabh/mattermost-plugin-webrtc-video/releases to download the latest release file in zip or tar.gz format.
2. Upload the file through **System Console > Plugins > Management**, or manually upload it to the Mattermost server under plugin directory. See [documentation](https://docs.mattermost.com/administration/plugins.html#set-up-guide) for more details.

## Configuration

Please add turn stun and signal hub servers in settings. Go to **System Console > Plugins > GitHub** and add turn/stun and signalhub servers:

publicly available stun servers:
```
stun:stun.l.google.com:19302
stun:stun1.l.google.com:19302
stun:stun2.l.google.com:19302
stun:stun3.l.google.com:19302
stun:stun4.l.google.com:19302
stun:stun01.sipphone.com
stun:stun.ekiga.net
stun:stun.fwdnet.net
stun:stun.ideasip.com
stun:stun.iptel.org
stun:stun.rixtelecom.se
stun:stun.schlund.de
stun:stunserver.org
stun:stun.softjoys.com
stun:stun.voiparound.com
stun:stun.voipbuster.com
stun:stun.voipstunt.com
stun:stun.voxgratia.org
stun:stun.xten.com
```
publicly available turn servers:
```
turn:numb.viagenie.ca
turn:192.158.29.39:3478?transport=udp
turn:192.158.29.39:3478?transport=tcp

url: 'turn:numb.viagenie.ca'	
credential: 'muazkh'	
username: 'webrtc@live.com'	

url: 'turn:192.158.29.39:3478?transport=udp'	
credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA='	
username: '28224511:1379330808'	

url: 'turn:192.158.29.39:3478?transport=tcp'	
credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA='	
username: '28224511:1379330808'
```
publicly available signalhub server
```
https://baatcheet.herokuapp.com
```


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
