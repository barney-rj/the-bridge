const DEFAULT_PROXY_BASE = "/bridge-api";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function appendParam(params, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, String(value));
  }
}

function dispatcherBase(dispatcher = {}) {
  return (dispatcher.proxyBase || DEFAULT_PROXY_BASE).replace(/\/+$/, "");
}

function credentialsMode(dispatcher = {}) {
  return dispatcher.credentials || "same-origin";
}

function sourceFrom(payload = {}) {
  return payload.me || payload.identity || payload.profile || payload;
}

export function normalizeDispatcherIdentity(payload = {}, dispatcher = {}) {
  const source = sourceFrom(payload);
  const tenant = source.tenant || source.org || source.account || source.organization || source.organisation || {};
  const branch = source.branch || source.office || source.location || {};
  const requester = source.requester || source.user || source.principal || source.actor || {};
  const scope = source.scope || source.dispatcher_scope || source.dispatcher || source.context || {};

  const tenantProfile = compactObject({
    id: firstDefined(source.tenant_id, source.tenantId, tenant.id, tenant.slug),
    name: firstDefined(source.tenant_name, source.tenantName, tenant.name, tenant.label),
  });
  const branchProfile = compactObject({
    id: firstDefined(source.branch_id, source.branchId, branch.id, branch.slug),
    name: firstDefined(source.branch_name, source.branchName, branch.name, branch.label),
  });
  const requesterProfile = compactObject({
    id: firstDefined(
      source.requester_id,
      source.requesterId,
      requester.id,
      requester.sub,
      requester.email
    ),
    name: firstDefined(source.requester_name, source.requesterName, requester.name, requester.display_name),
    email: firstDefined(source.requester_email, source.requesterEmail, requester.email),
    role: firstDefined(source.requester_role, source.requesterRole, requester.role),
  });
  const dispatcherScope = compactObject({
    teamId: firstDefined(source.team_id, source.teamId, scope.team_id, scope.teamId),
    useCaseId: firstDefined(source.use_case_id, source.useCaseId, scope.use_case_id, scope.useCaseId),
    coordinatorBusAddress: firstDefined(
      source.coordinator_bus_address,
      source.coordinatorBusAddress,
      scope.coordinator_bus_address,
      scope.coordinatorBusAddress
    ),
  });

  return {
    tenant: tenantProfile,
    branch: branchProfile,
    requester: requesterProfile,
    scope: dispatcherScope,
    context: {
      tenant: tenantProfile,
      branch: branchProfile,
      requester: requesterProfile,
      dispatcher: dispatcherScope,
    },
    capabilities: Array.isArray(source.capabilities) ? source.capabilities : [],
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchDispatcherIdentity(dispatcher = {}) {
  const response = await fetch(`${dispatcherBase(dispatcher)}/me`, {
    headers: { accept: "application/json" },
    credentials: credentialsMode(dispatcher),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Identity API ${response.status}`);
  return normalizeDispatcherIdentity(payload, dispatcher);
}

export function dispatcherTaskParams(dispatcher = {}, identity = null) {
  const params = new URLSearchParams();
  void identity;
  appendParam(params, "limit", dispatcher.limit || 75);
  return params;
}

export async function fetchBridgeTasks(dispatcher = {}, identity = null) {
  const params = dispatcherTaskParams(dispatcher, identity);
  const query = params.toString();
  const response = await fetch(`${dispatcherBase(dispatcher)}/tasks${query ? `?${query}` : ""}`, {
    headers: { accept: "application/json" },
    credentials: credentialsMode(dispatcher),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Task API ${response.status}`);
  return Array.isArray(payload.tasks) ? payload.tasks : [];
}

export function buildDispatcherContext(identity = null) {
  if (!identity) return {};
  return compactObject({
    ...identity.context,
    fetched_at: identity.fetchedAt,
  });
}

export async function submitBridgeTask(dispatcher = {}, task, identity = null) {
  const normalized = identity || normalizeDispatcherIdentity({}, dispatcher);
  const requesterProfile = compactObject({
    requester_name: normalized.requester?.name,
    requester_email: normalized.requester?.email,
  });
  const response = await fetch(`${dispatcherBase(dispatcher)}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: credentialsMode(dispatcher),
    body: JSON.stringify(compactObject({ ...requesterProfile, ...task })),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Task API ${response.status}`);
  return payload;
}

export async function fetchBridgeResource(dispatcher = {}, resource, params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""))
  );
  const suffix = query.toString() ? `/${resource}?${query.toString()}` : `/${resource}`;
  const response = await fetch(`${dispatcherBase(dispatcher)}${suffix}`, {
    headers: { accept: "application/json" },
    credentials: credentialsMode(dispatcher),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Bridge API ${response.status}`);
  return payload;
}

export async function createBridgeImport(dispatcher = {}, input) {
  return mutateBridgeResource(dispatcher, "/imports", "POST", input);
}

export async function decideBridgeApproval(dispatcher = {}, approvalId, decision, decision_note = "") {
  return mutateBridgeResource(dispatcher, `/approvals/${encodeURIComponent(approvalId)}`, "PATCH", {
    decision,
    decision_note,
  });
}

async function mutateBridgeResource(dispatcher = {}, path, method, input) {
  const response = await fetch(`${dispatcherBase(dispatcher)}${path}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: credentialsMode(dispatcher),
    body: JSON.stringify(compactObject(input)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Bridge API ${response.status}`);
  return payload;
}

export function stageForTask(task) {
  if (task?.status === "blocked") return "blocked";
  if (task?.status === "resolved" || task?.status === "superseded") return "done";
  if (task?.status === "acknowledged" || task?.status === "in_progress") return "live";
  if (task?.from_agent && task.from_agent !== task?.to_agent) return "prep";
  return "intake";
}

export function ageLabel(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
