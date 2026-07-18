/**
 * Minimal WHEP-style WebRTC client for go2rtc, via the backend proxy.
 * go2rtc answers a complete (non-trickle) SDP, so we wait for ICE
 * gathering to finish before posting the offer.
 */

export type StreamPhase = "connecting" | "playing" | "error";

export interface StreamHandle {
  close(): void;
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

export async function openStream(
  streamName: string,
  video: HTMLVideoElement,
  onPhase: (phase: StreamPhase, detail?: string) => void,
): Promise<StreamHandle> {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const remote = new MediaStream();
  pc.addEventListener("track", (ev) => {
    remote.addTrack(ev.track);
    if (video.srcObject !== remote) video.srcObject = remote;
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") onPhase("playing");
    else if (pc.connectionState === "failed" || pc.connectionState === "disconnected")
      onPhase("error", `connection ${pc.connectionState}`);
  });

  onPhase("connecting");
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIceGathering(pc);

    const res = await fetch(`/api/streams/${encodeURIComponent(streamName)}/webrtc`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) {
      throw new Error(
        res.status === 502 ? "Stream engine offline — check credentials" : `Stream unavailable (HTTP ${res.status})`,
      );
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  } catch (err) {
    pc.close();
    onPhase("error", err instanceof Error ? err.message : String(err));
  }

  return {
    close: () => {
      video.srcObject = null;
      pc.close();
    },
  };
}
