import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const output = process.argv[2];
assert.ok(output);
const hooks = resolve(import.meta.dirname, "read-boundary-hooks.ts");
const wrapHandlers = (source: string) => {
  let cursor = 0;
  const edits: Array<{ at: number; text: string }> = [];
  while (true) {
    const found = source.indexOf(".handleAll({", cursor);
    if (found === -1) break;
    cursor = found;
    const start = cursor + ".handleAll(".length;
    let depth = 0;
    let quote = "";
    let index = start;
    for (; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (char === "\\") index++;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (source.startsWith("//", index)) {
        const end = source.indexOf("\n", index);
        assert.ok(end >= 0);
        index = end;
        continue;
      }
      if (source.startsWith("/*", index)) {
        const end = source.indexOf("*/", index + 2);
        assert.ok(end >= 0);
        index = end + 1;
        continue;
      }
      if (char === "{") depth++;
      if (char === "}" && --depth === 0) break;
    }
    assert.ok(
      index < source.length && /^\s*\)/u.test(source.slice(index + 1)),
      "Reviewed handleAll object must end at its call",
    );
    edits.push(
      { at: start, text: "boundaryHandlers(" },
      { at: index + 1, text: ")" },
    );
    cursor = index + 1;
  }
  assert.ok(edits.length > 0);
  for (const edit of edits.sort((a, b) => b.at - a.at))
    source = source.slice(0, edit.at) + edit.text + source.slice(edit.at);
  return source;
};
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "read-control-server.ts")],
  target: "bun",
  compile: { outfile: resolve(output) },
  define: { TODO_BUILD_ID: '"e69230f9"' },
  plugins: [
    {
      name: "read-boundary-control",
      setup(build) {
        build.onLoad(
          {
            filter:
              /(?:apps\/server\/src\/(server|sse)|packages\/domain\/src\/auth\/auth)\.ts$/,
          },
          (args) => {
            let source = readFileSync(args.path, "utf8");
            if (args.path.endsWith("auth.ts")) {
              assert.ok(source.includes("Object.freeze(this);"));
              return {
                contents:
                  "import {boundaryAfterCheck} from " +
                  JSON.stringify(hooks) +
                  ";\n" +
                  source
                    .replace(
                      "Object.freeze(this);",
                      "boundaryAfterCheck(); Object.freeze(this);",
                    )
                    .replace(
                      'if (classification.kind === "absent") {',
                      'if (classification.kind === "absent") { boundaryAfterCheck();',
                    ),
                loader: "ts",
              };
            }
            if (args.path.endsWith("server.ts")) {
              const marker =
                "const cacheHygiene = yield* taskSearchCacheHygiene(store);";
              assert.ok(source.includes(marker));
              source = source.replace(
                marker,
                "installBoundaryHooks(store); " + marker,
              );
            }
            return {
              contents:
                "import {boundaryHandlers,installBoundaryHooks} from " +
                JSON.stringify(hooks) +
                ";\n" +
                wrapHandlers(source),
              loader: "ts",
            };
          },
        );
      },
    },
  ],
});
assert.ok(result.success, result.logs.map(String).join("\n"));
