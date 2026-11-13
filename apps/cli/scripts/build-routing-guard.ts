import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Pass the owned guard-binary output path");
const root = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "routing-http-guard.ts");
const build = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
  cwd: root,
}).trim();
let replacements = 0;
const result = await Bun.build({
  entrypoints: [resolve(root, "apps/cli/src/main.ts")],
  target: "bun",
  compile: { outfile: output },
  define: { TODO_BUILD_ID: JSON.stringify(build) },
  plugins: [
    {
      name: "owned-default-port-control",
      setup(builder) {
        builder.onLoad({ filter: /server-connection\.ts$/ }, (args) => {
          const source = readFileSync(args.path, "utf8");
          const contents = source.replace(
            '"node:http"',
            JSON.stringify(fixture),
          );
          if (contents === source)
            throw new Error("HTTP guard import was not replaced");
          replacements++;
          return { contents, loader: "ts" };
        });
      },
    },
  ],
});
if (!result.success) throw new Error(result.logs.map(String).join("\n"));
if (replacements !== 1)
  throw new Error("Expected exactly one guarded transport module");
