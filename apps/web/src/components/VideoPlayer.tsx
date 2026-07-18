import { useEffect, useRef, useState } from "react";
import { Loader2, VideoOff } from "lucide-react";
import clsx from "clsx";
import { openStream, type StreamHandle, type StreamPhase } from "../lib/webrtc";

interface VideoPlayerProps {
  streamName: string;
  muted: boolean;
  posterUrl?: string;
  className?: string;
  onPhaseChange?: (phase: StreamPhase) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

/** WebRTC <video> with loading / error overlays and automatic retry. */
export function VideoPlayer({
  streamName,
  muted,
  posterUrl,
  className,
  onPhaseChange,
  videoRef: externalRef,
}: VideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalRef ?? internalRef;
  const [phase, setPhase] = useState<StreamPhase>("connecting");
  const [detail, setDetail] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let handle: StreamHandle | undefined;
    let cancelled = false;

    void openStream(streamName, video, (p, d) => {
      if (cancelled) return;
      setPhase(p);
      setDetail(d);
      onPhaseChange?.(p);
    }).then((h) => {
      if (cancelled) h.close();
      else handle = h;
    });

    return () => {
      cancelled = true;
      handle?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamName, attempt]);

  return (
    <div className={clsx("relative overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        poster={posterUrl}
        className="h-full w-full object-contain"
      />
      {phase === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-7 w-7 animate-spin text-ink-dim" aria-label="Connecting" />
        </div>
      )}
      {phase === "error" && (
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-ink-dim transition-colors hover:text-ink"
        >
          <VideoOff className="h-7 w-7" />
          <span className="text-xs">{detail ?? "Stream unavailable"}</span>
          <span className="rounded border border-edge px-2 py-0.5 text-xs">Retry</span>
        </button>
      )}
    </div>
  );
}
