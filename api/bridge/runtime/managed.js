import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ANTHROPIC_VERSION,
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_STATE_FILE,
  loadEnrollmentState,
  MANAGED_AGENTS_BETA_HEADER,
} from "../../../harness/lib/managed-agents.js";
import {
  bridgeRequestPath,
  readBody,
  readJsonBody,
  requireManagedClientAuth,
  sendJson,
  sendMethodNotAllowed,
} from "./http.js";
import { mockResources } from "./mock-fixtures.js";

const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const inMemoryTasks = [];
const seenWebhookEvents = new Set();

export async function handleManagedRuntime(request, response) {
  const state = readManagedState();
  const { pathname } = bridgeRequestPath(request);
  const segments = pathname.split("/").filter(Boolean);
  const resource = segments[0] || "me";
  const readiness = managedReadiness(state);

  if (request.method === "GET" && resource === "me") {
    const firstAgent = state.agents[0] || {};
    sendJson(response, 200, {
      me: {
        tenant: { id: firstAgent.team_id || "managed-local", name: firstAgent.team_id || "Managed Local" },
        branch: { id: firstAgent.use_case_id || "default", name: firstAgent.use_case_id || "Default Use Case" },
        requester: { id: "bridge-runtime", name: "Bridge Runtime", role: "managed" },
        scope: {
          team_id: firstAgent.team_id,
          use_case_id: firstAgent.use_case_id,
          coordinator_bus_address: firstAgent.bus_address,
        },
        runtime: {
          mode: "managed",
          available: readiness.available,
          message: readiness.message,
        },
        capabilities: ["tasks:read", "tasks:write", "managed-agents:read", "webhooks:write"],
      },
    });
    return;
  }

  if (request.method === "GET" && (resource === "agents" || resource === "managed-agents")) {
    sendJson(response, 200, { agents: state.agents, schema_version: state.schema_version });
    return;
  }

  if (request.method === "GET" && resource === "tasks") {
    sendJson(response, 200, { tasks: [...inMemoryTasks, ...tasksFromManagedState(state)] });
    return;
  }

  if (request.method === "POST" && resource === "tasks") {
    if (!authorizeManagedMutation(request, response)) return;
    const input = await readJsonBody(request);
    if (!readiness.available) {
      sendJson(response, 503, { error: "managed_runtime_unavailable", message: readiness.message });
      return;
    }
    try {
      const task = await createManagedSessionTask(state, input);
      inMemoryTasks.unshift(task);
      sendJson(response, 202, { task });
    } catch (error) {
      sendJson(response, error.status || 502, { error: error.code || "managed_session_failed", message: error.message });
    }
    return;
  }

  if (request.method === "POST" && resource === "imports") {
    if (!authorizeManagedMutation(request, response)) return;
    const input = await readJsonBody(request);
    sendJson(response, 202, { import: { ...input, id: `managed-import-${randomUUID()}`, status: "queued" } });
    return;
  }

  if (request.method === "PATCH" && resource === "approvals") {
    if (!authorizeManagedMutation(request, response)) return;
    const input = await readJsonBody(request);
    sendJson(response, 200, { approval: { ...input, id: segments[1], status: input.decision || "decided" } });
    return;
  }

  if (request.method === "GET" && mockResources[resource]) {
    sendJson(response, 200, mockResources[resource]);
    return;
  }

  if (request.method === "POST" && resource === "webhooks") {
    const result = await handleManagedWebhook(request);
    sendJson(response, result.status, result.payload);
    return;
  }

  if (request.method !== "GET") {
    sendMethodNotAllowed(response);
    return;
  }

  sendJson(response, 404, { error: "managed_resource_not_found", resource });
}

function readManagedState() {
  return loadEnrollmentState(process.env.BRIDGE_MANAGED_STATE_FILE || DEFAULT_STATE_FILE);
}

function authorizeManagedMutation(request, response) {
  const clientAuth = requireManagedClientAuth(request);
  if (clientAuth.ok) return true;
  sendJson(response, clientAuth.status, clientAuth.payload);
  return false;
}

