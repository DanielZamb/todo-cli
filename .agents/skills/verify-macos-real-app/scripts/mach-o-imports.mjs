import assert from 'node:assert/strict';
export function undefinedSymbolNames(output) {
 const names = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
 for (const name of names) assert(!/\s/.test(name), 'Unexpected nm names-only output: ' + name);
 return names.map(name => name.startsWith('_') ? name.slice(1) : name);
}
