import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Cctv, HardDrive, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

function formatTb(bytes: number): string {
  return `${(bytes / 1e12).toFixed(2)} TB`;
}

export function Header() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
  const device = useQuery({
    queryKey: ["device"],
    queryFn: api.device,
    enabled: health.data?.credentialsConfigured === true,
    staleTime: 60_000,
    retry: false,
  });

  const disk = device.data?.storage[0];

  return (
    <header className="flex items-center justify-between border-b border-edge px-5 py-3">
      <Link to="/" className="flex items-center gap-2.5">
        <Cctv className="h-5 w-5 text-accent" />
        <h1 className="text-base font-semibold tracking-tight">Camera Wall</h1>
        {device.data && (
          <span className="text-xs text-ink-dim">
            {device.data.device.deviceType} · fw {device.data.device.softwareVersion.split(",")[0]}
          </span>
        )}
      </Link>
      <div className="flex items-center gap-4 text-xs text-ink-dim">
        {disk && (
          <span className="flex items-center gap-1.5" title={`HDD state: ${disk.state}`}>
            <HardDrive className="h-4 w-4" />
            {formatTb(disk.usedBytes)} / {formatTb(disk.totalBytes)}
          </span>
        )}
        {health.data && !health.data.credentialsConfigured && (
          <span className="flex items-center gap-1.5 text-warn">
            <TriangleAlert className="h-4 w-4" />
            No credentials — copy .env.example to .env
          </span>
        )}
        {health.data && (
          <span className="flex items-center gap-1.5">
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                health.data.go2rtc ? "bg-ok" : "bg-err",
              )}
            />
            go2rtc
          </span>
        )}
      </div>
    </header>
  );
}