function managedReadiness(state) {
  const enrolled = state.agents.find((agent) => isRealManagedId(agent.agent_id) && isRealManagedId(agent.env_id));
  if (!state.agents.length) {
    return {
      available: false,
      message: "No Managed Agents plan is present. Run npm run harness:managed:plan, then enroll or switch BRIDGE_RUNTIME_MODE=mock.",
    };
  }
  if (!enrolled) {
    return {
      available: false,
      message: "Managed Agents are planned but not enrolled. Run npm run harness:managed:enroll or switch BRIDGE_RUNTIME_MODE=mock.",
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      available: false,
      message: "Managed runtime mode needs ANTHROPIC_API_KEY on the server to create sessions.",
    };
  }
  return { available: true, message: "Managed Agents enrollment and server credentials are available." };
}

async function createManagedSessionTask(state, input) {
  const agent = selectManagedAgent(state, input);
  if (!agent) {
    throw runtimeError(
      "managed_assignee_not_found",
      "No enrolled Managed Agent matches the requested assignee.",
      400
    );
  }
  const baseUrl = process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL;
  const session = await anthropicRuntimeRequest("/v1/sessions", {
    body: {
      agent: agent.agent_id,
      environment_id: agent.env_id,
      vault_ids: agent.vault_ids,
      metadata: {
        bridge_task_id: input.id,
        bridge_agent_id: agent.id,
        bus_address: agent.bus_address,
        source: "the-bridge-dashboard",
      },
    },
    baseUrl,
  });
  const sessionId = session.id || session.session_id;
  if (!sessionId) throw new Error("Managed Agents session response did not include a session id.");

  await anthropicRuntimeRequest(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
    body: {
      events: [{
        type: "user.message",
        content: [
          { type: "text", text: taskPrompt(input) },
        ],
      }],
    },
    baseUrl,
  });

  const createdAt = new Date().toISOString();
  return {
    ...input,
    id: input.id || `managed-task-${sessionId}`,
    title: input.title || input.topic || "Managed Agents task",
    status: "queued",
    priority: input.priority || "medium",
    from_agent: input.from_agent || "bridge-dashboard",
    to_agent: input.to_agent || agent.bus_address,
    runtime: "managed",
    created_at: createdAt,
    metadata: {
      ...(input.metadata || {}),
      managed_agent_id: agent.agent_id,
      managed_environment_id: agent.env_id,
      managed_session_id: sessionId,
      managed_session_status: session.status || "created",
    },
  };
}

function selectManagedAgent(state, input) {
  const requested = input.to_agent || input.agent_id || input.assignee || input.agent;
  const enrolled = state.agents.filter((agent) => isRealManagedId(agent.agent_id) && isRealManagedId(agent.env_id));
  if (!requested) return enrolled[0];
  return enrolled.find((agent) => (
    agent.id === requested
    || agent.agent_id === requested
    || agent.bus_address === requested
    || agent.name === requested
  ));
}

