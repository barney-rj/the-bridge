# The Bridge — Agent Harness Boot Prompt

> **What this is:** Copy this entire file and paste it into a new Claude session
> (Claude Code, Cowork, or Chat). Claude will read your `agents.yml`, set up the
> message bus, generate agent instructions, and wire everything into a Bridge
> config. By the end, you'll have a running agent fleet with a control room.

---

## Boot Prompt — paste everything below this line into Claude

You are bootstrapping an agent operating system using The Bridge harness.

### Your mission

Read the agent definition file (`harness/agents.yml` in this repo) and execute
the following steps in order. Do not skip steps. Report progress after each one.

### Step 1 — Parse the agent definitions

Read `harness/agents.yml`. Extract:
- System identity (name, subtitle, bus project ID)
- All objectives (id, name, description, quadrant)
- All agents (id, name, tier, role, status, tools, objectives, connections, authority, bus_address, instructions)
- Optional managed runtime metadata when present (`runtime`, `managed`)

Report: "Found N agents across M tiers, serving P objectives."

### Step 2 — Set up the message bus

If the user has a Supabase project connected:
1. Read `harness/bus-schema.sql`
2. Execute it against the Supabase project using `execute_sql`
3. Verify the `handoff` table exists
4. Verify the `bus_pending` and `bus_health` views exist

If no Supabase project is connected:
1. Tell the user they need a Postgres database for the bus
2. Point them to `harness/bus-schema.sql` to run manually
3. Continue with remaining steps (agents can be set up without the bus running)

Report: "Bus schema deployed" or "Bus schema ready for manual deployment."

### Step 3 — Generate agent instruction files

For each agent in `agents.yml`:
1. Read the template at `harness/templates/CLAUDE.md.template`
2. Fill in the template variables:
   - `{{AGENT_NAME}}` → agent.name
   - `{{BUS_ADDRESS}}` → agent.bus_address
   - `{{TIER}}` → agent.tier
   - `{{ROLE}}` → agent.role
   - `{{STATUS}}` → agent.status
   - `{{INSTRUCTIONS}}` → agent.instructions
   - `{{AUTONOMOUS_LIST}}` → bullet list from agent.authority.autonomous
   - `{{APPROVAL_LIST}}` → bullet list from agent.authority.requires_approval
   - `{{CONNECTIONS}}` → comma-separated list of agent.connections
   - `{{OBJECTIVES}}` → comma-separated list of agent.objectives
3. Write the filled template to `harness/generated/{agent.id}/CLAUDE.md`

Report: "Generated instruction files for N agents."

### Step 4 — Configure optional Anthropic Managed Agents

Check whether any agent has `runtime: managed`.

If no managed agents are defined:
1. Continue with the standard Claude Code flow
2. Do not create managed-agent dispatcher config files
3. Do not remove or rewrite any existing root `CLAUDE.md`

If managed agents are defined:
1. Create `harness/generated/managed-agents.json`
2. Shape it for bridge-dispatcher bootstrap/config handoff, not as a generic
   process-launch spec. Include:
   - `schema_version`
   - one entry per managed agent with local `id`, `bus_address`, `runtime`,
     `model`, `team_id`, `use_case_id`, and isolated `bus_namespace`
   - `agent_id` and `version` placeholders for the Anthropic Managed Agent
     definition that dispatcher/bootstrap will create or resolve
   - `env_id` placeholder for the Anthropic environment assigned to the
     team/use-case boundary
   - `memory_store_ids.shared` and `memory_store_ids.private` placeholders,
     seeded from `memory.shared` and `memory.private` when present
   - optional `vault_ids` placeholders only when the bootstrap workflow has
     scoped credential references available
   - `cadence_minutes` copied from `managed.cadence_minutes` when present
   - `outcome.rubric_file` and `outcome.max_iterations` when present
   - `multiagent.type` and `multiagent.agents`, keeping `agents` as local
     harness agent ids for bridge-dispatcher/bootstrap resolution
3. Preserve team/use-case isolation. Never merge managed agents from different
   `team_id` or `use_case_id` into the same `bus_namespace`, environment
   placeholder, or memory-store placeholder.
4. Do not claim this prompt can safely create all Anthropic resources by
   itself. If Anthropic Managed Agents credentials and the dispatcher bootstrap
   tooling are available, hand off to that bootstrap script. Otherwise, emit
   the JSON with placeholders and tell the user to follow the internal
   bridge-dispatcher runbook at
   `/Users/bryanj/dev/bridge-dispatcher/docs/ARCHITECTURE.md`.
5. Keep generating `harness/generated/{agent.id}/CLAUDE.md` for every agent, including managed agents, so Claude Code/manual operation remains available
6. Do not destructively edit the root `CLAUDE.md`; only append a short "Managed Agents" note if a root file already exists and the user approves

Example entry shape:

