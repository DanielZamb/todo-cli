import assert from 'node:assert/strict';
import { protectedDenials } from './production-denials.mjs';
const rows = [
 { timestamp: 'first', eventMessage: 'Sandbox: host(42) deny(1) file-read-data /synthetic/owner/.todo-cli/todo.db' },
 { timestamp: 'second', eventMessage: 'Sandbox: host(42) deny(1) mach-lookup com.apple.securityd.xpc (xpc)' },
 { timestamp: 'foreign', eventMessage: 'Sandbox: host(43) deny(1) file-write-create /synthetic/owner/.todo-cli/snapshot' },
 { eventMessage: 'Sandbox: host(42) deny(1) file-read-data /synthetic/owner/.todo-cli-other/file' },
 { eventMessage: 'Sandbox: host(42) deny(1) mach-lookup com.apple.CARenderServer' },
];
assert.deepEqual(protectedDenials(rows, [42], ['/synthetic/owner/.todo-cli'], ['com.apple.securityd']), [
 { pid: 42, timestamp: 'first', message: rows[0].eventMessage },
 { pid: 42, timestamp: 'second', message: rows[1].eventMessage },
]);
assert.deepEqual(protectedDenials([], [42], ['/synthetic/owner/.todo-cli'], ['com.apple.securityd']), []);
assert.throws(() => protectedDenials([{eventMessage:'Sandbox: unknown'}], [42], [], []), /Unknown/);
assert.throws(() => protectedDenials({}, [42], [], []));
console.log('PASS: own-PID protected paths/services, boundaries, foreign/unrelated exclusions and fail-closed parsing');
