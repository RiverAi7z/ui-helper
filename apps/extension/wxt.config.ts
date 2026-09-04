import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "UI Helper",
    description:
      "Select, preview, annotate, and record UI feedback for coding agents.",
    version: "0.1.2",
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    permissions: [
      "activeTab",
      "scripting",
      "tabCapture",
      "offscreen",
      "clipboardWrite",
    ],
    action: {
      default_title: "Toggle UI Helper",
      default_icon: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
      },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+U", mac: "Alt+Shift+U" },
        description: "Toggle UI Helper",
      },
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
