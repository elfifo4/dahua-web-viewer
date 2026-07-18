import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config, hasCredentials } from "./config.js";
import {
  CgiError,
  getChannelTitles,
  getDeviceInfo,
  getEncodeInfo,
  getSnapshot,
  getStorageInfo,
} from "./dahua/cgi.js";
import { go2rtcAlive, streamName, webrtcOffer } from "./go2rtc/supervisor.js";

const channelParam = z.object({ channel: z.coerce.number().int().min(1).max(64) });

export interface ChannelSummary {
  channel: number;
  name: string;
  streams: { main: string; sub: string };
  encode?: { main?: unknown; sub?: unknown };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    credentialsConfigured: hasCredentials,
    go2rtc: await go2rtcAlive(),
  }));

  app.get("/api/channels", async () => {
    let names: string[] | undefined;
    let encodeMain: unknown[] | undefined;
    let encodeSub: unknown[] | undefined;
    if (hasCredentials) {
      // Best effort: the grid must render even if the CGI calls fail.
      [names, encodeMain, encodeSub] = await Promise.all([
        getChannelTitles().catch(() => undefined),
        getEncodeInfo(0).catch(() => undefined),
        getEncodeInfo(1).catch(() => undefined),
      ]);
    }
    const channels: ChannelSummary[] = [];
    for (let ch = 1; ch <= config.dvr.channels; ch++) {
      channels.push({
        channel: ch,
        name: names?.[ch - 1] ?? `Camera ${ch}`,
        streams: { main: streamName(ch, 0), sub: streamName(ch, 1) },
        encode: { main: encodeMain?.[ch - 1], sub: encodeSub?.[ch - 1] },
      });
    }
    return { channels };
  });

  app.get("/api/device", async (_req, reply) => {
    try {
      const [device, storage] = await Promise.all([getDeviceInfo(), getStorageInfo()]);
      return { device, storage };
    } catch (err) {
      if (err instanceof CgiError) return reply.status(err.status === 401 ? 401 : 502).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/channels/:channel/snapshot", async (req, reply) => {
    const { channel } = channelParam.parse(req.params);
    try {
      const jpeg = await getSnapshot(channel);
      return reply.type("image/jpeg").header("cache-control", "no-store").send(jpeg);
    } catch (err) {
      if (err instanceof CgiError) return reply.status(err.status === 401 ? 401 : 502).send({ error: err.message });
      throw err;
    }
  });

  // WHEP-style SDP exchange proxied to go2rtc (its API is localhost-only).
  app.post<{ Body: string }>("/api/streams/:name/webrtc", async (req, reply) => {
    const name = z.string().regex(/^cam\d+_(main|sub)$/).parse((req.params as { name: string }).name);
    const offer = typeof req.body === "string" ? req.body : "";
    if (!offer.includes("v=0")) return reply.status(400).send({ error: "expected SDP offer body" });
    try {
      const answer = await webrtcOffer(name, offer);
      return reply.type("application/sdp").send(answer);
    } catch (err) {
      return reply.status(502).send({ error: (err as Error).message });
    }
  });
}
