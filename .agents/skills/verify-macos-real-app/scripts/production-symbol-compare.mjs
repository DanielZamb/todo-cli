import assert from 'node:assert/strict';

export const VERIFICATION_NAMES = ['VerificationManifest', 'MemorySessionVault', 'ScratchSandbox', 'TodoVerificationApp'];

// The production binary at this head against the installed base: the same credential imports as
// the base and as the six reviewed, no verification code, nothing removed, and exactly the reviewed
// symbols added by the Session storage seam.
export function compareSymbols({ base, candidate, reviewed }) {
 assert(base.imports.length > 0 && base.symbols.length > 0 && candidate.symbols.length > 0, 'Empty symbol or import lists cannot be compared');
 assert.deepEqual(candidate.imports, base.imports, 'Production credential imports changed against candidate 8');
 assert.deepEqual(candidate.imports, reviewed.credentialImports, 'Production credential imports differ from the six reviewed imports');
 for (const name of VERIFICATION_NAMES) assert(!candidate.symbols.some(line => line.includes(name)), 'Verification code reached the production binary: ' + name);
 const added = candidate.symbols.filter(line => !base.symbols.includes(line));
 const removed = base.symbols.filter(line => !candidate.symbols.includes(line));
 assert.deepEqual(removed, [], 'Storage symbols were removed from the production binary');
 assert.deepEqual([...added].sort(), [...reviewed.symbolsAdded].sort(), 'The seam adds different symbols against candidate 8 than the reviewed ones');
 return { symbolsAdded: added, symbolsRemoved: removed };
}
