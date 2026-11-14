import { Schema } from "effect";
import { GraphBrowserAdapter } from "./adapter.ts";
import {
  decodeGraphRender,
  GraphHostIdentity,
  type GraphHostReply,
} from "./protocol.ts";

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
const send = (reply: GraphHostReply) => {
  if (window.webkit?.messageHandlers?.todoGraph)
    window.webkit.messageHandlers.todoGraph.postMessage(reply);
  else if (window.parent !== window) window.parent.postMessage(reply, "*");
};
const adapter = new GraphBrowserAdapter(root, send);
window.todoGraph = {
  receive: (input) => {
    try {
      adapter.draw(decodeGraphRender(input));
    } catch {
      const envelope = Schema.decodeUnknownExit(
        Schema.Struct({ identity: GraphHostIdentity }),
      )(input);
      if (envelope._tag === "Success")
        send({
          v: 1,
          type: "renderError",
          identity: envelope.value.identity,
          message:
            "Todo received an incompatible graph render. Use the Task list or Retry.",
        });
    }
  },
};
window.addEventListener("message", (event) => {
  if (event.source === window.parent) window.todoGraph.receive(event.data);
});
window.addEventListener("pagehide", () => adapter.dispose());
