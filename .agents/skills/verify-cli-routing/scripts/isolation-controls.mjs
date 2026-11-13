// The five isolation controls from the run store's ISOLATION.md, run with node
// because bun reports a sandbox denial as ECONNREFUSED.
// Usage, from the checkout root: node .agents/skills/verify-cli-routing/scripts/isolation-controls.mjs
// It owns a listener on 14310 and one on an ephemeral port, runs the probes
// inside isolate.sh (and again in a child of that process), and never contacts 4310.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const connect = (host, port) =>
  new Promise((done) => {
    const socket = new Socket();
    socket.setTimeout(3000, () => {
      socket.destroy();
      done("TIMEOUT");
    });
    socket.once("error", (error) => done(error.code));
    socket.connect(port, host, () => {
      socket.end();
      done("CONNECTED");
    });
  });
const probe = async (ephemeral) => {
  let protectedDir;
  try {
    readdirSync(join(userInfo().homedir, ".todo-cli"));
    protectedDir = "READABLE";
  } catch (error) {
    protectedDir = error.code;
  }
  return {
    owned_14310: await connect("127.0.0.1", 14310),
    external_1_1_1_1_80: await connect("1.1.1.1", 80),
    loopback_ephemeral: await connect("127.0.0.1", ephemeral),
    protected_dir: protectedDir,
  };
};
const run = (command, args) =>
  new Promise((done) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (part) => (out += part));
    child.stderr.on("data", (part) => (out += part));
    child.on("exit", (code) => done({ code, out: out.trim() }));
  });

const [role, port] = process.argv.slice(2);
if (role === "inside" || role === "grandchild") {
  const own = await probe(Number(port));
  const child =
    role === "inside"
      ? JSON.parse((await run(process.execPath, [here, "grandchild", port])).out)
      : undefined;
  console.log(JSON.stringify(child ? { ...own, child } : own));
} else {
  const hits = { owned_14310: 0, loopback: 0 };
  const owned = createServer((socket) => {
    hits.owned_14310++;
    socket.end();
  });
  const loopback = createServer((socket) => {
    hits.loopback++;
    socket.end();
  });
  await new Promise((ok, no) =>
    owned.once("error", no).listen(14310, "127.0.0.1", ok),
  );
  await new Promise((ok) => loopback.listen(0, "127.0.0.1", ok));
  const ephemeral = loopback.address().port;
  const outside = {
    owned_14310: await connect("127.0.0.1", 14310),
    external_1_1_1_1_80: await connect("1.1.1.1", 80),
  };
  const hitsBeforeInside = { ...hits };
  const isolate = join(dirname(here), "isolate.sh");
  const inside = await run(isolate, [process.execPath, here, "inside", String(ephemeral)]);
  owned.close();
  loopback.close();
  const result = JSON.parse(inside.out);
  const expected = {
    owned_14310: "EPERM",
    external_1_1_1_1_80: "EPERM",
    loopback_ephemeral: "CONNECTED",
    protected_dir: "EPERM",
  };
  const pass =
    outside.owned_14310 === "CONNECTED" &&
    hits.owned_14310 === hitsBeforeInside.owned_14310 &&
    Object.entries(expected).every(
      ([key, value]) => result[key] === value && result.child[key] === value,
    );
  console.log(JSON.stringify({ pass, outside, inside: result, hits }, null, 2));
  process.exit(pass ? 0 : 1);
}