async function anthropicRuntimeRequest(requestPath, { body, baseUrl }) {
  const response = await fetch(new URL(requestPath, baseUrl), {
    method: body ? "POST" : "GET",
    headers: {
      accept: "application/json",
      "anthropic-beta": MANAGED_AGENTS_BETA_HEADER,
      "anthropic-version": ANTHROPIC_VERSION,
      ...(body ? { "content-type": "application/json" } : {}),
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Managed Agents API failed with HTTP ${response.status}`);
  }
  return payload;
}

async function handleManagedWebhook(request) {
  const secret = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY || process.env.BRIDGE_ANTHROPIC_WEBHOOK_SECRET;
  if (!secret) {
    return {
      status: 500,
      payload: {
        error: "webhook_secret_not_configured",
        message: "Set ANTHROPIC_WEBHOOK_SIGNING_KEY before enabling Managed Agents webhook intake.",
      },
    };
  }
  const body = await readBody(request);
  if (!verifyWebhookSignature(request.headers, body || Buffer.alloc(0), secret)) {
    return { status: 401, payload: { error: "webhook_signature_invalid" } };
  }
  const event = JSON.parse((body || Buffer.alloc(0)).toString("utf8") || "{}");
  const eventId = event.id || event.event_id;
  if (eventId && seenWebhookEvents.has(eventId)) {
    return { status: 202, payload: { ok: true, deduped: true, event_id: eventId } };
  }
  if (eventId) seenWebhookEvents.add(eventId);
  const currentSession = await fetchWebhookSession(event).catch(() => null);
  applyWebhookProjection(event, currentSession);
  return { status: 202, payload: { ok: true, event_id: eventId } };
}

function verifyWebhookSignature(headers, body, secret) {
  const supplied = normalizeSignature(
    headers["x-webhook-signature"]
    || headers["webhook-signature"]
    || headers["x-anthropic-signature"]
    || headers["anthropic-signature"]
    || headers["x-signature"]
  );
  if (!supplied) return false;
  const timestamp = webhookTimestamp(headers);
  if (!timestamp || !isWebhookTimestampFresh(timestamp)) return false;
  const signedPayload = timestamp ? `${timestamp}.${body.toString("utf8")}` : body;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function webhookTimestamp(headers) {
  return firstHeader(
    headers["x-anthropic-timestamp"]
    || headers["anthropic-timestamp"]
    || headers["webhook-timestamp"]
    || headers["x-webhook-timestamp"]
  );
}

function isWebhookTimestampFresh(timestamp) {
  const timestampMs = parseWebhookTimestamp(timestamp);
  if (!Number.isFinite(timestampMs)) return false;

  const toleranceMs = webhookTimestampToleranceSeconds() * 1000;
  return Math.abs(Date.now() - timestampMs) <= toleranceMs;
}

function parseWebhookTimestamp(timestamp) {
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function webhookTimestampToleranceSeconds() {
  const configured = Number.parseInt(process.env.BRIDGE_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
}

function normalizeSignature(value) {
  const signature = Array.isArray(value) ? value[0] : value;
  if (!signature) return undefined;
  return String(signature).replace(/^sha256=/, "").trim();
}

async function fetchWebhookSession(event) {
  const sessionId = event.data?.type?.startsWith("session.") ? event.data.id : event.session_id || event.data?.session_id;
  if (!sessionId || !process.env.ANTHROPIC_API_KEY) return null;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL;
  return anthropicRuntimeRequest(`/v1/sessions/${encodeURIComponent(sessionId)}`, { baseUrl });
}

function applyWebhookProjection(event, currentSession = null) {
  const sessionId = currentSession?.id || event.session_id || event.session?.id || event.data?.session_id || event.data?.id;
  if (!sessionId) return;
  const task = inMemoryTasks.find((candidate) => candidate.metadata?.managed_session_id === sessionId);
  if (!task) return;
  task.status = currentSession?.status || event.status || event.data?.type || event.type || task.status;
  task.metadata = {
    ...task.metadata,
    last_managed_event_id: event.id || event.event_id,
    last_managed_event_type: event.data?.type || event.type,
    managed_session_status: currentSession?.status || event.status || task.metadata.managed_session_status,
  };
}

function taskPrompt(input) {
  if (input.body) return input.body;
  if (input.prompt) return input.prompt;
  const parts = [input.title, input.topic, input.description].filter(Boolean);
  return parts.length ? parts.join("\n\n") : "Start this Bridge assignment.";
}

function tasksFromManagedState(state) {
  return state.agents.map((agent, index) => ({
    id: `managed-agent-${agent.id || index}`,
    title: `Managed runtime ready: ${agent.name || agent.id}`,
    status: agent.status === "enrolled" ? "acknowledged" : "pending",
    priority: "medium",
    from_agent: "bridge-runtime",
    to_agent: agent.bus_address,
    runtime: "managed",
    created_at: state.enrolled_at || state.generated_at || new Date().toISOString(),
  }));
}

function runtimeError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function firstHeader(value) {
  if (Array.isArray(value)) return value[0];
  return value === undefined ? undefined : String(value);
}

function isRealManagedId(value) {
  return value && !String(value).includes("placeholder");
}
