export const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "x-request-id",
  "x-correlation-id",
  "traceparent",
  "tracestate",
]);

export const FORWARDED_RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-type",
  "etag",
  "x-request-id",
  "x-correlation-id",
]);

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export function bridgeRequestPath(request) {
  const incomingUrl = new URL(request.url, "http://localhost");
  const bridgePath = incomingUrl.pathname
    .replace(/^\/api\/bridge/, "")
    .replace(/^\/bridge-api/, "") || "/";
  return {
    pathname: bridgePath,
    search: incomingUrl.search,
    url: incomingUrl,
  };
}

export function forwardedHeaders(headers, dashboardToken) {
  const next = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (!FORWARDED_REQUEST_HEADERS.has(lower)) continue;
    if (Array.isArray(value)) next[lower] = value.join(", ");
    else if (value !== undefined) next[lower] = String(value);
  }
  next.authorization = `Bearer ${dashboardToken}`;
  next.accept = next.accept || "application/json";
  return next;
}

export function forwardedResponseHeaders(headers) {
  const next = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (FORWARDED_RESPONSE_HEADERS.has(lower) && !HOP_BY_HOP_HEADERS.has(lower)) next[lower] = value;
  });
  return next;
}

export function requireBridgeClientAuth(request, {
  env = process.env,
  allowUnauthenticatedEnv,
  tokenEnvNames = ["BRIDGE_CLIENT_TOKEN"],
  notConfiguredError = "bridge_client_auth_not_configured",
  requiredError = "bridge_client_auth_required",
  notConfiguredMessage = "Set BRIDGE_CLIENT_TOKEN before enabling Bridge runtime mutations.",
  requiredMessage = "Bridge runtime requires a valid client token before server credentials are used.",
} = {}) {
  if (allowUnauthenticatedEnv && env[allowUnauthenticatedEnv] === "true") return { ok: true };

  const expected = firstConfiguredEnv(env, tokenEnvNames);
  if (!expected) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: notConfiguredError,
        message: notConfiguredMessage,
      },
    };
  }

  const supplied = firstHeader(request.headers["x-bridge-client-token"]) || bearerToken(request.headers.authorization);
  if (supplied !== expected) {
    return {
      ok: false,
      status: 401,
      payload: {
        error: requiredError,
        message: requiredMessage,
      },
    };
  }

  const allowedOrigin = env.BRIDGE_ALLOWED_ORIGIN;
  const origin = firstHeader(request.headers.origin);
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return {
      ok: false,
      status: 403,
      payload: {
        error: "origin_not_allowed",
        message: "The request origin is not allowed for Bridge proxy mode.",
      },
    };
  }

  return { ok: true };
}

export function requireProxyClientAuth(request, env = process.env) {
  return requireBridgeClientAuth(request, {
    env,
    allowUnauthenticatedEnv: "BRIDGE_ALLOW_UNAUTHENTICATED_PROXY",
    tokenEnvNames: ["BRIDGE_PROXY_CLIENT_TOKEN", "BRIDGE_CLIENT_TOKEN"],
    notConfiguredError: "proxy_client_auth_not_configured",
    requiredError: "proxy_client_auth_required",
    notConfiguredMessage: "Set BRIDGE_PROXY_CLIENT_TOKEN for proxy mode or use BRIDGE_RUNTIME_MODE=mock locally.",
    requiredMessage: "Proxy mode requires a valid Bridge client token before dispatcher credentials are attached.",
  });
}

export function requireManagedClientAuth(request, env = process.env) {
  return requireBridgeClientAuth(request, {
    env,
    allowUnauthenticatedEnv: "BRIDGE_ALLOW_UNAUTHENTICATED_MANAGED",
    tokenEnvNames: ["BRIDGE_MANAGED_CLIENT_TOKEN", "BRIDGE_CLIENT_TOKEN", "BRIDGE_PROXY_CLIENT_TOKEN"],
    notConfiguredError: "managed_client_auth_not_configured",
    requiredError: "managed_client_auth_required",
    notConfiguredMessage: "Set BRIDGE_CLIENT_TOKEN or BRIDGE_MANAGED_CLIENT_TOKEN before enabling managed runtime mutations.",
    requiredMessage: "Managed runtime requires a valid Bridge client token before Anthropic credentials are used.",
  });
}

export async function readBody(request, maxBytes = maxBodyBytes()) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error(`Request body exceeds ${maxBytes} bytes`);
      error.status = 413;
      error.code = "body_too_large";
      throw error;
    }
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export async function readJsonBody(request) {
  const body = await readBody(request);
  if (!body?.length) return {};
  return JSON.parse(body.toString("utf8"));
}

export function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

export function sendMethodNotAllowed(response) {
  sendJson(response, 405, { error: "method_not_allowed" });
}

function firstHeader(value) {
  if (Array.isArray(value)) return value[0];
  return value === undefined ? undefined : String(value);
}

function bearerToken(value) {
  const header = firstHeader(value);
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function firstConfiguredEnv(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  return undefined;
}

function maxBodyBytes() {
  const configured = Number.parseInt(process.env.BRIDGE_MAX_BODY_BYTES || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BODY_BYTES;
}
