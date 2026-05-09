import { bridgeRequestPath, readJsonBody, sendJson, sendMethodNotAllowed } from "./http.js";
import { mockIdentity, mockResources, mockTasks } from "./mock-fixtures.js";

export async function handleMockRuntime(request, response) {
  const { pathname } = bridgeRequestPath(request);
  const segments = pathname.split("/").filter(Boolean);
  const resource = segments[0] || "me";

  if (request.method === "GET" && resource === "me") {
    sendJson(response, 200, mockIdentity);
    return;
  }

  if (request.method === "GET" && resource === "tasks") {
    sendJson(response, 200, { tasks: mockTasks });
    return;
  }

  if (request.method === "POST" && resource === "tasks") {
    const input = await readJsonBody(request);
    sendJson(response, 201, {
      task: {
        ...input,
        id: `mock-task-${Date.now()}`,
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });
    return;
  }

  if (request.method === "POST" && resource === "imports") {
    const input = await readJsonBody(request);
    sendJson(response, 201, { import: { ...input, id: `mock-import-${Date.now()}`, status: "accepted" } });
    return;
  }

  if (request.method === "PATCH" && resource === "approvals") {
    const input = await readJsonBody(request);
    sendJson(response, 200, { approval: { ...input, id: segments[1], status: input.decision || "decided" } });
    return;
  }

  if (request.method === "GET" && mockResources[resource]) {
    sendJson(response, 200, mockResources[resource]);
    return;
  }

  if (request.method !== "GET") {
    sendMethodNotAllowed(response);
    return;
  }

  sendJson(response, 404, { error: "mock_fixture_not_found", resource });
}
