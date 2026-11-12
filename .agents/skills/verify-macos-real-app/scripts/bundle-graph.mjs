import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'apps/electron/graph-browser/graph-browser.lock.json')));
const source = path.join(root, 'apps/electron/dist/graph-browser');
const target = path.resolve(process.argv[2]);
fs.mkdirSync(target, { recursive: true });
for (const [name, expected] of Object.entries(lock.files)) {
  assert(name === path.basename(name));
  const file = path.join(source, name);
  assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
  const data = fs.readFileSync(file);
  assert.equal(data.length, expected.bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), expected.sha256);
  fs.writeFileSync(path.join(target, name), data);
}
assert.deepEqual(fs.readdirSync(target).sort(), Object.keys(lock.files).sort());
console.log('PASS: canonical graph resources, no child process or network');
