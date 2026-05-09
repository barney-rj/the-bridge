#!/usr/bin/env node
import {
  DEFAULT_AGENTS_FILE,
  DEFAULT_STATE_FILE,
  ValidationError,
  buildManagedPlan,
  loadEnrollmentState,
  readHarnessDefinition,
  writeEnrollmentState,
} from "./managed-agents.js";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

try {
  const definition = readHarnessDefinition(DEFAULT_AGENTS_FILE);
  const previousState = loadEnrollmentState(DEFAULT_STATE_FILE);
  const plan = buildManagedPlan(definition, previousState);

  if (plan.agents.length === 0) {
    console.log("Managed Agents skipped; no managed agents defined.");
    process.exit(0);
  }

  if (!checkOnly) {
    writeEnrollmentState(plan, DEFAULT_STATE_FILE);
  }

  for (const warning of plan.warnings || []) {
    console.warn(`warning: ${warning}`);
  }
  const action = checkOnly ? "validated" : `written to ${DEFAULT_STATE_FILE}`;
  console.error(`Managed Agents plan ${action} for ${plan.agents.length} agent${plan.agents.length === 1 ? "" : "s"}.`);
  console.log(JSON.stringify(plan, null, 2));
} catch (error) {
  if (error instanceof ValidationError) {
    for (const warning of error.warnings || []) console.warn(`warning: ${warning}`);
    for (const validationError of error.errors || []) console.error(`error: ${validationError}`);
    process.exit(1);
  }
  console.error(error.message);
  process.exit(1);
}
