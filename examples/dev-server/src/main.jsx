import React from "react";
import { createRoot } from "react-dom/client";
import { Bridge } from "the-bridge";

/**
 * Dev server entry point.
 *
 * Mounts The Bridge with VITE_BRIDGE_CONFIG when set. The onboarding script
 * creates examples/my-config.js, which is preferred automatically when present.
 */
const configs = import.meta.glob("../../*.js", { eager: true, import: "default" });
const requestedConfig = import.meta.env.VITE_BRIDGE_CONFIG || "../../my-config.js";
const config = configs[requestedConfig] || configs["../../estate-agent-config.js"] || configs["../../demo-config.js"];

if (!config) {
  throw new Error(`Bridge config not found: ${requestedConfig}`);
}

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Bridge config={config} />
  </React.StrictMode>
);
