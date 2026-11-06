import { spawn } from "node:child_process";
import { userInfo } from "node:os";

// Asks macOS whether `password` is the login password of the account running
// Todo. dscl runs in its own session, so it has no terminal and reads the
// password from the pipe: it never appears in arguments or the process list.
export const verifyMacPassword = (
  password: string,
  account = userInfo().username,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (process.platform !== "darwin" || !password || password.includes("\n"))
      return resolve(false);
    const child = spawn("/usr/bin/dscl", [".", "-authonly", account], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(`${password}\n`);
  });
