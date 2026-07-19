import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

// Load the repo-root .env regardless of the process cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

const envSchema = z.object({
  DVR_HOST: z.string().default("192.168.1.100"),
  DVR_HTTP_PORT: z.coerce.number().int().default(80),
  DVR_RTSP_PORT: z.coerce.number().int().default(554),
  DVR_USER: z.string().default(""),
  DVR_PASS: z.string().default(""),
  DVR_CHANNELS: z.coerce.number().int().min(1).max(64).default(5),
  SERVER_PORT: z.coerce.number().int().default(8080),
  // 127.0.0.1 = this machine only; 0.0.0.0 = every device on the LAN.
  SERVER_HOST: z.string().default("127.0.0.1"),
  GO2RTC_BIN: z.string().default("auto"),
  GO2RTC_API_PORT: z.coerce.number().int().default(1984),
  GO2RTC_WEBRTC_PORT: z.coerce.number().int().default(8555),
});

const env = envSchema.parse(process.env);

export const config = {
  repoRoot,
  runtimeDir: path.join(repoRoot, ".runtime"),
  dvr: {
    host: env.DVR_HOST,
    httpPort: env.DVR_HTTP_PORT,
    rtspPort: env.DVR_RTSP_PORT,
    user: env.DVR_USER,
    pass: env.DVR_PASS,
    channels: env.DVR_CHANNELS,
  },
  server: { port: env.SERVER_PORT, host: env.SERVER_HOST },
  go2rtc: {
    bin: env.GO2RTC_BIN,
    apiPort: env.GO2RTC_API_PORT,
    webrtcPort: env.GO2RTC_WEBRTC_PORT,
    apiBase: `http://127.0.0.1:${env.GO2RTC_API_PORT}`,
  },
} as const;

export const hasCredentials = config.dvr.user !== "" && config.dvr.pass !== "";
