# Dahua DVR — Technical Investigation Report (Phase 1)

**Date:** 2026-07-18
**Target:** Dahua XVR @ `192.168.1.100` (home LAN)
**Method:** Live probing from macOS on the same LAN (ping, curl, raw RTSP handshake, ONVIF SOAP).

---

## 1. Executive Summary

The DVR is a **Dahua XVR** (confirmed by its TLS certificate: `Dahua Device XVR CA`) running **recent firmware (web UI build dated 2025-09-29)**. It exposes every interface we need:

| Interface | Status | Auth |
|---|---|---|
| HTTP web UI (port 80) | ✅ Modern HTML5 React app | Dahua login (RPC2) |
| HTTPS (port 443) | ✅ Same UI, self-signed cert | Same |
| RTSP (port 554) | ✅ Responds correctly | Digest (MD5) |
| ONVIF (port 80, `/onvif/*`) | ✅ **Already enabled** | WS-UsernameToken |
| Dahua CGI API (`/cgi-bin/`) | ✅ Present | Digest (MD5) |
| Dahua proprietary TCP 37777 | ✅ Open | Proprietary (used by DMSS/SmartPSS) |

**Camera count:** 5 (ONVIF reports `VideoSources = 5`, one video output, 5 audio sources).

**Recommended architecture:** go2rtc consumes the DVR's RTSP streams and serves **WebRTC** to the browser (no transcoding when streams are H.264). A thin Node backend holds credentials and proxies the Dahua CGI API for snapshots, channel names, device/HDD status. React frontend renders the grid.

---

## 2. HTTP Interface (port 80)

`http://192.168.1.100/` returns **200 OK** with a modern single-page React application (webpack bundles, chunked JS, LESS theming). This is Dahua's current-generation HTML5 web UI — **no browser plugin (NPAPI/ActiveX) required**. Notable headers:

- `Content-Security-Policy: script-src 'self' 'unsafe-inline' 'unsafe-eval'`
- `X-Frame-Options: SAMEORIGIN` — **the DVR UI cannot be embedded in an iframe** from our app. Reuse-by-embedding is off the table; reuse must happen via its APIs (CGI/RTSP/ONVIF).
- `Strict-Transport-Security` present.

Login is required (Dahua RPC2 JSON login at `/RPC2_Login`). The built-in UI provides live view (H.264 over WebSocket + MSE), playback, and full configuration. It is fully usable in Chrome/Safari — our project supplements it with a nicer multi-camera wall, it does not need to replace configuration screens.

## 3. HTTPS (port 443)

Works; serves the identical UI. Certificate is **self-signed**:

```
subject: CN=192.168.1.100, C=CN
issuer:  CN=Dahua Device XVR CA, O=Zhejiang Dahua Technology Co.,Ltd.
valid:   2026-06-27 → 2056-06-20
```

Browsers will warn on direct access. For our app this is irrelevant — the backend talks to the DVR over plain HTTP on the LAN, and the ONVIF capability dump shows TLS 1.1/1.2 are disabled on the ONVIF side anyway. Conclusion: use **HTTP on the LAN** between backend↔DVR; do not route anything through the DVR's HTTPS.

## 4. RTSP (port 554)

The RTSP server answers OPTIONS/DESCRIBE correctly and demands **Digest authentication** (realm `Login to xxxxxxxx…`, MD5). Anonymous access is disabled (good).

Expected URLs (Dahua standard, to be verified with credentials in Phase 1b):

```
Main stream: rtsp://USER:PASS@192.168.1.100:554/cam/realmonitor?channel=N&subtype=0
Sub stream:  rtsp://USER:PASS@192.168.1.100:554/cam/realmonitor?channel=N&subtype=1
```

ONVIF confirms `RTP_RTSP_TCP = true` → **RTSP over TCP interleaved works**, which is exactly what go2rtc prefers (robust on Wi-Fi, no UDP packet loss artifacts).

