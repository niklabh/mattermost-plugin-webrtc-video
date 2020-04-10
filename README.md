# Mattermost WebRTC video call plugin

[![CircleCI](https://circleci.com/gh/niklabh/mattermost-plugin-webrtc-video.svg?style=svg)](https://circleci.com/gh/niklabh/mattermost-plugin-webrtc-video)

This plugin add video call feature to Mattermost. The plugin uses WebRTC
protocol built into the browser, but but you need to provide and configure your
own Signalhub, STUN and TURN servers.


![Webtrc plugin screenshot](https://github.com/niklabh/mattermost-plugin-webrtc-video/raw/master/assets/screen.jpg)

## Features

Add ability to do webrtc video call to another user. To start the call go to direct message. On top right click video icon. Allow permission to access microphone and camera. Other user will receive a incoming call. 

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
