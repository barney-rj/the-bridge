import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import bridgeApiHandler from "../../api/bridge/[...path].js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function localBridgeRuntimePlugin(runtimeMode, localClientToken) {
  return {
    name: "bridge-local-runtime",
    configureServer(server) {
      server.middlewares.use("/bridge-api", async (request, response, next) => {
        try {
          if (!request.url) return next();
          request.url = `/api/bridge${request.url === "/" ? "" : request.url}`;
          process.env.BRIDGE_RUNTIME_MODE = runtimeMode;
          if (localClientToken && !request.headers["x-bridge-client-token"]) {
            request.headers["x-bridge-client-token"] = localClientToken;
          }
          await bridgeApiHandler(request, vercelResponse(response));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bridgeTarget = env.BRIDGE_DISPATCHER_URL || "https://bridge.patchworks.ai";
  const dashboardToken = env.BRIDGE_DASHBOARD_TOKEN;
  const bridgeRuntimeMode = env.BRIDGE_RUNTIME_MODE || env.BRIDGE_API_MODE || (dashboardToken ? "proxy" : "mock");
  const localClientToken = env.BRIDGE_MANAGED_CLIENT_TOKEN || env.BRIDGE_CLIENT_TOKEN || env.BRIDGE_PROXY_CLIENT_TOKEN;

  return {
    plugins: [
      react(),
      bridgeRuntimeMode === "mock" || bridgeRuntimeMode === "managed"
        ? localBridgeRuntimePlugin(bridgeRuntimeMode, localClientToken)
        : null,
    ].filter(Boolean),
    resolve: {
      alias: {
        "the-bridge": path.resolve(__dirname, "../../src"),
      },
    },
    server: {
      proxy: bridgeRuntimeMode === "proxy" ? {
        "/bridge-api": {
          target: bridgeTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/bridge-api/, "/api"),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              for (const header of [
                "authorization",
                "cookie",
                "x-bridge-client-token",
                "x-tenant",
                "x-forwarded-user",
                "x-user-id",
              ]) {
                proxyReq.removeHeader(header);
              }
              if (dashboardToken) {
                proxyReq.setHeader("authorization", `Bearer ${dashboardToken}`);
              }
            });
          },
        },
      } : {},
    },
  };
});

function vercelResponse(response) {
  return {
    status(statusCode) {
      response.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      response.setHeader(name, value);
      return this;
    },
    json(payload) {
      if (!response.hasHeader("content-type")) {
        response.setHeader("content-type", "application/json");
      }
      response.end(JSON.stringify(payload));
    },
    send(payload) {
      response.end(payload);
    },
  };
}