**Open question (needs credentials):** codec per stream. XVRs commonly record H.264 or H.265:
- **H.264** → WebRTC passthrough, zero transcoding, ~universal browser support.
- **H.265** → WebRTC H.265 only works in Safari/some Chrome builds; fallback is go2rtc MSE (H.265 via HEVC MSE works in Safari + Chrome 108+ on macOS) or switching the DVR encode config to H.264. Sub-streams are almost always H.264.

## 5. ONVIF

**Already enabled — no configuration needed.** `POST /onvif/device_service` answers on port 80. Full capability dump highlights:

- **Media service** (`/onvif/media_service`): up to 72 profiles, RTP/RTSP/TCP streaming → `GetProfiles` + `GetStreamUri` give us authoritative RTSP URLs per channel/stream instead of guessing.
- **PTZ service** (`/onvif/ptz_service`): present at device level (actual support depends on each attached camera).
- **Recording / Search / Replay services**: present → standards-based access to recorded footage, including **RTSP replay of recordings** (`/onvif/replay_service`) — useful for the playback nice-to-have.
- **Events service**: WS-PullPoint supported (motion events, etc.).
- DeviceIO: **5 video sources** → 5-camera layout, not 6.

ONVIF operations beyond `GetSystemDateAndTime`/`GetCapabilities` require authentication (WS-UsernameToken digest), same credentials as the web UI in Dahua's implementation.

## 6. Dahua CGI API (`/cgi-bin/`)

Present and protected by **HTTP Digest** (curl handles this natively with `--digest`). All probed endpoints returned proper `401` challenges (not `404`), confirming the API surface exists:

| Purpose | Endpoint |
|---|---|
| Device type/model | `/cgi-bin/magicBox.cgi?action=getDeviceType`, `getSystemInfo`, `getSoftwareVersion` |
| Channel names | `/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle` |
| Encode settings (codec/res/fps/bitrate) | `/cgi-bin/configManager.cgi?action=getConfig&name=Encode` |
| **Snapshot (JPEG)** | `/cgi-bin/snapshot.cgi?channel=N` |
| Camera online state | `/cgi-bin/api/LogicDeviceManager/getCameraState` (newer fw) / `devVideoInput.cgi` |
| HDD status | `/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo` |
| Recording search | `/cgi-bin/mediaFileFind.cgi` (factory.create → findFile → findNextFile) |
| Recording download/playback | `/cgi-bin/RPC_Loadfile/<path>` or `playback.cgi` |
| PTZ control | `/cgi-bin/ptz.cgi?action=start&code=Left&channel=N…` |
| Network info | `/cgi-bin/netApp.cgi?action=getNetInterfaces` |
| Events (motion) | `/cgi-bin/eventManager.cgi?action=attach&codes=[VideoMotion]` (long-poll multipart) |

This is the richest integration surface and the backbone of our backend.

## 7. Port 37777 (proprietary)

Open. This is the DMSS/SmartPSS binary protocol. We don't need it — everything it offers is reachable via CGI/RTSP/ONVIF. Ignored by design.

## 8. Recommended Architecture

```
Browser (React SPA, dark mode)
   │  HTTP + WebRTC (localhost)
   ▼
Node backend (Fastify + TypeScript)          go2rtc (single binary)
   • holds DVR credentials (.env)      ◄──►    • pulls RTSP from DVR (TCP)
   • Dahua CGI proxy (digest auth)             • serves WebRTC/MSE to browser
   • snapshot proxy                            • zero transcoding for H.264
   • channel/device/HDD API
   │
   ▼
Dahua XVR 192.168.1.100  (RTSP 554 + CGI port 80)
```

- **go2rtc** (MIT, single Go binary, brew-installable) handles RTSP→WebRTC repackaging. No FFmpeg transcoding as long as streams are H.264/AAC(G.711→opus is a trivial audio-only conversion go2rtc does internally when needed).
- **Credentials never reach the browser.** The backend injects digest auth for CGI calls; go2rtc holds the RTSP URL server-side and exposes only stream names. go2rtc's API is bound to localhost/proxied by the backend.
- **Frontend:** React + Vite + TypeScript + TanStack Router/Query + Tailwind + shadcn/ui. 5-camera grid (sub-streams for the wall, main stream on fullscreen), video via WebRTC (`RTCPeerConnection` to go2rtc, using its `webrtc.html` protocol — or the tiny `video-stream.js` web component / plain WHEP).

