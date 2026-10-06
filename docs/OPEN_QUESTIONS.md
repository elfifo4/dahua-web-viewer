# Open Questions

Decisions collected here are intentionally deferred. Resolve them before
implementing the related feature so the trade-offs remain explicit.

## Browser-compatible HD streaming

**Status:** Open

The DVR main streams use H.265 at full resolution. Chromium can negotiate the
codec over WebRTC but does not reliably decode it, resulting in a black or
frozen video. The H.264 sub-stream is stable in browsers but is limited by the
DVR to D1 resolution (`704x576`), so it cannot provide HD.

Choose one of the following approaches:

1. **Change the DVR main streams to H.264 (recommended for simplicity).**
   - HD works directly in browsers without transcoding.
   - Keeps Mac resource usage low and latency minimal.
   - DVR recordings also change to H.264.
   - At the current bitrate, recording quality may be slightly lower than H.265;
     increasing the bitrate would use more disk space.

2. **Transcode H.265 to H.264 on demand on the Mac.**
   - DVR recordings remain H.265.
   - Requires FFmpeg and a new go2rtc transcoding stream.
   - Uses additional CPU/GPU and power while an HD stream is being watched.
   - Adds some latency and operational complexity.

3. **Keep compatibility-only playback.**
   - Remove or disable the HD button for H.265 channels.
   - No DVR changes, transcoding, or extra resource usage.
   - Browser viewing remains limited to `704x576`.

**Decision needed:** Select the preferred balance between recording format,
viewer quality, and Mac resource usage.

## Reserve the DVR address in DHCP

**Status:** Open — recommended

The viewer previously pointed `DVR_HOST` at an address that the router later
assigned to a new printer. The viewer consequently loaded slowly and every
camera appeared offline. Updating `DVR_HOST` to the DVR's current address
restored all five streams.

The Sagemcom F@st 5670 router would not reserve the current address while the
DVR was online: the DHCP form reported that the address was already in use, and
the device-level **Reserve IP** action failed. Complete the reservation when
physical access to the DVR is convenient:

1. Power off the DVR temporarily.
2. In the router, reserve the address currently configured as `DVR_HOST` for
   the DVR shown in the connected-device list.
3. Power the DVR back on and confirm it receives the reserved address.
4. Verify `http://localhost:8787`, device information, and all five live streams.

Do not reserve a different address unless `.env` is updated and the background
service is rebuilt/reloaded at the same time.
