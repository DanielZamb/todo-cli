import assert from 'node:assert/strict';
import { undefinedSymbolNames } from './mach-o-imports.mjs';
assert.deepEqual(undefinedSymbolNames('_SecItemAdd\n_SecKeyCreateRandomKey\n_dyld_stub_binder\n'), ['SecItemAdd', 'SecKeyCreateRandomKey', 'dyld_stub_binder']);
assert.deepEqual(undefinedSymbolNames('_$s10FoundationType\n_OBJC_CLASS_$_NSObject\n'), ['$s10FoundationType', 'OBJC_CLASS_$_NSObject']);
assert.deepEqual(undefinedSymbolNames(''), []);
assert.throws(() => undefinedSymbolNames(' U _SecItemAdd\n'), /Unexpected nm/);
assert.throws(() => undefinedSymbolNames('unexpected column format\n'), /Unexpected nm/);
console.log('PASS: explicit nm names-only output is parsed; unknown formats fail closed');
