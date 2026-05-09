import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const MANAGED_SCHEMA_VERSION = "managed-agents.v1";
export const DEFAULT_PERMISSION_POLICY = "always_ask";
export const DEFAULT_AGENTS_FILE = "harness/agents.yml";
export const DEFAULT_STATE_FILE = "harness/generated/managed-agents.json";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_VERSION = "2023-06-01";
export const MANAGED_AGENTS_BETA_HEADER = "managed-agents-2026-04-01";

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|authorization|anthropic[_-]?api[_-]?key)/i;
const VALID_TIERS = new Set(["T0", "T1", "T2", "T3", "T4"]);
const VALID_STATUSES = new Set(["active", "staged", "planned", "concept", "gap"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readHarnessDefinition(filePath = DEFAULT_AGENTS_FILE) {
  const source = fs.readFileSync(filePath, "utf8");
  const document = YAML.parseDocument(source, { prettyErrors: true });
  if (document.errors.length) {
    throw new ValidationError(document.errors.map((error) => error.message));
  }
  return document.toJSON();
}

export function loadEnrollmentState(filePath = DEFAULT_STATE_FILE) {
  const resolvedPath = resolveManagedStateFile(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return { schema_version: MANAGED_SCHEMA_VERSION, agents: [] };
  }
  const state = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  if (!state || !Array.isArray(state.agents)) {
    throw new ValidationError([`${resolvedPath} must contain an agents array`]);
  }
  return state;
}

export function writeEnrollmentState(state, filePath = DEFAULT_STATE_FILE) {
  const resolvedPath = resolveManagedStateFile(filePath);
  assertNoSecrets(state, resolvedPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(state, null, 2)}\n`);
}

export function resolveManagedStateFile(filePath = DEFAULT_STATE_FILE) {
  if (path.isAbsolute(filePath)) return filePath;

  const cwdPath = path.resolve(process.cwd(), filePath);
  if (filePath !== DEFAULT_STATE_FILE || fs.existsSync(cwdPath)) return cwdPath;

  return path.resolve(REPO_ROOT, DEFAULT_STATE_FILE);
}

export function validateHarnessDefinition(definition) {
  const errors = [];
  const warnings = [];
  const agents = Array.isArray(definition?.agents) ? definition.agents : [];
  const objectives = new Set((definition?.objectives || []).map((objective) => objective?.id).filter(Boolean));
  const agentIds = new Set();
  const busAddresses = new Set();

  if (!definition || typeof definition !== "object") errors.push("harness definition must be a YAML object");
  if (!Array.isArray(definition?.agents)) errors.push("agents must be an array");

  for (const [index, agent] of agents.entries()) {
    const prefix = `agents[${index}]`;
    if (!agent?.id) errors.push(`${prefix}.id is required`);
    if (agent?.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agent.id)) {
      errors.push(`${prefix}.id must be kebab-case`);
    }
    if (agent?.id && agentIds.has(agent.id)) errors.push(`${prefix}.id "${agent.id}" is duplicated`);
    if (agent?.id) agentIds.add(agent.id);
    for (const field of ["name", "tier", "role", "status", "bus_address", "instructions"]) {
      if (!agent?.[field]) errors.push(`${agent?.id || prefix}.${field} is required`);
    }
    if (agent?.tier && !VALID_TIERS.has(agent.tier)) {
      errors.push(`${agent.id}.tier must be one of ${Array.from(VALID_TIERS).join(", ")}`);
    }
    if (agent?.status && !VALID_STATUSES.has(agent.status)) {
      errors.push(`${agent.id}.status must be one of ${Array.from(VALID_STATUSES).join(", ")}`);
    }
    if (agent?.bus_address && busAddresses.has(agent.bus_address)) {
      errors.push(`${agent.id}.bus_address "${agent.bus_address}" is duplicated`);
    }
    if (agent?.bus_address) busAddresses.add(agent.bus_address);
    for (const objective of asArray(agent?.objectives)) {
      if (objectives.size && !objectives.has(objective)) {
        errors.push(`${agent.id}.objectives references unknown objective "${objective}"`);
      }
    }
    if (agent?.runtime && agent.runtime !== "managed") {
      warnings.push(`${agent.id}.runtime "${agent.runtime}" is not handled by the managed harness commands`);
    }
    if (agent?.runtime === "managed") {
      validateManagedAgent(agent, errors, warnings);
    }
  }

  for (const agent of agents) {
    for (const connection of asArray(agent?.connections)) {
      if (!agentIds.has(connection)) errors.push(`${agent.id}.connections references unknown agent "${connection}"`);
    }
    for (const ref of asArray(agent?.multiagent?.agents)) {
      if (!agentIds.has(ref)) errors.push(`${agent.id}.multiagent.agents references unknown agent "${ref}"`);
    }
  }

  assertNoSecrets(definition, DEFAULT_AGENTS_FILE);
  return { errors, warnings };
}

export function buildManagedPlan(definition, enrollmentState = { agents: [] }) {
  const validation = validateHarnessDefinition(definition);
  if (validation.errors.length) throw new ValidationError(validation.errors, validation.warnings);

  const previousById = indexAgents(enrollmentState.agents);
  const managedAgents = definition.agents
    .filter((agent) => agent.runtime === "managed")
    .map((agent) => plannedAgent(agent, previousById.get(agent.id)));
  const plannedById = indexAgents(managedAgents);

  for (const agent of managedAgents) {
    if (agent.multiagent) {
      agent.multiagent.agents = agent.multiagent.agent_refs.map((id) => resolveAgentReference(id, previousById, plannedById));
    }
  }

  return {
    schema_version: MANAGED_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: DEFAULT_AGENTS_FILE,
    agents: managedAgents,
    warnings: validation.warnings,
  };
}

export function mergeEnrollmentResult(plan, result = {}) {
  const byId = indexAgents(asArray(result.agents));
  const merged = {
    ...plan,
    enrolled_at: new Date().toISOString(),
    agents: plan.agents.map((agent) => {
      const enrolled = byId.get(agent.id) || byId.get(agent.local_id) || {};
      return stripSecretValues({
        ...agent,
        agent_id: firstDefined(enrolled.agent_id, enrolled.managed_agent_id, enrolled.id, agent.agent_id),
        version: firstDefined(enrolled.version, enrolled.version_id, enrolled.agent_version_id, agent.version),
        env_id: firstDefined(enrolled.env_id, enrolled.environment_id, agent.env_id),
        status: firstDefined(enrolled.status, agent.status, "enrolled"),
        dispatcher_ref: firstDefined(enrolled.dispatcher_ref, enrolled.ref),
      });
    }),
    enrollment: stripSecretValues({
      dispatcher_request_id: firstDefined(result.dispatcher_request_id, result.request_id, result.id),
      provider: result.provider,
      status: firstDefined(result.status, "enrolled"),
    }),
  };
  const mergedById = indexAgents(merged.agents);
  for (const agent of merged.agents) {
    if (agent.multiagent?.agent_refs) {
      agent.multiagent.agents = agent.multiagent.agent_refs.map((id) => resolveAgentReference(id, mergedById, mergedById));
    }
  }
  return merged;
}

export async function enrollManagedAgents(plan, options = {}) {
  const mode = options.mode || process.env.BRIDGE_MANAGED_ENROLLMENT_MODE || (
    options.dispatcherUrl || process.env.BRIDGE_MANAGED_ENROLLMENT_URL ? "dispatcher" : "anthropic"
  );
  if (mode === "anthropic") return enrollViaAnthropic(plan, options);
  if (mode === "dispatcher") return enrollViaDispatcher(plan, options);
  throw new Error(`Unsupported managed enrollment mode "${mode}"`);
}

export function buildAnthropicEnvironmentPayload(agent) {
  return compactObject({
    name: agent.bus_namespace || agent.id,
    description: `The Bridge environment for ${agent.name || agent.id}`,
    config: agent.environment_config || {
      type: "cloud",
      networking: {
        type: "limited",
        allowed_hosts: [],
        allow_mcp_servers: false,
        allow_package_managers: false,
      },
    },
    metadata: compactObject({
      bridge_agent_id: agent.id,
      bus_address: agent.bus_address,
      team_id: agent.team_id,
      use_case_id: agent.use_case_id,
      source: "the-bridge-harness",
    }),
  });
}

export function buildPermissionPolicy(agent) {
  const policy = agent.permission_policy || DEFAULT_PERMISSION_POLICY;
  if (typeof policy === "string") return { type: policy };
  return policy;
}

export function buildAnthropicAgentPayload(agent) {
  return compactObject({
    name: agent.name || agent.id,
    description: agent.role,
    model: agent.model,
    system: agent.instructions,
    tools: agent.tools || [
      {
        type: "agent_toolset_20260401",
        default_config: {
          permission_policy: buildPermissionPolicy(agent),
        },
      },
    ],
    metadata: compactObject({
      bridge_agent_id: agent.id,
      bus_address: agent.bus_address,
      team_id: agent.team_id,
      use_case_id: agent.use_case_id,
      source: "the-bridge-harness",
    }),
    multiagent: agent.multiagent
      ? compactObject({
          type: agent.multiagent.type,
          agents: asArray(agent.multiagent.agents)
            .filter((ref) => realManagedId(ref.agent_id))
            .map((ref) => compactObject({
              type: "agent",
              id: ref.agent_id,
              version: realManagedId(ref.version),
            })),
        })
      : undefined,
  });
}

async function enrollViaDispatcher(plan, options = {}) {
  const dispatcherUrl = options.dispatcherUrl || process.env.BRIDGE_MANAGED_ENROLLMENT_URL || process.env.BRIDGE_DISPATCHER_URL;
  const dashboardToken = options.dashboardToken || process.env.BRIDGE_DASHBOARD_TOKEN;
  if (!dispatcherUrl) throw new Error("BRIDGE_DISPATCHER_URL or BRIDGE_MANAGED_ENROLLMENT_URL is required for enrollment");
  if (!dashboardToken) throw new Error("BRIDGE_DASHBOARD_TOKEN is required for enrollment");

  const targetUrl = new URL(options.path || "/api/managed-agents/enroll", dispatcherUrl);
  const response = await (options.fetch || globalThis.fetch)(targetUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${dashboardToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(plan),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Managed enrollment failed with HTTP ${response.status}`);
  }
  return payload;
}