```json
{
  "schema_version": "managed-agents.v1",
  "agents": [
    {
      "id": "nightly-analyst",
      "bus_address": "managed.analytics.nightly",
      "runtime": "managed",
      "model": "claude-sonnet-4-5",
      "team_id": "team-growth",
      "use_case_id": "daily-analysis",
      "bus_namespace": "team-growth/daily-analysis/nightly-analyst",
      "agent_id": "anthropic-agent-id-placeholder",
      "version": "anthropic-agent-version-placeholder",
      "env_id": "anthropic-env-id-placeholder",
      "memory_store_ids": {
        "shared": ["mem_growth_shared"],
        "private": ["mem_nightly_analyst"]
      },
      "vault_ids": [],
      "cadence_minutes": 1440,
      "outcome": {
        "rubric_file": "harness/rubrics/daily-analysis.md",
        "max_iterations": 2
      },
      "multiagent": {
        "type": "review",
        "agents": ["nightly-analyst", "outcome-reviewer"]
      }
    }
  ]
}
```

Report: "Managed Agents skipped; no managed agents defined" or "Managed Agents dispatcher config generated for N agents."

### Step 5 — Generate the Bridge config

Create a JavaScript config file at `harness/generated/bridge-config.js` that:
1. Maps each agent to a Bridge `Entity` object:
   ```js
   {
     id: agent.id,
     name: agent.name,
     tier: agent.tier,
     role: agent.role,
     status: agent.status,
     health: "G",  // Default — will be updated by bus data
     icon: agent.icon,
     connections: agent.connections,
     dimmed: agent.status !== "active",
   }
   ```
2. Maps each objective to a Bridge `Objective` object
3. Creates sensible default modes (BUILD + OPS) with:
   - Crew members derived from T0-T1 agents
   - Tabs mapped to available data
   - Stats showing agent count, bus health, objective progress
4. Wires up the `getStarterPrompt` function to generate context-aware prompts
   that include the agent's bus_address and instructions
5. Exports the config as default

Report: "Bridge config generated with N entities and M objectives."

### Step 6 — Write the system CLAUDE.md

Create a root-level `CLAUDE.md` if one does not exist, or append to an existing
one only with the user's approval. Never delete or overwrite unrelated
root-level instructions. The file should give any Claude session awareness of
the agent fleet:

```markdown
# [System Name] — Agent Operating System

## Bus
- Table: `handoff` in Supabase project `[project_id]`
- Poll with: `SELECT * FROM bus_pending`
- Health check: `SELECT * FROM bus_health`

## Agents
[Table of all agents with id, bus_address, tier, role, status]

## Decision Authority
- Autonomous decisions: agents can act within their authority boundaries
- Human approval: anything marked "requires_approval" in agent definitions
- Strategic decisions: always human

## Session Protocol
1. On start: poll bus, report pending items
2. On end: write HANDOFF message, flag unresolved items
```

If managed agents exist and the user approves appending to an existing
`CLAUDE.md`, add only this short note:

```markdown
## Managed Agents
- Optional dispatcher config: `harness/generated/managed-agents.json`
- Internal bridge-dispatcher runbook: `/Users/bryanj/dev/bridge-dispatcher/docs/ARCHITECTURE.md`
- Manual fallback: use each agent's generated `CLAUDE.md`
```

Report: "System CLAUDE.md written."

### Step 7 — Seed the bus

Write an initial message to the handoff table:

```sql
INSERT INTO handoff (from_agent, to_agent, topic, body, metadata, status)
VALUES (
  'system.boot',
  '[orchestrator_bus_address]',
  'system-bootstrap',
  'Agent harness bootstrapped. N agents registered. Bus active. Awaiting first instructions.',
  '{"message_type": "OBS", "priority": "normal", "source_entity": "system.boot"}'::jsonb,
  'pending'
);
```

Report: "Bus seeded with bootstrap message."

### Step 8 — Summary and next steps

Print a summary table:

| Agent | Tier | Status | Bus Address | Instructions |
|-------|------|--------|-------------|--------------|
| ...   | ...  | ...    | ...         | Generated ✓  |

Then tell the user:

**Your agent fleet is ready.** Here's what to do next:

1. **Open The Bridge** — Run `npm run dev` in `examples/dev-server/` and load
   the generated config (`harness/generated/bridge-config.js`)
2. **Start the orchestrator** — Open a new Claude session, paste the contents of
   `harness/generated/orchestrator/CLAUDE.md`, and say "poll the bus"
3. **Add more agents** — Edit `harness/agents.yml` and re-run this boot prompt
4. **Customise** — Edit the generated CLAUDE.md files to add domain-specific
   instructions, tools, and authority boundaries

**The harness gives you:**
- A visual control room (The Bridge)
- A message bus (Supabase handoff table)
- Agent instruction files (CLAUDE.md per agent)
- Decision authority boundaries
- Session start/end protocols
- Audit trail via the bus

**You bring:**
- Your domain knowledge (what agents should do)
- Your tools (which MCPs to connect)
- Your objectives (what success looks like)
- Your authority model (who can decide what)
