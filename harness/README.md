# The Bridge Harness

The harness is the onboarding and operating scaffold for agent teams that feed The Bridge. It is separate from the React dashboard, and it is the source of truth for Managed Agents enrollment metadata.

## Boundaries

- **Dashboard**: `<Bridge config={config} />` renders the control room.
- **Harness**: this folder defines agents, authority boundaries, prompt files, and a handoff bus schema.
- **Managed Agents**: hosted Anthropic agents, environments, sessions, events, permission policies, webhooks, and multi-agent references created from `runtime: managed` harness entries.
- **Runtime API**: dashboard-facing calls exposed through `/bridge-api`.

The harness CLI can plan enrollment without credentials and can enroll Managed Agents with `ANTHROPIC_API_KEY`. It does not run background workers and it does not store secrets, transcripts, vault credentials, or webhook secrets.

## Folder Contents

```text
harness/
├── README.md
├── BOOT_PROMPT.md
├── agents.yml
├── bus-schema.sql
├── lib/
│   ├── managed-agents.js
│   ├── managed-plan.js
│   └── managed-enroll.js
├── templates/
│   ├── CLAUDE.md.template
│   └── skill.md.template
└── examples/
    ├── startup-ops.yml
    ├── consulting-practice.yml
    └── managed-fleet.yml
```

Generated output is expected under `harness/generated/`, which is not part of the source contract.

## Manual Agent Flow

1. Copy an example to `harness/agents.yml` or edit the existing file.
2. Run `harness/bus-schema.sql` against Postgres or Supabase if you want a shared bus.
3. Paste `harness/BOOT_PROMPT.md` into Claude.
4. Review generated `harness/generated/{agent.id}/CLAUDE.md` files.
5. Start manual Claude sessions with those generated instruction files.
6. Open the dashboard with the generated or hand-written Bridge config.

This flow works without Anthropic Managed Agents credentials.

## Agent Definition

```yaml
agents:
  - id: coordinator
    name: Coordinator
    tier: T0
    role: "Routes work and owns escalation"
    status: active
    bus_address: "team.ops.coordinator"
    tools: [supabase, github]
    objectives: [ship-faster]
    connections: [builder]
    authority:
      autonomous:
        - "Summarize bus status"
      requires_approval:
        - "Change production policy"
    instructions: |
      Poll the bus, triage pending work, and escalate anything outside authority.
```

Required fields:

| Field | Purpose |
| --- | --- |
| `id` | Unique local harness id |
| `name` | Display name |
| `tier` | `T0` through `T4` |
| `role` | One-line responsibility |
| `status` | `active`, `staged`, `planned`, `concept`, or `gap` |
| `bus_address` | Handoff routing address |
| `authority.autonomous` | Actions the agent can take and log without approval |
| `authority.requires_approval` | Actions that require a human decision |
| `instructions` | Operating instructions for the generated prompt |

Anything not explicitly listed under `authority.autonomous` is treated as requiring approval.

## Managed Agents Planning And Enrollment

Add `runtime: managed` only for agents that should be enrolled as Anthropic Managed Agents:

```yaml
agents:
  - id: nightly-analyst
    name: Nightly Analyst
    tier: T2
    role: "Runs scheduled analysis and posts outcomes to the bus"
    status: staged
    runtime: managed
    model: "claude-sonnet-4-5"
    bus_address: "managed.analytics.nightly"
    managed:
      team_id: "team-growth"
      use_case_id: "daily-analysis"
      cadence_minutes: 1440
      environment_config:
        type: cloud
        networking:
          type: limited
          allowed_hosts: []
    memory:
      shared: ["mem_growth_shared"]
      private: ["mem_nightly_analyst"]
    outcome:
      rubric_file: "harness/rubrics/daily-analysis.md"
      max_iterations: 2
    multiagent:
      type: "review"
      agents: ["nightly-analyst", "outcome-reviewer"]
```

Managed planning rules:

- Generate normal `CLAUDE.md` files for every agent, including managed agents.
- Generate `harness/generated/managed-agents.json` only when at least one agent has `runtime: managed`.
- Keep `team_id` and `use_case_id` isolated in `bus_namespace`, environments, and memory-store references.
- Preserve local harness ids in `multiagent.agents`; enrollment resolves those ids into previously enrolled Managed Agent references.
- Require `model` for every `runtime: managed` agent. The harness does not hard-code a model default.
- Default Managed Agents permission policy to `always_ask` unless the YAML explicitly opts into a narrower allow policy.
- Create cloud environments with limited networking by default. Override `managed.environment_config` when the agent needs packages, MCP access, or explicit outbound hosts.
- Use placeholders for `agent_id`, `version`, and `env_id` during planning; replace them with returned non-secret IDs during enrollment.
- Never write API keys, vault credentials, transcripts, or webhook secrets to generated files.

Planning does not make API calls:

```bash
npm run harness:managed:plan
```

Direct enrollment uses Anthropic Managed Agents APIs:

```bash
ANTHROPIC_API_KEY=... npm run harness:managed:enroll
```

For legacy dispatcher bootstrap flows, set `BRIDGE_MANAGED_ENROLLMENT_MODE=dispatcher` with `BRIDGE_MANAGED_ENROLLMENT_URL` or `BRIDGE_DISPATCHER_URL` and `BRIDGE_DASHBOARD_TOKEN`.

The testable planning helper is `harness/lib/managed-agents.js`.

## Runtime API Handoff

The dashboard reads runtime data through `/bridge-api`. In local development this can be mock data. In deployed/proxy mode it forwards to the dispatcher configured by `BRIDGE_DISPATCHER_URL`. In managed mode it reads the generated enrollment state, creates Anthropic sessions for new tasks, sends the first `user.message`, and consumes verified webhooks into dashboard projections.

Managed mode mutations require `BRIDGE_MANAGED_CLIENT_TOKEN` or `BRIDGE_CLIENT_TOKEN` before server-side Anthropic credentials are used. Only use `BRIDGE_ALLOW_UNAUTHENTICATED_MANAGED=true` for isolated local demos.

The runtime boundary provides identity, tasks, imports, cases, approvals, audit events, integrations, and agent roster endpoints. See the root README for the route list.

## Bus Schema

`bus-schema.sql` defines a `handoff` table plus helper views for pending messages and bus health. The intended lifecycle is:

```text
pending -> acknowledged -> in_progress -> resolved
```

Other statuses such as `blocked` and `superseded` can be used when work cannot proceed or has been replaced.

## Decision Authority

The harness permission policy is deliberately conservative:

- Listed autonomous actions can be taken and logged.
- Listed approval actions must be proposed and escalated.
- Unknown actions default to approval required.
- T4 guardian agents should report independently to the human operator.

## Examples

- `examples/startup-ops.yml`: small startup operating team.
- `examples/consulting-practice.yml`: solo consultant support team.
- `examples/managed-fleet.yml`: mixed manual and Managed Agents enrollment metadata.
