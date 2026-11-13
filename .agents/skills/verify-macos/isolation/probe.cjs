// The isolation controls' probe (briefs/ISOLATION.md). Run with node, not bun: bun reports a
// sandbox denial as ECONNREFUSED, the same as nothing listening.
// Usage: node probe.cjs <outer|inner|child> <real ~/.todo-cli> <owned 14310 port> <loopback port>
// outer: from outside the sandbox, only the owned listeners (never 4310, never an external address,
// never the real data directory). inner and child: all four, and inner repeats them in a child.
const net = require("node:net");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const [mode, realHome, ownedPort, loopbackPort] = process.argv.slice(2);
const connect = (host, port) => new Promise((done) => {
  const socket = net.connect({ host, port: Number(port) });
  const timer = setTimeout(() => { socket.destroy(); done("TIMEOUT"); }, 3000);
  socket.on("connect", () => { clearTimeout(timer); socket.end(); done("CONNECTED"); });
  socket.on("error", (error) => { clearTimeout(timer); done(error.code); });
});
(async () => {
  const result = { mode };
  result.owned14310 = await connect("127.0.0.1", ownedPort);
  result.loopback = await connect("127.0.0.1", loopbackPort);
  if (mode !== "outer") {
    result.external = await connect("1.1.1.1", 80);
    try { fs.readdirSync(realHome); result.realHome = "READ"; } catch (error) { result.realHome = error.code; }
  }
  if (mode === "inner") {
    result.child = JSON.parse(execFileSync(process.execPath, [__filename, "child", realHome, ownedPort, loopbackPort]).toString());
  }
  process.stdout.write(JSON.stringify(result) + "\n");
})();
