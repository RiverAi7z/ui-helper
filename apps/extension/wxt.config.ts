import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "UI Helper",
    description:
      "Select, preview, annotate, and record UI feedback for coding agents.",
    version: "0.1.0",
    permissions: [
      "activeTab",
      "tabs",
      "tabCapture",
      "offscreen",
      "clipboardWrite",
    ],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Toggle UI Helper" },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+U", mac: "Alt+Shift+U" },
        description: "Toggle UI Helper",
      },
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
