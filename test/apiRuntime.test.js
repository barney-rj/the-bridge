import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import handler from "../api/bridge/[...path].js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = path.join(REPO_ROOT, "harness/generated/managed-agents.json");
const STATE_DIR = path.dirname(STATE_FILE);
const CLIENT_TOKEN = "client-token";

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

function preserveManagedStateFile() {
  const dirExisted = fs.existsSync(STATE_DIR);
  const fileExisted = fs.existsSync(STATE_FILE);
  const contents = fileExisted ? fs.readFileSync(STATE_FILE) : undefined;

  return () => {
    if (fileExisted) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, contents);
    } else {
      fs.rmSync(STATE_FILE, { force: true });
    }

    if (!dirExisted) {
      try {
        fs.rmdirSync(STATE_DIR);
      } catch {
        // Another test or local process created content in the directory; keep it.
      }
    }
  };
}

function writeManagedState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

test("managed mode refuses task creation when server Managed Agents secret is missing", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalClientToken = process.env.BRIDGE_CLIENT_TOKEN;
  const restoreState = preserveManagedStateFile();
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.BRIDGE_CLIENT_TOKEN = CLIENT_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  writeManagedState({
    schema_version: "managed-agents.v1",
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      bus_address: "managed.team.ops.analyst",
      team_id: "team",
      use_case_id: "ops",
      agent_id: "agent_123",
      env_id: "env_123",
      status: "enrolled",
    }],
  });

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/tasks",
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-client-token": CLIENT_TOKEN },
      body: JSON.stringify({ title: "Check handover queue" }),
    }), response);

    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).error, "managed_runtime_unavailable");
  } finally {
    restoreState();
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
    if (originalClientToken === undefined) delete process.env.BRIDGE_CLIENT_TOKEN;
    else process.env.BRIDGE_CLIENT_TOKEN = originalClientToken;
  }
});

test("managed mode rejects mutating endpoints when client auth is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalClientToken = process.env.BRIDGE_CLIENT_TOKEN;
  const restoreState = preserveManagedStateFile();
  const calls = [];

  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.BRIDGE_CLIENT_TOKEN = CLIENT_TOKEN;
  writeManagedState({
    schema_version: "managed-agents.v1",
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      bus_address: "managed.team.ops.analyst",
      team_id: "team",
      use_case_id: "ops",
      agent_id: "agent_123",
      env_id: "env_123",
      status: "enrolled",
    }],
  });
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response("{}");
  };

  try {
    const cases = [
      { url: "/api/bridge/tasks", method: "POST", body: { title: "Check handover queue" } },
      { url: "/api/bridge/imports", method: "POST", body: { entity: "contacts", rows: [] } },
      { url: "/api/bridge/approvals/app-1", method: "PATCH", body: { decision: "approved" } },
    ];

    for (const testCase of cases) {
      const response = makeResponse();
      await handler(makeRequest({
        url: testCase.url,
        method: testCase.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(testCase.body),
      }), response);

      assert.equal(response.statusCode, 401, testCase.url);
      assert.equal(JSON.parse(response.body).error, "managed_client_auth_required");
    }

    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreState();
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
    if (originalClientToken === undefined) delete process.env.BRIDGE_CLIENT_TOKEN;
    else process.env.BRIDGE_CLIENT_TOKEN = originalClientToken;
  }
});

test("managed webhooks reject invalid signatures", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalSecret = process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = "webhook-secret";

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/webhooks/anthropic",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": "sha256=bad",
      },
      body: JSON.stringify({ id: "evt_bad" }),
    }), response);

    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, "webhook_signature_invalid");
  } finally {
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalSecret === undefined) delete process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
    else process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = originalSecret;
  }
});

test("managed webhooks dedupe event ids after signature verification", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalSecret = process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
  const secret = "webhook-secret";
  const body = JSON.stringify({ id: `evt_${Date.now()}`, session_id: "session_123", type: "session.updated" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = secret;

  try {
    const first = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/webhooks/anthropic",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-anthropic-timestamp": timestamp,
        "x-webhook-signature": `sha256=${signature}`,
      },
      body,
    }), first);

    const second = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/webhooks/anthropic",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-anthropic-timestamp": timestamp,
        "x-webhook-signature": `sha256=${signature}`,
      },
      body,
    }), second);

    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 202);
    assert.equal(JSON.parse(second.body).deduped, true);
  } finally {
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalSecret === undefined) delete process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
    else process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = originalSecret;
  }
});

