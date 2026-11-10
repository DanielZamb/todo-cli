import { GraphBrowserAdapter } from "./adapter.ts";
import { decodeGraphRender, type GraphHostReply } from "./protocol.ts";

declare global {
  interface Window {
    todoGraph: { receive: (input: unknown) => void };
    webkit?: {
      messageHandlers?: {
        todoGraph?: { postMessage: (reply: GraphHostReply) => void };
      };
    };
  }
}
const root = document.getElementById("graph");
if (!root) throw new Error("Missing graph host");
const adapter = new GraphBrowserAdapter(root, (reply) => {
  if (window.webkit?.messageHandlers?.todoGraph)
    window.webkit.messageHandlers.todoGraph.postMessage(reply);
  else if (window.parent !== window) window.parent.postMessage(reply, "*");
});
window.todoGraph = {
  receive: (input) => adapter.draw(decodeGraphRender(input)),
};
window.addEventListener("message", (event) => {
  if (event.source === window.parent) window.todoGraph.receive(event.data);
});
window.addEventListener("pagehide", () => adapter.dispose());
