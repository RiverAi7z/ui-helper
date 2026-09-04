import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import styles from "./style.css?inline";

export default defineContentScript({
  registration: "runtime",
  runAt: "document_idle",
  main() {
    if (document.querySelector("ui-helper-root")) return;

    const host = document.createElement("ui-helper-root");
    host.setAttribute("data-ui-helper-root", "");
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
    const portals = document.createElement("div");
    portals.id = "ui-helper-portals";
    shadow.append(style, mount, portals);
    (document.body ?? document.documentElement).append(host);

    const root = createRoot(mount);
    root.render(<App host={host} portalContainer={portals} />);
  },
});
