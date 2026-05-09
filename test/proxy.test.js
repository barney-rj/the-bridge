import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import handler, {
  bridgeRuntimeMode,
} from "../api/bridge/[...path].js";
import { forwardedHeaders } from "../api/bridge/runtime/http.js";

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    send(body) {
      this.body = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
    json(payload) {
      this.setHeader("content-type", "application/json");
      this.send(JSON.stringify(payload));
    },
  };
}

function makeRequest({ url = "/api/bridge/me", method = "GET", headers = {}, body = "" } = {}) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.url = url;
  request.method = method;
  request.headers = headers;
  return request;
}

test("forwards only explicit proxy headers and replaces browser authorization", () => {
  const headers = forwardedHeaders({
    host: "localhost:5173",
    authorization: "Bearer browser-token",
    connection: "keep-alive",
    cookie: "session=browser",
    accept: "application/json",
    origin: "https://untrusted.example",
    "x-tenant": ["one", "two"],
    "x-request-id": "request-1",
  }, "dashboard-token");

  assert.deepEqual(headers, {
    accept: "application/json",
    "x-request-id": "request-1",
    authorization: "Bearer dashboard-token",
  });
});

test("selects runtime mode from runtime or legacy API env vars", () => {
  assert.equal(bridgeRuntimeMode({}), "proxy");
  assert.equal(bridgeRuntimeMode({ BRIDGE_RUNTIME_MODE: "mock" }), "mock");
  assert.equal(bridgeRuntimeMode({ BRIDGE_API_MODE: "mock", BRIDGE_DASHBOARD_TOKEN: "token" }), "mock");
});

test("serves deterministic mock bridge API payloads", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  process.env.BRIDGE_RUNTIME_MODE = "mock";
  const response = makeResponse();

  try {
    await handler(makeRequest({ url: "/api/bridge/me" }), response);

    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.me.tenant.id, "bridge-demo");
  } finally {
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
  }
});

test("proxies requests with dashboard token in proxy mode", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.BRIDGE_DASHBOARD_TOKEN;
  const originalClientToken = process.env.BRIDGE_PROXY_CLIENT_TOKEN;
  const originalRuntimeMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalApiMode = process.env.BRIDGE_API_MODE;
  const calls = [];

  process.env.BRIDGE_DASHBOARD_TOKEN = "dashboard-token";
  process.env.BRIDGE_PROXY_CLIENT_TOKEN = "client-token";
  process.env.BRIDGE_RUNTIME_MODE = "proxy";
  delete process.env.BRIDGE_API_MODE;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json", connection: "close" },
    });
  };

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/tasks?limit=1",
      method: "POST",
      headers: {
        authorization: "Bearer browser-token",
        cookie: "session=browser",
        "content-type": "application/json",
        "x-bridge-client-token": "client-token",
        "x-tenant": "tenant-from-browser",
      },
      body: JSON.stringify({ topic: "test" }),
    }), response);

    assert.equal(response.statusCode, 202);
    assert.equal(response.headers["content-type"], "application/json");
    assert.equal(calls[0].url, "https://bridge.patchworks.ai/api/tasks?limit=1");
    assert.equal(calls[0].init.headers.authorization, "Bearer dashboard-token");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
    assert.equal(calls[0].init.headers.cookie, undefined);
    assert.equal(calls[0].init.headers["x-tenant"], undefined);
    assert.equal(calls[0].init.body.toString("utf8"), JSON.stringify({ topic: "test" }));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BRIDGE_DASHBOARD_TOKEN;
    else process.env.BRIDGE_DASHBOARD_TOKEN = originalToken;
    if (originalClientToken === undefined) delete process.env.BRIDGE_PROXY_CLIENT_TOKEN;
    else process.env.BRIDGE_PROXY_CLIENT_TOKEN = originalClientToken;
    if (originalRuntimeMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalRuntimeMode;
    if (originalApiMode === undefined) delete process.env.BRIDGE_API_MODE;
    else process.env.BRIDGE_API_MODE = originalApiMode;
  }
});

test("rejects proxy mode before attaching dispatcher credentials when client auth is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.BRIDGE_DASHBOARD_TOKEN;
  const originalClientToken = process.env.BRIDGE_PROXY_CLIENT_TOKEN;
  const originalRuntimeMode = process.env.BRIDGE_RUNTIME_MODE;
  const calls = [];

  process.env.BRIDGE_DASHBOARD_TOKEN = "dashboard-token";
  process.env.BRIDGE_PROXY_CLIENT_TOKEN = "client-token";
  process.env.BRIDGE_RUNTIME_MODE = "proxy";
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response("{}");
  };

  try {
    const response = makeResponse();
    await handler(makeRequest({ url: "/api/bridge/me", method: "GET" }), response);

    assert.equal(response.statusCode, 401);
    assert.equal(calls.length, 0);
    assert.equal(JSON.parse(response.body).error, "proxy_client_auth_required");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BRIDGE_DASHBOARD_TOKEN;
    else process.env.BRIDGE_DASHBOARD_TOKEN = originalToken;
    if (originalClientToken === undefined) delete process.env.BRIDGE_PROXY_CLIENT_TOKEN;
    else process.env.BRIDGE_PROXY_CLIENT_TOKEN = originalClientToken;
    if (originalRuntimeMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalRuntimeMode;
  }
});
