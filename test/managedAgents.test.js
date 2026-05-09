import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PERMISSION_POLICY,
  MANAGED_AGENTS_BETA_HEADER,
  ValidationError,
  buildAnthropicAgentPayload,
  buildManagedPlan,
  enrollManagedAgents,
  validateHarnessDefinition,
} from "../harness/lib/managed-agents.js";

test("plans only managed agents with isolated dispatcher namespaces", () => {
  const plan = buildManagedPlan({
    objectives: [{ id: "ops-health" }, { id: "cash" }],
    agents: [
      {
        id: "manual-coordinator",
        name: "Manual Coordinator",
        tier: "T0",
        role: "Coordinates manual sessions",
        status: "active",
        bus_address: "manual.coordinator",
        instructions: "Coordinate manual work.",
      },
      {
        id: "ops-analyst",
        name: "Ops Analyst",
        tier: "T2",
        role: "Reviews operational health",
        status: "staged",
        runtime: "managed",
        model: "claude-sonnet-4-5",
        bus_address: "managed.team-a.ops.analyst",
        managed: {
          team_id: "team-a",
          use_case_id: "ops",
          cadence_minutes: 60,
        },
        memory: {
          shared: ["mem_shared"],
          private: ["mem_ops_analyst"],
        },
        outcome: {
          rubric_file: "harness/rubrics/ops.md",
          max_iterations: 2,
        },
        multiagent: {
          type: "review",
          agents: ["ops-analyst", "guardian"],
        },
        objectives: ["ops-health"],
        instructions: "Review operational health.",
      },
      {
        id: "finance-analyst",
        name: "Finance Analyst",
        tier: "T2",
        role: "Reviews cash forecasts",
        status: "staged",
        runtime: "managed",
        model: "claude-sonnet-4-5",
        bus_address: "managed.team-b.cash.analyst",
        managed: {
          team_id: "team-b",
          use_case_id: "cash",
        },
        objectives: ["cash"],
        instructions: "Review cash forecasts.",
      },
      {
        id: "guardian",
        name: "Guardian",
        tier: "T4",
        role: "Reviews outputs",
        status: "active",
        bus_address: "guardian.managed.outcome-reviewer",
        instructions: "Review managed outputs.",
      },
    ],
  });

  assert.equal(plan.schema_version, "managed-agents.v1");
  assert.equal(plan.agents.length, 2);
  assert.deepEqual(
    plan.agents.map((agent) => agent.bus_namespace),
    ["team-a/ops/ops-analyst", "team-b/cash/finance-analyst"]
  );
  assert.equal(plan.agents[0].agent_id, "anthropic-agent-id-placeholder");
  assert.deepEqual(plan.agents[0].memory_store_ids, {
    shared: ["mem_shared"],
    private: ["mem_ops_analyst"],
  });
  assert.equal(plan.agents[0].permission_policy, DEFAULT_PERMISSION_POLICY);
  assert.deepEqual(
    plan.agents[0].multiagent.agents.map((agent) => agent.id),
    ["ops-analyst", "guardian"]
  );
});

test("rejects managed enrollment planning when tenant scope is missing", () => {
  assert.throws(() => buildManagedPlan({
    agents: [{
      id: "orphan",
      name: "Orphan",
      tier: "T2",
      role: "Missing managed scope",
      status: "staged",
      runtime: "managed",
      model: "claude-sonnet-4-5",
      bus_address: "managed.orphan",
      instructions: "Do work.",
    }],
  }), ValidationError);
});

test("permission policy defaults to always ask when omitted", () => {
  const validation = validateHarnessDefinition({
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      tier: "T2",
      role: "Reviews operational health",
      status: "staged",
      runtime: "managed",
      model: "claude-sonnet-4-5",
      bus_address: "managed.team-a.ops.analyst",
      managed: {
        team_id: "team-a",
        use_case_id: "ops",
      },
      instructions: "Review operational health.",
    }],
  });

  assert.equal(validation.errors.length, 0);
  assert.equal(validation.warnings.length, 1);
  assert.match(validation.warnings[0], new RegExp(DEFAULT_PERMISSION_POLICY));
});

