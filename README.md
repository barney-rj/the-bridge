# The Bridge

The Bridge is a configurable React control-room dashboard. It renders entities, objectives, work queues, approvals, dispatcher identity, imports, cases, audit events, and integration posture from a plain JavaScript config object.

The system has four related surfaces:

- **Dashboard**: the React component exported by `the-bridge`.
- **Harness**: files under `harness/` that define agents, authority, Managed Agents enrollment metadata, and a Postgres/Supabase handoff bus.
- **Managed Agents**: Anthropic-hosted agents, environments, sessions, events, permission policies, webhooks, and multi-agent references created from harness YAML when enrolled.
- **Runtime API**: `/bridge-api` calls from the dashboard. The browser only talks to this boundary; it never calls Anthropic directly.

## What Works Here

- Config-driven dashboard rendering through `<Bridge config={config} />`.
- Static or dispatcher-backed data in `config.data`.
- Mode tabs that choose panel components such as `EntityGrid`, `KanbanBoard`, `LiveTaskBoard`, `TenantIdentityPanel`, `ImportReviewPanel`, `CaseDetailPanel`, `ApprovalQueuePanel`, `AuditTrailPanel`, and `AdminIntegrationSettingsPanel`.
- Dispatcher identity, tasks, imports, cases, approvals, audit events, integrations, and agent roster polling through `config.dispatcher`.
- Same-origin runtime boundary at `/bridge-api` with `mock`, `proxy`, and `managed` modes.
- Local mock API mode for development when no dispatcher token is configured.
- Harness docs, templates, bus schema, and examples for manual Claude sessions and Managed Agents enrollment.
- `npm run harness:managed:plan` validates `harness/agents.yml` and prints the planned Agent, Environment, Session, and bus mapping.
- `npm run harness:managed:enroll` uses server-side Anthropic credentials to create or update Managed Agents resources, then writes non-secret state to `harness/generated/managed-agents.json`.

The dashboard itself does not run agents, keep Anthropic secrets, stream directly from Anthropic, or persist drag-and-drop Kanban movement. Kanban columns and items are rendered from config or `/bridge-api` projections. "Real-time" in this repo means polling or webhook-refreshed server projections, not a browser socket to the managed runtime.

## Quick Start

```bash
npm run setup
```

The onboarding script installs the dev-server dependencies, creates `examples/my-config.js` from the current estate-agent example when needed, and starts Vite with that file loaded.

Manual start:

```bash
cd examples/dev-server
npm install
npm run dev
```

By default, the dev server serves `/bridge-api` from a deterministic mock so the dashboard can run without `BRIDGE_DASHBOARD_TOKEN` or `ANTHROPIC_API_KEY`.

To proxy to a dispatcher instead:

```bash
BRIDGE_RUNTIME_MODE=proxy \
BRIDGE_DISPATCHER_URL=https://bridge.patchworks.ai \
BRIDGE_DASHBOARD_TOKEN=... \
BRIDGE_PROXY_CLIENT_TOKEN=... \
npm run dev
```

To run the managed boundary locally after enrollment:

```bash
npm run harness:managed:plan
ANTHROPIC_API_KEY=... npm run harness:managed:enroll
BRIDGE_RUNTIME_MODE=managed \
ANTHROPIC_API_KEY=... \
BRIDGE_CLIENT_TOKEN=... \
npm run dev
```

For local managed mode, the Vite middleware injects `BRIDGE_CLIENT_TOKEN` or `BRIDGE_MANAGED_CLIENT_TOKEN` into same-process `/bridge-api` calls. Do not expose that token in browser config. In deployed mode, put The Bridge behind an authenticated same-origin app or gateway that adds the trusted client header before the API handler runs.

## Library Usage

```jsx
import React from "react";
import { Bridge, defaultTheme } from "the-bridge";

const config = {
  title: "#MY_CONTROL_ROOM",
  subtitle: "Operations cockpit",
  theme: defaultTheme,
  data: {
    entities: [
      {
        id: "coordinator",
        name: "Coordinator",
        tier: "T0",
        role: "Owns triage and routing",
        status: "active",
        healthState: "G",
      },
    ],
    objectives: [
      {
        id: "ship",
        code: "SHIP",
        name: "Ship priority work",
        progress: 65,
        healthState: "Gr",
      },
    ],
    kanban: [
      { id: "intake", label: "Intake" },
      { id: "live", label: "Live" },
      { id: "done", label: "Done" },
    ],
    backlog: [
      {
        id: "task-1",
        topic: "Prepare launch checklist",
        stage: "live",
        priority: "high",
        owner: "coordinator",
      },
    ],
  },
  modes: [
    {
      id: "ops",
      label: "OPS",
      tabs: [
        { id: "team", label: "Team", panel: "EntityGrid" },
        { id: "work", label: "Work", panel: "KanbanBoard" },
      ],
    },
  ],
};

export default function App() {
  return <Bridge config={config} />;
}
```

