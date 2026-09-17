import type { PanelState } from "./panel-protocol";

/** Injection finishing is not equivalent to React installing its listener. */
export async function connectPage(options: {
  send: () => Promise<{ ok?: boolean; state?: PanelState } | undefined>;
  inject: () => Promise<unknown>;
  current: () => boolean;
  timeoutMs?: number;
  retryMs?: number;
}): Promise<PanelState> {
  const deadline = Date.now() + (options.timeoutMs ?? 4000);
  const current = () => {
    if (!options.current()) throw new Error("Connection cancelled");
  };
  const probe = async () => {
    current();
    let cancelTimer = () => {};
    try {
      return await Promise.race([
        options.send(),
        new Promise<undefined>((resolve) => {
          const timer = setTimeout(
            resolve,
            Math.max(1, Math.min(500, deadline - Date.now())),
          );
          cancelTimer = () => clearTimeout(timer);
        }),
      ]);
    } catch {
      return undefined;
    } finally {
      cancelTimer();
    }
  };
  const initial = await probe();
  if (initial?.ok && initial.state) {
    current();
    return initial.state;
  }
  current();
  let cancelInjectionTimer = () => {};
  try {
    await Promise.race([
      options.inject(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "Page initialization timed out. Refresh the page and retry.",
              ),
            ),
          Math.max(1, deadline - Date.now()),
        );
        cancelInjectionTimer = () => clearTimeout(timer);
      }),
    ]);
  } finally {
    cancelInjectionTimer();
  }
  while (Date.now() < deadline) {
    const result = await probe();
    if (result?.ok && result.state) {
      current();
      return result.state;
    }
    await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? 75));
  }
  throw new Error(
    "The page did not respond. Refresh it, then click UI Helper again.",
  );
}
