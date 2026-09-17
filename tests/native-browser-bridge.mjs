// Ego's public TaskSpace CDP bridge exposes Target commands, but native side-panel
// views aren't tab-strip Pages. Evaluate those real extension targets through a
// non-flattened CDP session and return JSON over a temporary loopback callback.
import { createServer } from "node:http";

export async function evaluateTarget(
  task,
  targetId,
  fn,
  argument,
  timeout = 15000,
) {
  const token = crypto.randomUUID();
  let finish;
  const result = new Promise((resolve, reject) => {
    finish = { resolve, reject };
  });
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    if (request.method === "OPTIONS") {
      response.end();
      return;
    }
    if (request.url !== `/${token}`) {
      response.writeHead(404);
      response.end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    response.end("ok");
    try {
      const message = JSON.parse(body);
      if (message.ok) finish.resolve(message.value);
      else finish.reject(new Error(message.error));
    } catch (error) {
      finish.reject(error);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { sessionId } = await task.cdp("Target.attachToTarget", {
    targetId,
    flatten: false,
  });
  const timer = setTimeout(
    () => finish.reject(new Error("Native target evaluation timed out")),
    timeout,
  );
  try {
    const url = `http://127.0.0.1:${server.address().port}/${token}`;
    const expression = `(() => { const report = message => fetch(${JSON.stringify(url)}, {method:'POST',body:JSON.stringify(message)}); try { Promise.resolve((${fn.toString()})(${JSON.stringify(argument) ?? "undefined"})).then(value => report({ok:true,value}), error => report({ok:false,error:String(error)})); } catch(error) { report({ok:false,error:String(error)}); } })()`;
    await task.cdp("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, userGesture: true },
      }),
    });
    return await result;
  } finally {
    clearTimeout(timer);
    server.close();
    await task.cdp("Target.detachFromTarget", { sessionId }).catch(() => {});
  }
}