test("managed webhooks reject signatures without timestamp freshness input", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalSecret = process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
  const secret = "webhook-secret";
  const body = JSON.stringify({ id: `evt_missing_ts_${Date.now()}`, session_id: "session_123", type: "session.updated" });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = secret;

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/webhooks/anthropic",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": `sha256=${signature}`,
      },
      body,
    }), response);

    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, "webhook_signature_invalid");
  } finally {
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalSecret === undefined) delete process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
    else process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = originalSecret;
  }
});

test("managed webhooks reject stale timestamped signatures", async () => {
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalSecret = process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
  const secret = "webhook-secret";
  const body = JSON.stringify({ id: `evt_stale_${Date.now()}`, session_id: "session_123", type: "session.updated" });
  const timestamp = String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = secret;

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/webhooks/anthropic",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-anthropic-timestamp": timestamp,
        "x-webhook-signature": `sha256=${signature}`,
      },
      body,
    }), response);

    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, "webhook_signature_invalid");
  } finally {
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalSecret === undefined) delete process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
    else process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET = originalSecret;
  }
});

test("managed mode finds repo-root state when cwd is the Vite dev-server directory", async () => {
  const originalCwd = process.cwd();
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const restoreState = preserveManagedStateFile();
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  writeManagedState({
    schema_version: "managed-agents.v1",
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      bus_address: "managed.team.ops.analyst",
      team_id: "team",
      use_case_id: "ops",
      agent_id: "agent_123",
      env_id: "env_123",
      status: "enrolled",
    }],
  });

  try {
    process.chdir(path.join(REPO_ROOT, "examples/dev-server"));
    const response = makeResponse();
    await handler(makeRequest({ url: "/api/bridge/managed-agents" }), response);

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).agents[0].agent_id, "agent_123");
  } finally {
    process.chdir(originalCwd);
    restoreState();
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
  }
});

test("managed mode creates a session, sends a user event, and returns task mapping", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalClientToken = process.env.BRIDGE_CLIENT_TOKEN;
  const restoreState = preserveManagedStateFile();
  const calls = [];
  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.BRIDGE_CLIENT_TOKEN = CLIENT_TOKEN;
  writeManagedState({
    schema_version: "managed-agents.v1",
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      bus_address: "managed.team.ops.analyst",
      team_id: "team",
      use_case_id: "ops",
      agent_id: "agent_123",
      env_id: "env_123",
      status: "enrolled",
    }],
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(String(url).endsWith("/events")
      ? { ok: true }
      : { id: "session_123", status: "idle" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/tasks",
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-client-token": CLIENT_TOKEN },
      body: JSON.stringify({ title: "Check handover queue", body: "Review the queue." }),
    }), response);

    assert.equal(response.statusCode, 202);
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/sessions");
    assert.deepEqual(calls[0].body.agent, "agent_123");
    assert.equal(calls[0].body.environment_id, "env_123");
    assert.equal(calls[1].url, "https://api.anthropic.com/v1/sessions/session_123/events");
    assert.equal(calls[1].body.events[0].type, "user.message");
    assert.equal(calls[1].body.events[0].content[0].text, "Review the queue.");
    assert.equal(JSON.parse(response.body).task.metadata.managed_session_id, "session_123");
  } finally {
    globalThis.fetch = originalFetch;
    restoreState();
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
    if (originalClientToken === undefined) delete process.env.BRIDGE_CLIENT_TOKEN;
    else process.env.BRIDGE_CLIENT_TOKEN = originalClientToken;
  }
});

test("managed task creation rejects explicit assignee misses before creating a session", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.BRIDGE_RUNTIME_MODE;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalClientToken = process.env.BRIDGE_CLIENT_TOKEN;
  const restoreState = preserveManagedStateFile();
  const calls = [];

  process.env.BRIDGE_RUNTIME_MODE = "managed";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.BRIDGE_CLIENT_TOKEN = CLIENT_TOKEN;
  writeManagedState({
    schema_version: "managed-agents.v1",
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      bus_address: "managed.team.ops.analyst",
      team_id: "team",
      use_case_id: "ops",
      agent_id: "agent_123",
      env_id: "env_123",
      status: "enrolled",
    }],
  });
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response("{}");
  };

  try {
    const response = makeResponse();
    await handler(makeRequest({
      url: "/api/bridge/tasks",
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-client-token": CLIENT_TOKEN },
      body: JSON.stringify({ title: "Check handover queue", to_agent: "managed.team.ops.missing" }),
    }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error, "managed_assignee_not_found");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreState();
    if (originalMode === undefined) delete process.env.BRIDGE_RUNTIME_MODE;
    else process.env.BRIDGE_RUNTIME_MODE = originalMode;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
    if (originalClientToken === undefined) delete process.env.BRIDGE_CLIENT_TOKEN;
    else process.env.BRIDGE_CLIENT_TOKEN = originalClientToken;
  }
});
