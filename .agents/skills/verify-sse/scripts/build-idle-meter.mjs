import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [destination, replacement] = process.argv.slice(2);
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "meter-server.mjs")],
  target: "bun", compile: { outfile: resolve(destination) },
  plugins: [{ name: "count-native-state-checks", setup(build) {
    build.onLoad({ filter: /apps\/server\/src\/stream-wake-store\.ts$/ }, (args) => {
      let contents = readFileSync(replacement || args.path, "utf8");
      const check = "const inside = connection.inTransaction;";
      if (!replacement) {
        assert.equal(contents.split(check).length, 2);
        contents = contents.replace(check, `${check} globalThis.streamWakeStateChecks = (globalThis.streamWakeStateChecks ?? 0) + 1;`);
      }
      return { contents, loader: "ts" };
    });
  } }],
});
assert.equal(result.success, true, String(result.logs));
