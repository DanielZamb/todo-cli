import { appendFileSync } from "node:fs";
import {
  Agent,
  type IncomingMessage,
  request as nativeRequest,
  type RequestOptions,
} from "node:http";

export { Agent };

const loaded = process.env.TODO_ROUTING_DEFAULT_TRAP;
if (loaded)
  appendFileSync(loaded, `${JSON.stringify({ guard_loaded: true })}\n`);
export const request = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => {
  if (Number(options.port) !== 4310) return nativeRequest(options, callback);
  const port = Number(process.env.TODO_ROUTING_FOREIGN_PORT);
  const log = process.env.TODO_ROUTING_DEFAULT_TRAP;
  if (!log || !Number.isInteger(port) || port < 1 || port === 4310)
    throw new Error("Default-port control requires an owned foreign listener");
  appendFileSync(
    log,
    `${JSON.stringify({ redirected_default_port: 4310, owned_port: port })}\n`,
  );
  return nativeRequest({ ...options, hostname: "127.0.0.1", port }, callback);
};