Import from the package root:

```js
import { Bridge, createTheme, defaultTheme } from "the-bridge";
import { fetchDispatcherIdentity } from "the-bridge/dispatcherClient";
```

## Config Shape

The current dashboard shape is:

```js
{
  title: string,
  subtitle?: string,
  theme?: object,
  dispatcher?: {
    proxyBase?: string,        // defaults to "/bridge-api"
    pollIntervalMs?: number,   // defaults to 15000
    limit?: number,            // defaults to 75
    credentials?: "same-origin" | "include" | "omit"
  },
  taskTemplates?: Array<object>,
  modes?: Array<{
    id: string,
    label: string,
    subtitle?: string,
    tabs?: Array<{ id: string, label: string, panel: string }>,
    stats?: Array<{ label: string, value: string | number, color?: string }>,
    crew?: Array<object>
  }>,
  data: {
    entities?: Array<object>,
    objectives?: Array<object>,
    backlog?: Array<object>,
    tasks?: Array<object>,
    kanban?: Array<object>,
    capabilities?: Array<object>,
    patterns?: Array<object>,
    integrations?: Array<object>,
    tenant?: object,
    branch?: object,
    requester?: object,
    importReviews?: Array<object>,
    cases?: Array<object>,
    approvals?: Array<object>,
    auditEvents?: Array<object>,
    adminIntegrations?: Array<object>,
    outcomes?: Array<object>,
    quadrants?: Array<object>
  }
}
```

See `src/types.js` and `examples/estate-agent-config.js` for the full documented shape.

## Runtime API

When `config.dispatcher` is present, the dashboard calls:

- `GET /bridge-api/me`
- `GET /bridge-api/tasks`
- `POST /bridge-api/tasks`
- `GET /bridge-api/imports`
- `POST /bridge-api/imports`
- `GET /bridge-api/cases`
- `GET /bridge-api/approvals`
- `PATCH /bridge-api/approvals/:id`
- `GET /bridge-api/audit-events`
- `GET /bridge-api/integrations`
- `GET /bridge-api/agent-roster`

`BRIDGE_RUNTIME_MODE` controls the server-side behavior:

- `mock`: deterministic local payloads for onboarding, demos, and tests.
- `proxy`: forwards to `BRIDGE_DISPATCHER_URL` and injects `BRIDGE_DASHBOARD_TOKEN` as the upstream bearer token. Public deployments should set `BRIDGE_PROXY_CLIENT_TOKEN` behind an authenticated same-origin app or gateway that adds the trusted client header before the API handler runs. Browser cookies, browser authorization, tenant spoofing headers, host, and hop-by-hop headers are not forwarded.
- `managed`: serves dashboard projections from `harness/generated/managed-agents.json`, creates Anthropic Managed Agents sessions for `POST /bridge-api/tasks`, sends the first `user.message`, and accepts webhook updates. This mode requires `ANTHROPIC_API_KEY` on the server for task creation, `BRIDGE_MANAGED_CLIENT_TOKEN` or `BRIDGE_CLIENT_TOKEN` before mutating endpoints spend server credentials, and `ANTHROPIC_WEBHOOK_SIGNING_KEY` or `BRIDGE_ANTHROPIC_WEBHOOK_SECRET` for webhook intake. Local demos can explicitly set `BRIDGE_ALLOW_UNAUTHENTICATED_MANAGED=true`.

The Vite dev server uses mock mode automatically when no dashboard token is configured; the deployed API defaults to proxy mode unless `BRIDGE_RUNTIME_MODE` or the legacy `BRIDGE_API_MODE` is set.

## Harness

The harness is an onboarding and coordination scaffold, not the dashboard renderer:

- `harness/agents.yml` describes agents, authority boundaries, objectives, and bus addresses.
- `harness/bus-schema.sql` defines the Postgres/Supabase handoff bus.
- `harness/templates/` contains per-agent instruction templates.
- `harness/BOOT_PROMPT.md` is a copy-paste bootstrap prompt for Claude.
- `harness/examples/managed-fleet.yml` shows Managed Agents metadata.

Managed Agents enrollment follows Anthropic's Agent, Environment, Session, Events, Permission Policy, Webhook, and Multiagent concepts. The plan command writes placeholders such as `agent_id`, `version`, and `env_id` without API calls; the enroll command replaces them with returned non-secret IDs. API keys, vault credentials, transcripts, and webhook secrets are never written to `harness/generated/managed-agents.json`.

## Tests

```bash
npm test
```

The tests are pure Node tests and do not require `ANTHROPIC_API_KEY`.

## License

MIT
