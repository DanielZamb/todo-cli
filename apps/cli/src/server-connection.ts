import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { Agent, request } from "node:http";
import type { Socket } from "node:net";
import { dirname } from "node:path";
import { CONTRACT_ID } from "@todo/api";
import { BackendCommand, BackendReply } from "@todo/domain/backend-command";
import { CommandError } from "@todo/domain/commands";
import {
  databaseBinding,
  EndpointRecord,
  endpointPath,
  ProofResponse,
  privateEntry,
  routeMac,
  sameBinding,
  validMac,
} from "@todo/domain/database-route";
import { Schema } from "effect";

export class CommandTransportError extends CommandError {
  readonly outcome: "unknown" | "not_sent";
  constructor(sent: boolean) {
    super(
      1,
      sent ? "write_outcome_unknown" : "server_unverified",
      sent
        ? "The server may have applied this command. Inspect History before retrying."
        : "Server connection is no longer proven",
    );
    this.outcome = sent ? "unknown" : "not_sent";
  }
}

// ADR-0023: the MAC-covered protocol is the routing capability. Protocol 1 is
// discovery, proof and nudge only. The first build that routes a production
// command publishes and proves ROUTING_PROTOCOL, and the CLI routes a writing
// command only to a server for which routable() holds.
export const ROUTING_PROTOCOL = 2;
export const routable = (server: ProvenServer | undefined) =>
  server !== undefined && server.protocol >= ROUTING_PROTOCOL;

export class ProvenServer {
  private readonly agent = new Agent({ keepAlive: true, maxSockets: 1 });
  private socket: Socket | undefined;
  constructor(
    private readonly path: string,
    private readonly record: typeof EndpointRecord.Type,
  ) {}

  get protocol(): number {
    return this.record.protocol;
  }

  private exchange(
    endpoint: string,
    body: string | undefined,
    deadline: number,
    purpose?: "nudge" | "command",
    credential?: string,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let sent = false;
      let completed = false;
      const fail = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        this.close();
        reject(new CommandTransportError(purpose === "command" && sent));
      };
      const req = request(
        {
          hostname: "127.0.0.1",
          port: this.record.port,
          path: endpoint,
          method: "POST",
          agent: this.agent,
        },
        (response) => {
          const parts: Buffer[] = [];
          let size = 0;
          response.on("data", (part: Buffer) => {
            size += part.length;
            if (size > 28 * 1024 * 1024) {
              req.destroy();
              fail();
            } else parts.push(part);
          });
          response.on("error", fail);
          response.on("aborted", fail);
          response.on("end", () => {
            if (completed) return;
            if (response.statusCode !== 200) {
              fail();
              return;
            }
            try {
              const value: unknown = JSON.parse(
                Buffer.concat(parts).toString("utf8"),
              );
              completed = true;
              clearTimeout(timer);
              resolve(value);
            } catch {
              fail();
            }
          });
        },
      );
      const timer = setTimeout(
        () => {
          req.destroy();
          fail();
        },
        Math.max(1, deadline - performance.now()),
      );
      req.on("error", fail);
      req.on("socket", (socket) => {
        if (purpose !== undefined) {
          const current = databaseBinding(this.path);
          if (
            socket !== this.socket ||
            socket.destroyed ||
            !current ||
            !sameBinding(current, this.record.binding)
          ) {
            req.destroy();
            fail();
            return;
          }
          req.setHeader("x-todo-incarnation", this.record.incarnation);
          req.setHeader(
            "x-todo-proof",
            routeMac(this.record.secret, purpose, this.record.incarnation),
          );
          if (credential !== undefined)
            req.setHeader("Authorization", `Bearer ${credential}`);
        } else this.socket = socket;
        if (body !== undefined) {
          req.setHeader("Content-Type", "application/json");
          req.setHeader("Content-Length", Buffer.byteLength(body));
        } else req.setHeader("Content-Length", "0");
        sent = true;
        req.end(body);
      });
    });
  }

  async prove(deadline: number) {
    const nonce = randomBytes(32).toString("hex");
    const response = Schema.decodeUnknownSync(ProofResponse)(
      await this.exchange(
        "/local/database-proof",
        JSON.stringify({ nonce }),
        deadline,
      ),
    );
    const { mac, ...value } = response;
    if (
      nonce !== response.nonce ||
      response.protocol !== this.record.protocol ||
      response.contract !== CONTRACT_ID ||
      this.record.incarnation !== response.incarnation ||
      !sameBinding(this.record.binding, response.binding) ||
      !validMac(routeMac(this.record.secret, "proof", value), mac)
    )
      throw new CommandTransportError(false);
  }

  async nudge(milliseconds = 50) {
    try {
      await this.exchange(
        "/local/nudge",
        undefined,
        performance.now() + milliseconds,
        "nudge",
      );
    } catch {}
  }

  async run(command: BackendCommand, credential: string, milliseconds = 5000) {
    const body = JSON.stringify(Schema.encodeSync(BackendCommand)(command));
    if (Buffer.byteLength(body) > 28 * 1024 * 1024)
      throw new CommandTransportError(false);
    const value = await this.exchange(
      "/local/commands",
      body,
      performance.now() + milliseconds,
      "command",
      credential,
    );
    try {
      const reply = Schema.decodeUnknownSync(BackendReply)(value);
      if (reply.outcome === "not_run")
        throw new CommandError(1, "server_command_not_run", reply.message);
      return reply;
    } catch (error) {
      if (
        error instanceof CommandError &&
        error.code === "server_command_not_run"
      )
        throw error;
      throw new CommandTransportError(true);
    }
  }

  close() {
    this.agent.destroy();
  }
}

export async function discoverServer(
  path: string,
  milliseconds = 50,
): Promise<ProvenServer | undefined> {
  const deadline = performance.now() + milliseconds;
  let server: ProvenServer | undefined;
  try {
    const binding = databaseBinding(path);
    if (!binding) return undefined;
    const file = endpointPath(binding.path);
    if (
      !privateEntry(dirname(dirname(file)), true) ||
      !privateEntry(dirname(file), true) ||
      !privateEntry(file, false) ||
      lstatSync(file).size > 8192
    )
      return undefined;
    const record = Schema.decodeUnknownSync(EndpointRecord)(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (
      record.contract !== CONTRACT_ID ||
      !sameBinding(binding, record.binding) ||
      performance.now() >= deadline
    )
      return undefined;
    server = new ProvenServer(path, record);
    await server.prove(deadline);
    return server;
  } catch {
    server?.close();
    return undefined;
  }
}
