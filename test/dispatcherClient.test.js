import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDispatcherContext,
  dispatcherTaskParams,
  normalizeDispatcherIdentity,
  stageForTask,
} from "../src/dispatcherClient.js";

test("normalizes dispatcher identity from nested payloads", () => {
  const identity = normalizeDispatcherIdentity({
    me: {
      tenant: { id: "tenant-1", name: "Tenant One" },
      branch: { slug: "bath", label: "Bath" },
      requester: { email: "ops@example.com", display_name: "Ops Lead", role: "manager" },
      dispatcher: {
        team_id: "team-a",
        use_case_id: "case-intake",
        coordinator_bus_address: "tenant.bath.coordinator",
      },
      capabilities: ["tasks:read"],
    },
  });

  assert.deepEqual(identity.tenant, { id: "tenant-1", name: "Tenant One" });
  assert.deepEqual(identity.branch, { id: "bath", name: "Bath" });
  assert.deepEqual(identity.requester, {
    id: "ops@example.com",
    name: "Ops Lead",
    email: "ops@example.com",
    role: "manager",
  });
  assert.deepEqual(identity.scope, {
    teamId: "team-a",
    useCaseId: "case-intake",
    coordinatorBusAddress: "tenant.bath.coordinator",
  });
  assert.deepEqual(buildDispatcherContext(identity).dispatcher, identity.scope);
});

test("uses dispatcher task limits without leaking identity into query params", () => {
  const params = dispatcherTaskParams({ limit: 12 }, { scope: { teamId: "team-a" } });
  assert.equal(params.toString(), "limit=12");
});

test("maps bus task status to dashboard stages", () => {
  assert.equal(stageForTask({ status: "blocked" }), "blocked");
  assert.equal(stageForTask({ status: "resolved" }), "done");
  assert.equal(stageForTask({ status: "superseded" }), "done");
  assert.equal(stageForTask({ status: "acknowledged" }), "live");
  assert.equal(stageForTask({ status: "in_progress" }), "live");
  assert.equal(stageForTask({ from_agent: "a", to_agent: "b" }), "prep");
  assert.equal(stageForTask({ from_agent: "a", to_agent: "a" }), "intake");
});
