import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "UI Helper",
    description:
      "Select, preview, annotate, and record UI feedback for coding agents.",
    version: "0.2.1",
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
      "sidePanel",
    ],
    minimum_chrome_version: "116",
    action: {
      default_title: "Open UI Helper sidebar",
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
        description: "Open UI Helper sidebar",
      },
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
