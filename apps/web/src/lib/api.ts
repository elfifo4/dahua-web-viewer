/** Typed client for the local backend API. */

export interface EncodeInfo {
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
}

export interface ChannelSummary {
  channel: number;
  name: string;
  streams: { main: string; sub: string };
  encode?: { main?: EncodeInfo; sub?: EncodeInfo };
}

export interface Health {
  ok: boolean;
  credentialsConfigured: boolean;
  go2rtc: boolean;
}

export interface DeviceInfo {
  deviceType: string;
  serialNumber: string;
  softwareVersion: string;
  hardwareVersion: string;
}

export interface StorageInfo {
  name: string;
  state: string;
  totalBytes: number;
  usedBytes: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => getJson<Health>("/api/health"),
  channels: () => getJson<{ channels: ChannelSummary[] }>("/api/channels"),
  device: () => getJson<{ device: DeviceInfo; storage: StorageInfo[] }>("/api/device"),
  snapshotUrl: (channel: number) => `/api/channels/${channel}/snapshot`,
};
