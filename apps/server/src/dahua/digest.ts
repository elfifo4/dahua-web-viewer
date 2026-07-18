import { createHash, randomBytes } from "node:crypto";

/**
 * Minimal HTTP Digest (MD5, qop=auth) client, as required by Dahua's
 * /cgi-bin interface. Node's fetch has no built-in digest support.
 */

interface Challenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function parseChallenge(header: string): Challenge {
  const params: Record<string, string> = {};
  for (const match of header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) {
    params[match[1]!] = match[2] ?? match[3] ?? "";
  }
  if (!params.realm || !params.nonce) {
    throw new Error(`Malformed digest challenge: ${header}`);
  }
  const challenge: Challenge = { realm: params.realm, nonce: params.nonce };
  if (params.qop !== undefined) challenge.qop = params.qop;
  if (params.opaque !== undefined) challenge.opaque = params.opaque;
  if (params.algorithm !== undefined) challenge.algorithm = params.algorithm;
  return challenge;
}

function buildAuthorization(
  challenge: Challenge,
  method: string,
  uri: string,
  user: string,
  pass: string,
): string {
  const ha1 = md5(`${user}:${challenge.realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");

  let response: string;
  const parts = [
    `username="${user}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
  ];

  if (challenge.qop?.includes("auth")) {
    response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
    parts.push(`qop=auth`, `nc=${nc}`, `cnonce="${cnonce}"`);
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }
  parts.push(`response="${response}"`);
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);

  return `Digest ${parts.join(", ")}`;
}

/**
 * fetch() with HTTP Digest authentication: performs the initial request,
 * answers a 401 challenge, and returns the authenticated response.
 */
export async function digestFetch(
  url: string,
  user: string,
  pass: string,
  init: RequestInit = {},
): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 401) return first;

  const challengeHeader = first.headers.get("www-authenticate");
  if (!challengeHeader?.startsWith("Digest")) return first;
  // Discard the 401 body so the connection can be reused.
  await first.arrayBuffer().catch(() => undefined);

  const { pathname, search } = new URL(url);
  const uri = pathname + search;
  const method = init.method ?? "GET";
  const authorization = buildAuthorization(parseChallenge(challengeHeader), method, uri, user, pass);

  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: authorization },
  });
}