test("generates Anthropic agent payloads with explicit model and permission policy", () => {
  const payload = buildAnthropicAgentPayload({
    id: "ops-analyst",
    name: "Ops Analyst",
    role: "Reviews operational health",
    model: "claude-sonnet-4-5",
    instructions: "Review operational health.",
    env_id: "env_123",
    permission_policy: DEFAULT_PERMISSION_POLICY,
    team_id: "team-a",
    use_case_id: "ops",
    bus_address: "managed.team-a.ops.analyst",
    multiagent: {
      type: "coordinator",
      agents: [{ id: "reviewer", agent_id: "agent_reviewer", version: 2 }],
    },
  });

  assert.equal(payload.model, "claude-sonnet-4-5");
  assert.equal(payload.system, "Review operational health.");
  assert.deepEqual(payload.tools, [{
    type: "agent_toolset_20260401",
    default_config: {
      permission_policy: { type: DEFAULT_PERMISSION_POLICY },
    },
  }]);
  assert.deepEqual(payload.multiagent, {
    type: "coordinator",
    agents: [{ type: "agent", id: "agent_reviewer", version: 2 }],
  });
});

test("direct enrollment uses Anthropic Managed Agents API without persisting secrets", async () => {
  const plan = buildManagedPlan({
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      tier: "T2",
      role: "Reviews operational health",
      status: "staged",
      runtime: "managed",
      model: "claude-sonnet-4-5",
      bus_address: "managed.team-a.ops.analyst",
      managed: {
        team_id: "team-a",
        use_case_id: "ops",
      },
      instructions: "Review operational health.",
    }],
  });
  const calls = [];
  const result = await enrollManagedAgents(plan, {
    mode: "anthropic",
    apiKey: "sk-ant-test",
    baseUrl: "https://api.example.test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const isEnvironment = String(url).endsWith("/v1/environments");
      return new Response(JSON.stringify(isEnvironment
        ? { id: "env_123", status: "ready" }
        : { id: "agent_123", version: "v1", status: "enrolled" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.example.test/v1/environments");
  assert.equal(calls[1].url, "https://api.example.test/v1/agents");
  assert.equal(calls[0].init.headers["anthropic-beta"], MANAGED_AGENTS_BETA_HEADER);
  assert.equal(calls[0].init.headers["x-api-key"], "sk-ant-test");
  assert.equal(JSON.parse(calls[1].init.body).model, "claude-sonnet-4-5");
  assert.equal(JSON.parse(calls[1].init.body).system, "Review operational health.");
  assert.deepEqual(result, {
    provider: "anthropic",
    status: "enrolled",
    agents: [{
      id: "ops-analyst",
      agent_id: "agent_123",
      version: "v1",
      env_id: "env_123",
      status: "enrolled",
    }],
  });
  assert.doesNotMatch(JSON.stringify(result), /sk-ant-test/);
});

test("direct re-enrollment updates existing Anthropic resources with POST", async () => {
  const definition = {
    agents: [{
      id: "ops-analyst",
      name: "Ops Analyst",
      tier: "T2",
      role: "Reviews operational health",
      status: "staged",
      runtime: "managed",
      model: "claude-sonnet-4-5",
      bus_address: "managed.team-a.ops.analyst",
      managed: {
        team_id: "team-a",
        use_case_id: "ops",
      },
      instructions: "Review operational health.",
    }],
  };
  const plan = buildManagedPlan(definition, {
    agents: [{
      id: "ops-analyst",
      agent_id: "agent_existing",
      version: "v1",
      env_id: "env_existing",
      status: "enrolled",
    }],
  });
  const calls = [];

  await enrollManagedAgents(plan, {
    mode: "anthropic",
    apiKey: "sk-ant-test",
    baseUrl: "https://api.example.test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(String(url).includes("/v1/environments/")
        ? { id: "env_existing", status: "ready" }
        : { id: "agent_existing", version: "v2", status: "enrolled" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.example.test/v1/environments/env_existing",
    "https://api.example.test/v1/agents/agent_existing",
  ]);
  assert.deepEqual(calls.map((call) => call.init.method), ["POST", "POST"]);
  assert.equal(JSON.parse(calls[1].init.body).version, "v1");
});
