import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [kind, output] = process.argv.slice(2);
assert.ok(['cli', 'server'].includes(kind) && output);
const result = await Bun.build({ entrypoints: [resolve(kind === 'cli' ? 'apps/cli/src/main.ts' : 'apps/server/src/main.ts')], target: 'bun', compile: { outfile: resolve(output) }, plugins: [{ name: 'restore-transaction-entry', setup(build) {
  build.onLoad({ filter: /packages\/domain\/src\/store\/snapshots\.ts$/ }, ({ path }) => {
    let contents = readFileSync(path, 'utf8');
    const marker = '      const stage = join(this.directory, `.restore-${randomUUID()}.sqlite`);';
    assert.equal(contents.split(marker).length, 2);
    contents = contents.replace(marker, '      console.error("RESTORE_ENTRY_TRANSACTION " + this.db.inTransaction);\n      if (this.db.inTransaction) throw new Error("Public restore must start outside a read lease");\n' + marker);
    return { contents, loader: 'ts' };
  });
} }] });
assert.ok(result.success, result.logs.map(String).join('\n'));
