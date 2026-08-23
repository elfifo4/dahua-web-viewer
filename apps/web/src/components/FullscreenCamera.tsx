import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, Maximize, Volume2, VolumeX, ZoomIn } from "lucide-react";
import type { ChannelSummary } from "../lib/api";
import { api } from "../lib/api";
import { VideoPlayer } from "./VideoPlayer";

type Quality = "main" | "sub";

/**
 * Single-camera view: main stream (or sub when the device can't decode it),
 * wheel/drag zoom & pan, audio toggle, snapshot download, native fullscreen.
 */
export function FullscreenCamera({
  channel,
  channelIds,
}: {
  channel: ChannelSummary;
  channelIds: number[];
}) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  // Browser codec capability reports are not sufficient for H.265 WebRTC:
  // Chromium can advertise/accept HEVC while never producing a decoded frame.
  // Start with the H.264 compatibility stream whenever main is HEVC. Users can
  // still opt into the main stream explicitly with the HD button.
  const [quality, setQuality] = useState<Quality>(() =>
    channel.encode?.main?.codec.toUpperCase() === "H.265" ? "sub" : "main",
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const move = (direction: 1 | -1) => {
      if (channelIds.length < 2) return;
      const currentIndex = channelIds.indexOf(channel.channel);
      if (currentIndex < 0) return;
      const nextIndex = (currentIndex + direction + channelIds.length) % channelIds.length;
      const nextChannel = channelIds[nextIndex];
      if (nextChannel === undefined) return;
      void navigate({
        to: "/camera/$channel",
        params: { channel: String(nextChannel) },
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [channel.channel, channelIds, navigate]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(5, Math.max(1, zoom - e.deltaY * 0.0025));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1) return;
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const takeSnapshot = async () => {
    // Prefer a DVR-side full-quality JPEG; falls back to a canvas grab of the live frame.
    try {
      const res = await fetch(api.snapshotUrl(channel.channel));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      downloadBlob(await res.blob());
    } catch {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.toBlob((blob) => blob && downloadBlob(blob), "image/jpeg", 0.92);
    }
  };

  const downloadBlob = (blob: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${channel.name.replaceAll(/\s+/g, "_")}_${new Date().toISOString().replaceAll(":", "-")}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const enterNativeFullscreen = () => {
    void stageRef.current?.requestFullscreen?.();
  };

  const active = channel.encode?.[quality];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-ink-dim transition-colors hover:text-ink"
            aria-label="Back to grid"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-sm font-semibold">{channel.name}</h2>
            {active && active.width > 0 && (
              <p className="text-xs text-ink-dim">
                {active.codec} · {active.width}×{active.height} · {active.fps} fps ·{" "}
                {active.bitrateKbps} kbps
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={quality === "main" ? "Full quality (tap for smooth/compatible)" : "Compatibility stream (tap for full quality)"}
            onClick={() => setQuality((q) => (q === "main" ? "sub" : "main"))}
            className="flex h-8 items-center justify-center rounded-lg border border-edge px-2 text-xs font-semibold text-ink-dim transition-colors hover:border-accent/60 hover:text-ink"
          >
            {quality === "main" ? "HD" : "SD"}
          </button>
          <ToolbarButton
            label={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </ToolbarButton>
          <ToolbarButton label="Snapshot" onClick={() => void takeSnapshot()}>
            <Camera className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={`Zoom ${zoom.toFixed(1)}× — double-click to reset`} onClick={resetView}>
            <ZoomIn className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Fullscreen" onClick={enterNativeFullscreen}>
            <Maximize className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative mx-5 mb-5 flex-1 touch-none select-none overflow-hidden rounded-xl border border-edge bg-black"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={resetView}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <div
          className="h-full w-full"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <VideoPlayer
            streamName={channel.streams[quality]}
            muted={muted}
            posterUrl={api.snapshotUrl(channel.channel)}
            className="h-full"
            videoRef={videoRef}
          />
        </div>
        {zoom > 1 && (
          <span className="absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs text-ink-dim">
            {zoom.toFixed(1)}×
          </span>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-ink-dim transition-colors hover:border-accent/60 hover:text-ink"
    >
      {children}
    </button>
  );
}
