import { config, hasCredentials } from "../config.js";
import { digestFetch } from "./digest.js";

/**
 * Typed client for the Dahua CGI API (/cgi-bin).
 * Responses are plain-text `key=value` lines, e.g.:
 *   table.ChannelTitle[0].Name=Front Door
 */

const base = `http://${config.dvr.host}:${config.dvr.httpPort}`;

export class CgiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function cgiText(pathAndQuery: string): Promise<string> {
  if (!hasCredentials) throw new CgiError(401, "DVR credentials not configured (.env)");
  const res = await digestFetch(`${base}${pathAndQuery}`, config.dvr.user, config.dvr.pass);
  if (!res.ok) throw new CgiError(res.status, `DVR CGI ${pathAndQuery} → HTTP ${res.status}`);
  return res.text();
}

/** Parse Dahua `key=value` output into a flat map. */
export function parseKeyValues(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0) map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return map;
}

export interface DeviceInfo {
  deviceType: string;
  serialNumber: string;
  softwareVersion: string;
  hardwareVersion: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const [type, serial, version, hardware] = await Promise.all([
    cgiText("/cgi-bin/magicBox.cgi?action=getDeviceType"),
    cgiText("/cgi-bin/magicBox.cgi?action=getSerialNo"),
    cgiText("/cgi-bin/magicBox.cgi?action=getSoftwareVersion"),
    cgiText("/cgi-bin/magicBox.cgi?action=getHardwareVersion"),
  ]);
  return {
    deviceType: parseKeyValues(type).get("type") ?? "unknown",
    serialNumber: parseKeyValues(serial).get("sn") ?? "unknown",
    softwareVersion: parseKeyValues(version).get("version") ?? "unknown",
    hardwareVersion: parseKeyValues(hardware).get("version") ?? "unknown",
  };
}

/** Channel titles as configured on the DVR, index 0 = channel 1. */
export async function getChannelTitles(): Promise<string[]> {
  const text = await cgiText("/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle");
  const map = parseKeyValues(text);
  const titles: string[] = [];
  for (let i = 0; i < config.dvr.channels; i++) {
    titles.push(map.get(`table.ChannelTitle[${i}].Name`) ?? `Camera ${i + 1}`);
  }
  return titles;
}

export interface EncodeInfo {
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
}

/** Encode settings per channel for a given stream (0 = main, 1 = sub). */
export async function getEncodeInfo(subtype: 0 | 1): Promise<EncodeInfo[]> {
  const text = await cgiText("/cgi-bin/configManager.cgi?action=getConfig&name=Encode");
  const map = parseKeyValues(text);
  const streamKey = subtype === 0 ? "MainFormat[0]" : "ExtraFormat[0]";
  const infos: EncodeInfo[] = [];
  for (let i = 0; i < config.dvr.channels; i++) {
    const prefix = `table.Encode[${i}].${streamKey}.Video`;
    const resolution = map.get(`${prefix}.resolution`) ?? "";
    const [w, h] = resolution.split("x").map(Number);
    infos.push({
      codec: map.get(`${prefix}.Compression`) ?? "unknown",
      width: w || 0,
      height: h || 0,
      fps: Number(map.get(`${prefix}.FPS`) ?? 0),
      bitrateKbps: Number(map.get(`${prefix}.BitRate`) ?? 0),
    });
  }
  return infos;
}

export interface StorageInfo {
  name: string;
  state: string;
  totalBytes: number;
  usedBytes: number;
}

export async function getStorageInfo(): Promise<StorageInfo[]> {
  const text = await cgiText("/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo");
  const map = parseKeyValues(text);
  const disks: StorageInfo[] = [];
  for (let i = 0; ; i++) {
    const name = map.get(`list.info[${i}].Name`);
    if (name === undefined) break;
    const total = Number(map.get(`list.info[${i}].Detail[0].TotalBytes`) ?? 0);
    const used = total - Number(map.get(`list.info[${i}].Detail[0].TotalFreeBytes`) ?? 0);
    disks.push({
      name,
      state: map.get(`list.info[${i}].State`) ?? "unknown",
      totalBytes: total,
      usedBytes: used,
    });
  }
  return disks;
}

/** JPEG snapshot straight from the DVR. */
export async function getSnapshot(channel: number): Promise<Buffer> {
  if (!hasCredentials) throw new CgiError(401, "DVR credentials not configured (.env)");
  const res = await digestFetch(
    `${base}/cgi-bin/snapshot.cgi?channel=${channel}`,
    config.dvr.user,
    config.dvr.pass,
  );
  if (!res.ok) throw new CgiError(res.status, `snapshot channel ${channel} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