async function enrollViaAnthropic(plan, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for direct Managed Agents enrollment");

  const baseUrl = options.baseUrl || process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL;
  const fetchImpl = options.fetch || globalThis.fetch;
  const enrolledAgents = [];

  for (const agent of asArray(plan.agents)) {
    const existingEnvId = realManagedId(agent.env_id);
    const environment = await anthropicRequest({
      path: existingEnvId ? `/v1/environments/${encodeURIComponent(existingEnvId)}` : "/v1/environments",
      method: "POST",
      body: buildAnthropicEnvironmentPayload(agent),
      apiKey,
      baseUrl,
      fetchImpl,
    });
    const envId = firstDefined(environment.id, environment.environment_id, existingEnvId);
    const agentWithEnvironment = { ...agent, env_id: envId };
    const existingAgentId = realManagedId(agent.agent_id);
    const agentPayload = buildAnthropicAgentPayload(agentWithEnvironment);
    if (existingAgentId && realManagedId(agent.version)) agentPayload.version = agent.version;
    const managedAgent = await anthropicRequest({
      path: existingAgentId ? `/v1/agents/${encodeURIComponent(existingAgentId)}` : "/v1/agents",
      method: "POST",
      body: agentPayload,
      apiKey,
      baseUrl,
      fetchImpl,
    });

    enrolledAgents.push(stripSecretValues({
      id: agent.id,
      agent_id: firstDefined(managedAgent.id, managedAgent.agent_id, existingAgentId),
      version: firstDefined(managedAgent.version, managedAgent.version_id, managedAgent.agent_version_id, agent.version),
      env_id: envId,
      status: firstDefined(managedAgent.status, "enrolled"),
    }));
  }

  return {
    provider: "anthropic",
    status: "enrolled",
    agents: enrolledAgents,
  };
}