### Reuse over reimplementation (per requirement)

| Capability | Source | Build or reuse? |
|---|---|---|
| Live streams | DVR RTSP | Reuse (go2rtc repackages only) |
| Stream URLs/profiles | ONVIF Media | Reuse |
| Snapshots | CGI `snapshot.cgi` | Reuse (proxy 1:1) |
| Channel names/state | CGI configManager | Reuse |
| Recording search/playback | CGI mediaFileFind + ONVIF Replay | Reuse (UI on top) |
| PTZ | CGI ptz.cgi | Reuse |
| HDD/device info | CGI storageDevice/magicBox | Reuse |
| Full device configuration | DVR web UI at http://192.168.1.100 | **Link out, don't rebuild** |

## 9. Security Considerations

- LAN-only: backend binds to LAN/localhost; nothing exposed to the internet; no port forwarding.
- Credentials live in `.env` (git-ignored) on the Mac, read only by the backend and injected into go2rtc config at startup.
- Browser never sees `USER:PASS` — no RTSP URLs, no digest secrets client-side.
- go2rtc API + WebRTC bound to the local machine (config `listen` on 127.0.0.1; WebRTC candidates restricted to LAN).
- The DVR's own web UI stays available as the "admin console"; our app requests a least-surface API through the backend.

## 10. Browser Limitations

- Browsers cannot speak RTSP → a repackager (go2rtc) is mandatory.
- WebRTC H.264 is universally supported; **H.265 over WebRTC is not** (Safari yes, Chrome partial). If main streams are H.265: use sub-stream (H.264) for tiles, and MSE-HEVC or DVR-side codec change for fullscreen.
- Autoplay requires muted video (audio enabled on user gesture — matches our "audio toggle" design).
- `X-Frame-Options: SAMEORIGIN` on the DVR blocks iframe embedding of its native UI.

## 11. Alternatives Considered

- **HLS from go2rtc** — works everywhere but 3–6 s latency; WebRTC is sub-second. HLS kept as automatic fallback (go2rtc serves both).
- **MSE over WebSocket (go2rtc)** — ~1 s latency, supports HEVC in Safari/newer Chrome; second fallback and the H.265 escape hatch.
- **Direct DVR WebSocket protocol (what its own web UI uses)** — undocumented, brittle across firmware; rejected.
- **FFmpeg transcoding** — explicitly avoided; only ever needed if a camera were H.265-only *and* MSE unacceptable.
- **Docker** — unnecessary; go2rtc is a single binary (`brew install go2rtc` or direct download).

## 12. Open Items (need DVR credentials)

1. Confirm RTSP URL format and codecs for `subtype=0/1` on all 5 channels (ffprobe/go2rtc probe).
2. Pull channel names, device model, firmware, HDD status via CGI.
3. Verify PTZ support per camera (likely none on fixed analog cams).
4. Verify snapshot endpoint per channel.

## 13. Implementation Plan (Phase 2)

1. **Scaffold** monorepo: `apps/server` (Fastify TS), `apps/web` (Vite React TS), `go2rtc/` (config template), shared `packages/shared` types.
2. **go2rtc setup**: generated `go2rtc.yaml` from `.env` (5 channels × 2 subtypes), launch script; verify WebRTC playback.
3. **Backend**: `/api/channels`, `/api/snapshot/:ch`, `/api/device`, `/api/storage`, digest-auth CGI client, go2rtc supervisor/proxy.
4. **Frontend**: dark dashboard, camera grid (sub-streams), fullscreen view (main stream, zoom/pan, audio toggle, snapshot), connection-state UI.
5. **Nice-to-haves** in order: device/HDD panel → recording search + playback (ONVIF Replay via go2rtc) → PTZ (if supported) → motion-event badges.
6. **Docs**: README with setup, `.env.example`, launch instructions.
