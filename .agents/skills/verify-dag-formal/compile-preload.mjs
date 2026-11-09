import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";
import { digest } from "./candidate-inputs.mjs";
const build = Bun.build.bind(Bun),
  candidate = process.cwd();
let index = 0;
Bun.build = async (options) => {
  const label = `nested-${process.pid}-${index++}`,
    evidence = process.env.DAG_F_GUARD_EVIDENCE;
  const imports = [];
  const plugin = {
    name: "dag-f-nested-immutable-imports",
    setup(builder) {
      builder.onResolve({ filter: /^@todo\/domain(?:\/|$)/ }, ({ path }) => {
        const exports = JSON.parse(
          readFileSync(join(candidate, "packages/domain/package.json"), "utf8"),
        ).exports;
        const key =
          path === "@todo/domain"
            ? "."
            : "." + path.slice("@todo/domain".length);
        assert.ok(exports[key]);
        return { path: resolve(candidate, "packages/domain", exports[key]) };
      });
      builder.onLoad({ filter: /\.(ts|mjs|js|json)$/ }, ({ path }) => {
        const actual = realpathSync(path);
        assert.ok(
          actual.startsWith(candidate + "/") ||
            actual.includes("/node_modules/"),
          "Nested source escaped candidate: " + actual,
        );
        imports.push({ path: actual, sha256: digest(readFileSync(actual)) });
        return undefined;
      });
    },
  };
  try {
    beforeCompile({ evidence, label });
  } catch (error) {
    if (error instanceof DiskStop) {
      console.error(error.message);
      process.exit(3);
    }
    throw error;
  }
  const result = await build({
    ...options,
    plugins: [plugin, ...(options.plugins ?? [])],
  });
  writeFileSync(
    join(evidence, label + "-build.json"),
    JSON.stringify(
      {
        label,
        success: result.success,
        logs: result.logs.map(String),
        imports,
      },
      null,
      2,
    ) + "\n",
  );
  return result;
};
