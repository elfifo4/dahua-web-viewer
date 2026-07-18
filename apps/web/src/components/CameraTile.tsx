import { useState } from "react";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import type { ChannelSummary } from "../lib/api";
import { api } from "../lib/api";
import type { StreamPhase } from "../lib/webrtc";
import { VideoPlayer } from "./VideoPlayer";

const phaseStyles: Record<StreamPhase, { dot: string; label: string }> = {
  connecting: { dot: "bg-warn", label: "Connecting" },
  playing: { dot: "bg-ok", label: "Live" },
  error: { dot: "bg-err", label: "Offline" },
};

/** Grid tile: sub-stream video, camera name, connection state. */
export function CameraTile({ channel }: { channel: ChannelSummary }) {
  const [phase, setPhase] = useState<StreamPhase>("connecting");
  const state = phaseStyles[phase];

  return (
    <Link
      to="/camera/$channel"
      params={{ channel: String(channel.channel) }}
      className="group relative block overflow-hidden rounded-xl border border-edge bg-panel transition-colors hover:border-accent/60"
    >
      <VideoPlayer
        streamName={channel.streams.sub}
        muted
        posterUrl={api.snapshotUrl(channel.channel)}
        className="aspect-video"
        onPhaseChange={setPhase}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
        <span className="text-sm font-medium drop-shadow">{channel.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-dim">
          <span className={clsx("h-2 w-2 rounded-full", state.dot)} />
          {state.label}
        </span>
      </div>
    </Link>
  );
}
