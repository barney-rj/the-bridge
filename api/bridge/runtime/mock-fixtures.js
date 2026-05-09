const MOCK_NOW = Date.parse("2026-05-09T12:00:00.000Z");

export const mockIdentity = {
  me: {
    tenant: { id: "bridge-demo", name: "Bridge Demo" },
    branch: { id: "managed-runtime", name: "Managed Runtime" },
    requester: { id: "local-dev", name: "Local Developer", role: "operator" },
    scope: {
      team_id: "team-alpha",
      use_case_id: "ops-health",
      coordinator_bus_address: "cowork.managed.orchestrator",
    },
    capabilities: ["tasks:read", "tasks:write", "managed-agents:read"],
  },
};

export const mockTasks = [
  {
    id: "mock-task-1",
    title: "Review managed fleet enrollment",
    status: "acknowledged",
    priority: "high",
    from_agent: "cowork.managed.orchestrator",
    to_agent: "managed.team-alpha.ops-health.ops-analyst",
    created_at: new Date(MOCK_NOW - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-task-2",
    title: "Confirm permission policy defaults",
    status: "pending",
    priority: "medium",
    from_agent: "guardian.managed.outcome-reviewer",
    to_agent: "cowork.managed.orchestrator",
    created_at: new Date(MOCK_NOW - 45 * 60 * 1000).toISOString(),
  },
];

export const mockResources = {
  approvals: {
    approvals: [
      {
        id: "approval-managed-1",
        title: "Enroll ops analyst",
        status: "pending",
        requested_by: "cowork.managed.orchestrator",
      },
    ],
  },
  imports: { imports: [] },
  cases: { cases: [] },
  audit: {
    events: [
      {
        id: "audit-managed-1",
        actor: "bridge-runtime",
        action: "mock_mode_loaded",
        created_at: new Date(MOCK_NOW).toISOString(),
      },
    ],
  },
};
