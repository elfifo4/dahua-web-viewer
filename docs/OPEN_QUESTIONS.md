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

