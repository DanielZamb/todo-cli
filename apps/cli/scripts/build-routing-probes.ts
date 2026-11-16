import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const [destinationArg, revision] = process.argv.slice(2);
if (!destinationArg)
  throw new Error("Pass an output directory and optional immutable revision");
const destination = resolve(destinationArg),
  root = process.cwd();
mkdirSync(destination, { recursive: true });
let archive: string | undefined;
if (revision) {
  assert.match(revision, /^[a-f0-9]{40}$/);
  archive = join(destination, "source");
  mkdirSync(archive, { recursive: true });
  const tar = join(destination, "source.tar");
  execFileSync("git", [
    "archive",
    "--output",
    tar,
    revision,
    "apps",
    "packages",
  ]);
  execFileSync("tar", ["-xf", tar, "-C", archive]);
}
for (const mode of revision ? ["barrier"] : ["barrier", "reset"]) {
  const output = join(
    destination,
    mode === "barrier" ? "barrier-server" : "reset-cli",
  );
  if (existsSync(output)) continue;
  let changes = 0;
  const result = await Bun.build({
    entrypoints: [
      resolve(
        mode === "barrier" ? "apps/server/src/main.ts" : "apps/cli/src/main.ts",
      ),
    ],
    target: "bun",
    compile: { outfile: output },
    define: {
      TODO_BUILD_ID: JSON.stringify(revision ?? "routing-correction-probe"),
    },
    plugins: [
      {
        name: "routing-startup-evidence",
        setup(builder) {
          // A baseline build reads every file from the archive. A relative
          // import of a file the working tree no longer has (such as the
          // baseline's outside-commit.ts) resolves to its root path, which
          // onLoad below then serves from the archive.
          if (archive) {
            const source = archive;
            builder.onResolve({ filter: /^\.\.?\// }, ({ path, importer }) => {
              if (!importer.startsWith(root + "/")) return undefined;
              const candidate = resolve(dirname(importer), path);
              if (existsSync(candidate)) return undefined;
              return existsSync(join(source, relative(root, candidate)))
                ? { path: candidate }
                : undefined;
            });
          }
          builder.onLoad(
            { filter: /\/(?:apps|packages)\/.*\.ts$/ },
            ({ path }) => {
              if (!path.startsWith(root + "/")) return;
              let source = readFileSync(
                archive ? join(archive, path.slice(root.length + 1)) : path,
                "utf8",
              );
              if (
                mode === "barrier" &&
                path.endsWith("/apps/server/src/server.ts")
              ) {
                // The store is `store` before the stream-wake merge (the
                // 8d85f5e2 baseline) and `rawStore` after it.
                const markers = ["store", "rawStore"].map(
                  (name) =>
                    `      const ${name} = yield* Effect.acquireRelease(\n        openStore({ path: options.path }),\n        (store) => Effect.orDie(store.close()),\n      );`,
                );
                const found = markers.filter(
                  (candidate) => source.split(candidate).length === 2,
                );
                assert.equal(found.length, 1);
                const marker = found[0] ?? "";
                source =
                  `\nasync function routingBarrier(phase: string) { const fs = await import('node:fs'); const dir = process.env.ROUTING_BARRIER; if (!dir) return; fs.writeFileSync(dir+'/'+phase+'.ready','ready'); const end=performance.now()+30000; while(!fs.existsSync(dir+'/'+phase+'.go')) { if(performance.now()>end)throw Error('Startup barrier expired'); await new Promise(r=>setTimeout(r,5)); }}\n` +
                  source.replace(
                    marker,
                    `      yield* Effect.promise(() => routingBarrier('before'));\n${marker}\n      yield* Effect.sync(() => { if(process.env.ROUTING_BARRIER) require('node:fs').writeFileSync(process.env.ROUTING_BARRIER+'/store-opened','ready'); });\n      yield* Effect.promise(() => routingBarrier('after'));`,
                  );
                changes++;
              }
              if (
                mode === "reset" &&
                path.endsWith("/apps/cli/src/macos-password.ts")
              ) {
                source =
                  "export const verifyMacPassword = async (_password: string) => true;";
                changes++;
              }
              return { contents: source, loader: "ts" };
            },
          );
        },
      },
    ],
  });
  assert.equal(result.success, true, result.logs.map(String).join("\n"));
  assert.equal(changes, 1);
  console.log(
    JSON.stringify({ output, revision: revision ?? null, changes, mode }),
  );
}
