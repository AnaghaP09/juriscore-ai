import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const windowsMcpPathCompatibility: Plugin = {
  name: "juriscore-windows-mcp-path-compatibility",
  enforce: "pre",
  configResolved(config) {
    if (process.platform === "win32") {
      (config as { root: string }).root = resolve(config.root);
    }
  },
};

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [windowsMcpPathCompatibility, mcpPlugin()],
  },
});
