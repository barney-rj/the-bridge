#!/usr/bin/env node
import {
  DEFAULT_AGENTS_FILE,
  DEFAULT_STATE_FILE,
  ValidationError,
  buildManagedPlan,
  enrollManagedAgents,
  loadEnrollmentState,
  mergeEnrollmentResult,
  readHarnessDefinition,
  writeEnrollmentState,
} from "./managed-agents.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

try {
  const definition = readHarnessDefinition(DEFAULT_AGENTS_FILE);
  const previousState = loadEnrollmentState(DEFAULT_STATE_FILE);
  const plan = buildManagedPlan(definition, previousState);

  if (plan.agents.length === 0) {
    console.log("Managed Agents skipped; no managed agents defined.");
    process.exit(0);
  }

  for (const warning of plan.warnings || []) {
    console.warn(`warning: ${warning}`);
  }

  if (dryRun) {
    writeEnrollmentState(plan, DEFAULT_STATE_FILE);
    console.log(`Managed Agents enrollment dry run written to ${DEFAULT_STATE_FILE} for ${plan.agents.length} agent${plan.agents.length === 1 ? "" : "s"}.`);
    process.exit(0);
  }

  const result = await enrollManagedAgents(plan);
  const state = mergeEnrollmentResult(plan, result);
  writeEnrollmentState(state, DEFAULT_STATE_FILE);
  console.log(`Managed Agents enrollment persisted to ${DEFAULT_STATE_FILE} for ${state.agents.length} agent${state.agents.length === 1 ? "" : "s"}.`);
} catch (error) {
  if (error instanceof ValidationError) {
    for (const warning of error.warnings || []) console.warn(`warning: ${warning}`);
    for (const validationError of error.errors || []) console.error(`error: ${validationError}`);
    process.exit(1);
  }
  console.error(error.message);
  process.exit(1);
}
