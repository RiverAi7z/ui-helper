import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import styles from "./style.css?inline";

export default defineContentScript({
  registration: "runtime",
  runAt: "document_idle",
  main(ctx) {
    // Page DOM is not proof that OUR isolated-world listener is installed.
    // A stale extension or a page/test script can own the same custom element.
    const scope = globalThis as typeof globalThis & {
      __uiHelperMount?: { host: HTMLElement; dispose: () => void };
    };
    if (scope.__uiHelperMount?.host.isConnected) return;
    scope.__uiHelperMount?.dispose();

    const host = document.createElement("ui-helper-root");
    host.setAttribute("data-ui-helper-root", "");
    host.setAttribute("data-ui-helper-owner", chrome.runtime.id ?? "test");
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      display: "block",
    });

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    mount.id = "ui-helper-app";
    shadow.append(style, mount);
    // Keep extension UI outside the page body's layout/containing block.
    document.documentElement.append(host);

    const root = createRoot(mount);
    const instance = {
      host,
      dispose: () => {
        root.unmount();
        host.remove();
        if (scope.__uiHelperMount === instance) delete scope.__uiHelperMount;
      },
    };
    scope.__uiHelperMount = instance;
    ctx.onInvalidated(instance.dispose);
    root.render(<App host={host} />);
  },
});
