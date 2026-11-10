const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const guardPath = () =>
  resolve(process.env.TODO_DAG_GUARD_ROOT, "scripts/disk-guard.sh");
function guardCompiler() {
  const result = spawnSync("/bin/sh", [guardPath()], {
    stdio: ["inherit", process.stderr.fd, process.stderr.fd],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function installBuildGuard(runtime) {
  const build = runtime.build;
  runtime.build = function guardedBuild(...args) {
    guardCompiler();
    return Reflect.apply(build, this, args);
  };
}
function diskFailure(error) {
  return (
    error &&
    typeof error === "object" &&
    error.status === 3 &&
    ([
      error.path,
      ...(Array.isArray(error.spawnargs) ? error.spawnargs : []),
    ].some(
      (value) => typeof value === "string" && resolve(value) === guardPath(),
    ) ||
      (typeof error.message === "string" &&
        error.message.includes(guardPath())))
  );
}
if (globalThis.Bun?.build) installBuildGuard(globalThis.Bun);
process.on("uncaughtExceptionMonitor", (error) => {
  if (diskFailure(error)) process.exit(3);
});
process.on("unhandledRejection", (error) => {
  if (diskFailure(error)) process.exit(3);
  console.error(error);
  process.exit(1);
});
module.exports = { installBuildGuard };
