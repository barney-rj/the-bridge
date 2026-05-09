import { handleManagedRuntime } from "./runtime/managed.js";
import { handleMockRuntime } from "./runtime/mock.js";
import { handleProxyRuntime } from "./runtime/proxy.js";

export default async function handler(request, response) {
  const runtimeMode = bridgeRuntimeMode(process.env);

  if (runtimeMode === "mock") {
    await handleMockRuntime(request, response);
    return;
  }

  if (runtimeMode === "managed") {
    await handleManagedRuntime(request, response);
    return;
  }

  if (runtimeMode !== "proxy") {
    response.status(400).json({ error: `Unsupported BRIDGE_RUNTIME_MODE "${runtimeMode}"` });
    return;
  }

  await handleProxyRuntime(request, response);
}

export function bridgeRuntimeMode(env = process.env) {
  return env.BRIDGE_RUNTIME_MODE || env.BRIDGE_API_MODE || "proxy";
}