async function anthropicRequest({ path: requestPath, method, body, apiKey, baseUrl, fetchImpl }) {
  const response = await fetchImpl(new URL(requestPath, baseUrl), {
    method,
    headers: {
      accept: "application/json",
      "anthropic-beta": MANAGED_AGENTS_BETA_HEADER,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Anthropic Managed Agents request failed with HTTP ${response.status}`);
  }
  return payload;
}

export class ValidationError extends Error {
  constructor(errors, warnings = []) {
    super(errors.join("; "));
    this.name = "ValidationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

function validateManagedAgent(agent, errors, warnings) {
  if (!agent.model) errors.push(`${agent.id}.model is required when runtime is managed`);
  if (!agent.managed?.team_id) errors.push(`${agent.id}.managed.team_id is required when runtime is managed`);
  if (!agent.managed?.use_case_id) errors.push(`${agent.id}.managed.use_case_id is required when runtime is managed`);
  if (agent.managed?.team_id && !isNamespacePart(agent.managed.team_id)) {
    errors.push(`${agent.id}.managed.team_id must be slug-safe and cannot contain "/"`);
  }
  if (agent.managed?.use_case_id && !isNamespacePart(agent.managed.use_case_id)) {
    errors.push(`${agent.id}.managed.use_case_id must be slug-safe and cannot contain "/"`);
  }
  if (agent.managed?.cadence_minutes !== undefined && !isPositiveInteger(agent.managed.cadence_minutes)) {
    errors.push(`${agent.id}.managed.cadence_minutes must be a positive integer`);
  }
  if (agent.outcome?.max_iterations !== undefined && !isPositiveInteger(agent.outcome.max_iterations)) {
    errors.push(`${agent.id}.outcome.max_iterations must be a positive integer`);
  }
  for (const [field, values] of Object.entries({
    "memory.shared": agent.memory?.shared,
    "memory.private": agent.memory?.private,
    "multiagent.agents": agent.multiagent?.agents,
  })) {
    if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string"))) {
      errors.push(`${agent.id}.${field} must be an array of strings`);
    }
  }
  if (!agent.bus_address) errors.push(`${agent.id}.bus_address is required when runtime is managed`);
  if (!agent.managed?.permission_policy && !agent.permission_policy) {
    warnings.push(`${agent.id}.permission_policy omitted; defaulting to ${DEFAULT_PERMISSION_POLICY}`);
  }
}

function plannedAgent(agent, previous = {}) {
  const teamId = agent.managed?.team_id;
  const useCaseId = agent.managed?.use_case_id;
  return stripSecretValues({
    id: agent.id,
    local_id: agent.id,
    name: agent.name,
    role: agent.role,
    status: previous.status || agent.status,
    instructions: agent.instructions,
    bus_address: agent.bus_address,
    runtime: "managed",
    model: agent.model,
    permission_policy: agent.managed?.permission_policy || agent.permission_policy || DEFAULT_PERMISSION_POLICY,
    team_id: teamId,
    use_case_id: useCaseId,
    bus_namespace: `${teamId}/${useCaseId}/${agent.id}`,
    agent_id: previous.agent_id || previous.managed_agent_id || "anthropic-agent-id-placeholder",
    version: previous.version || previous.agent_version_id || "anthropic-agent-version-placeholder",
    env_id: previous.env_id || previous.environment_id || "anthropic-env-id-placeholder",
    environment_config: agent.managed?.environment_config,
    memory_store_ids: {
      shared: asArray(agent.memory?.shared),
      private: asArray(agent.memory?.private),
    },
    vault_ids: asArray(agent.managed?.vault_ids),
    cadence_minutes: agent.managed?.cadence_minutes,
    outcome: compactObject({
      rubric_file: agent.outcome?.rubric_file,
      max_iterations: agent.outcome?.max_iterations,
    }),
    multiagent: agent.multiagent
      ? {
          type: agent.multiagent.type,
          agent_refs: asArray(agent.multiagent.agents),
          agents: [],
        }
      : undefined,
  });
}

function resolveAgentReference(id, previousById, plannedById) {
  const source = previousById.get(id) || plannedById.get(id);
  return compactObject({
    id,
    agent_id: source?.agent_id,
    version: source?.version,
    env_id: source?.env_id,
    bus_address: source?.bus_address,
    resolved: Boolean(source?.agent_id && !String(source.agent_id).includes("placeholder")),
  });
}

function assertNoSecrets(value, label) {
  const paths = [];
  collectSecretPaths(value, [], paths);
  if (paths.length) {
    throw new ValidationError(paths.map((secretPath) => `${label} contains secret-like field "${secretPath}"`));
  }
}

function collectSecretPaths(value, parents, paths) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSecretPaths(item, parents.concat(`[${index}]`), paths));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = parents.concat(key);
    if (SECRET_KEY_PATTERN.test(key) && child !== undefined && child !== null && child !== "") {
      paths.push(nextPath.join("."));
    }
    collectSecretPaths(child, nextPath, paths);
  }
}

function stripSecretValues(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSecretValues);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, child]) => [key, stripSecretValues(child)])
      .filter(([, child]) => child !== undefined && !(Array.isArray(child) && child.length === 0))
  );
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function indexAgents(agents) {
  return new Map(asArray(agents).map((agent) => [agent.id || agent.local_id, agent]).filter(([id]) => id));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function realManagedId(value) {
  return value && !String(value).includes("placeholder") ? value : undefined;
}

function isNamespacePart(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
