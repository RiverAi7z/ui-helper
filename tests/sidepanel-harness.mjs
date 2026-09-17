// Browser integration harness: real built UI in two documents, mocked Chrome
// transport/capture only. Not a substitute for a loaded-extension smoke test.
// npm run build && node tests/sidepanel-harness.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const build = resolve(root, "apps/extension/.output/chrome-mv3");
const shim = String.raw`
const bus = new BroadcastChannel('ui-helper-panel-test:' + (new URLSearchParams(location.search).get('session') || 'default'));
const listeners = [];
const requests = new Map();
window.nativeTest = {commands: [], files: [], crops: []};
function receive(message) { for(const listener of listeners) listener(message); }
window.chrome = {runtime: {
  id: 'ui-helper-test-harness',
  onMessage: {addListener(fn){listeners.push(fn)},removeListener(fn){listeners.splice(listeners.indexOf(fn),1)}},
  sendMessage: async message => {
    if (message.type === 'START_RECORDING') { nativeTest.crops.push(message.crop); return {ok:true}; }
    if (message.type === 'STOP_RECORDING') return {ok:true,width:100,height:80,frames:3,dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='};
    if (message.type === 'PANEL_SAVE_GIF') {
      const id = crypto.randomUUID();
      return new Promise(resolve=> {requests.set(id,resolve);bus.postMessage({...message,id})});
    }
    bus.postMessage({...message,tabId:1});
    return {ok:true};
  },
  connect: () => ({
    onMessage: {addListener(fn){listeners.push(fn)}},
    onDisconnect: {addListener(){}},
    postMessage(message) {
      if (message.type === 'PANEL_HELLO') {
        receive({type:'PANEL_LOADING',tabId:1});
        bus.postMessage({type:'ATTACH'});
      } else if (message.type === 'PANEL_COMMAND') {
        nativeTest.commands.push(message.command);
        bus.postMessage(message);
      } else if (message.type === 'PANEL_FILE_RESULT') bus.postMessage(message);
    },
    disconnect() {},
  }),
}, windows: {getCurrent: async()=>({id:1})}};
if (location.pathname === '/sidepanel.html') {
  bus.onmessage = event => receive(event.data);
  const directory = {
    getDirectoryHandle: async()=>directory,
    getFileHandle: async name=>({createWritable:async()=>({write:async data=>nativeTest.files.push({name,size:data.size??data.length}),close:async()=>{}})}),
  };
  window.showDirectoryPicker = async()=>directory;
} else {
  bus.onmessage = event => {
    const message = event.data;
    if (message.type === 'ATTACH') {
      for(const listener of listeners) listener({type:'PANEL_ATTACH'}, {}, result=>bus.postMessage({type:'PANEL_STATE',tabId:1,state:result.state}));
    } else if (message.type === 'PANEL_COMMAND') {
      for(const listener of listeners) listener(message, {}, result=>bus.postMessage({type:'PANEL_RESULT',id:message.id,result}));
    } else if (message.type === 'PANEL_FILE_RESULT') {
      requests.get(message.id)?.(message.result);requests.delete(message.id);
    }
  };
  window.addEventListener('DOMContentLoaded',()=>{window.originalBodyStyle=document.body.style.cssText});
}
`;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/shim.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(shim);
      return;
    }
    const extension =
      path === "/sidepanel.html" ||
      /^\/(chunks|assets|content-scripts)\//.test(path);
    const directory = extension ? build : resolve(root, "test-page");
    const file = resolve(directory, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(directory + sep)) throw new Error("Invalid path");
    let data = await readFile(file);
    if (extname(file) === ".html") {
      let html = data
        .toString()
        .replace("<head>", '<head><script src="/shim.js"></script>');
      if (!extension)
        html = html.replace(
          "</body>",
          '<script src="/content-scripts/content.js"></script></body>',
        );
      data = Buffer.from(html);
    }
    response.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(5186, "127.0.0.1", () =>
  console.log("Sidepanel harness: http://127.0.0.1:5186"),
);
