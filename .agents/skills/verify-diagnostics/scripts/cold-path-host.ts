import { spawnSync } from "node:child_process";
import { Schema } from "effect";
export function coldPathHostGate() {
  const front = spawnSync(
    "osascript",
    [
      "-l",
      "JavaScript",
      "-e",
      'ObjC.import("AppKit"); ObjC.import("CoreGraphics"); const a=$.NSWorkspace.sharedWorkspace.frontmostApplication; const idle=Math.min(...[10,1,3,25].map(t=>$.CGEventSourceSecondsSinceLastEventType(0,t))); JSON.stringify({bundle:a.bundleIdentifier.js,path:a.bundleURL.path.js,idle_seconds:idle})',
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  const parsed = Schema.decodeUnknownOption(
    Schema.fromJsonString(
      Schema.Struct({
        bundle: Schema.String,
        path: Schema.String,
        idle_seconds: Schema.Finite,
      }),
    ),
  )(front.status === 0 ? front.stdout : "");
  const value = parsed._tag === "Some" ? parsed.value : null;
  const seconds = value?.idle_seconds ?? null;
  return {
    time: new Date().toISOString(),
    idle_seconds: seconds,
    frontmost: value,
    allowed:
      front.status === 0 &&
      seconds !== null &&
      seconds >= 60 &&
      value !== null &&
      !["/Applications/Todo.app", "/Applications/Todo Electron.app"].some(
        (p) => value.path === p || value.path.startsWith(`${p}/`),
      ),
  };
}

if (import.meta.main) console.log(JSON.stringify(coldPathHostGate()));
