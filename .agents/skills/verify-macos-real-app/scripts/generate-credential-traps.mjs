import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [sdk, output, temporary] = process.argv.slice(2);
const tbd = path.join(sdk, 'System/Library/Frameworks/Security.framework/Versions/A/Security.tbd');
const exported = [...new Set([...fs.readFileSync(tbd, 'utf8').matchAll(/_([A-Za-z][A-Za-z0-9_]*)/g)].map(x => x[1]))];
// Exclude only noncredential code/task/requirement metadata and entropy APIs.
// Everything else exported under the Security API namespace is conservatively trapped.
const metadataOnly = name => /^(SecCode(?!Signer)|SecStaticCode|SecRequirement|SecTask|SecRandom)/.test(name);
const names = exported.filter(name => (/^Sec[A-Z]/.test(name) && !metadataOnly(name)) || /^(Authorization|SOS)/.test(name)).sort();

assert(names.includes('SecPKCS12Import') && names.includes('SecKeyCreateRandomKey') && names.includes('SecKeyGeneratePair'));
const source = path.join(temporary, 'credential-presence.c');
fs.writeFileSync(source, '#include <dlfcn.h>\n#include <stdio.h>\nint main(void) {\n' + names.map(name => 'if (dlsym(RTLD_DEFAULT, "' + name + '")) puts("' + name + '");').join('\n') + '\n}\n');
const binary = path.join(temporary, 'credential-presence');
const env = { LANG: 'C', LC_ALL: 'C', TMPDIR: temporary };
const built = spawnSync('/usr/bin/xcrun', ['clang', source, '-Wl,-needed_framework,Security', '-o', binary], { env, encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const census = spawnSync(binary, [], { env, encoding: 'utf8' }); assert.equal(census.status, 0);
const present = census.stdout.trim().split('\n');
fs.writeFileSync(output, present.map(name => 'TRAP(' + name + ')').join('\n') + '\n');
fs.writeFileSync(path.join(temporary, 'credential-export-census.json'), JSON.stringify({ sdkExportCount: names.length, excludedMetadataOnly: exported.filter(metadataOnly).sort(), present, originalCalls: false, compiler: { path: '/usr/bin/xcrun', arguments: ['clang', source, '-Wl,-needed_framework,Security', '-o', binary], environment: env, exit: built.status }, census: { path: binary, arguments: [], environment: env, exit: census.status } }, null, 2));
console.log(JSON.stringify({ exports: names.length, trapped: present.length }));
