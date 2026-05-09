/**
 * The Bridge — Generalised Control Room Dashboard Component Library
 *
 * Entry point. Re-exports the main component and utilities.
 * Import from this file or from submodules directly.
 *
 * @example
 * import { Bridge } from '@brj/the-bridge';
 * import { createTheme, defaultTheme } from '@brj/the-bridge/theme';
 * import { Entity, Objective } from '@brj/the-bridge/types';
 */

export { Bridge } from "./Bridge.jsx";
export { defaultTheme, lightTheme, createTheme, themes } from "./theme.js";
export {
  fetchBridgeTasks,
  fetchDispatcherIdentity,
  submitBridgeTask,
  normalizeDispatcherIdentity,
  buildDispatcherContext,
  dispatcherTaskParams,
  fetchBridgeResource,
  createBridgeImport,
  decideBridgeApproval,
} from "./dispatcherClient.js";
