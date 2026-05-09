import {
  bridgeRequestPath,
  forwardedHeaders,
  forwardedResponseHeaders,
  readBody,
  requireProxyClientAuth,
  sendJson,
} from "./http.js";

const DEFAULT_DISPATCHER_URL = "https://bridge.patchworks.ai";
const ALLOWED_PROXY_METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"]);

export async function handleProxyRuntime(request, response) {
  const clientAuth = requireProxyClientAuth(request);
  if (!clientAuth.ok) {
    sendJson(response, clientAuth.status, clientAuth.payload);
    return;
  }

  if (!ALLOWED_PROXY_METHODS.has(request.method)) {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const dashboardToken = process.env.BRIDGE_DASHBOARD_TOKEN;
  if (!dashboardToken) {
    response.status(500).json({ error: "BRIDGE_DASHBOARD_TOKEN is not configured" });
    return;
  }

  const dispatcherUrl = process.env.BRIDGE_DISPATCHER_URL || DEFAULT_DISPATCHER_URL;
  const { pathname, search } = bridgeRequestPath(request);
  const targetUrl = new URL(`/api${pathname}${search}`, dispatcherUrl);
  const headers = forwardedHeaders(request.headers, dashboardToken);
  let body;
  try {
    body = request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.code || "invalid_request", message: error.message });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    sendJson(response, 502, { error: "dispatcher_unavailable", message: error.message });
    return;
  }

  response.status(upstream.status);
  for (const [key, value] of Object.entries(forwardedResponseHeaders(upstream.headers))) {
    response.setHeader(key, value);
  }
  response.send(Buffer.from(await upstream.arrayBuffer()));
}
