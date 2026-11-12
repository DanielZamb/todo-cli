import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const node = fs.realpathSync(process.execPath);
const system = { sh: '/bin/sh', ps: '/bin/ps', git: '/usr/bin/git', xcrun: '/usr/bin/xcrun', xcodebuild: '/usr/bin/xcodebuild', codesign: '/usr/bin/codesign', screencapture: '/usr/sbin/screencapture', ruby: '/usr/bin/ruby', lsof: '/usr/sbin/lsof', lockf: '/usr/bin/lockf' };
const candidates = { bun: [path.join(os.userInfo().homedir, '.bun/bin/bun'), '/opt/homebrew/bin/bun', '/usr/local/bin/bun'], pnpm: [path.join(path.dirname(node), 'pnpm'), '/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'] };
export function executable(name) {
  if (name === 'node') return node;
  if (system[name]) return system[name];
  if (candidates[name]) { const found = candidates[name].find(p => fs.existsSync(p)); assert(found, 'Required trusted tool unavailable: ' + name); return fs.realpathSync(found); }
  assert(path.isAbsolute(name), 'An executable must use an absolute path: ' + name);
  return name;
}
export function environment(home, temporary, values = {}) {
  assert(path.isAbsolute(home) && path.isAbsolute(temporary));
  const directories = [path.dirname(node), path.dirname(executable('bun')), '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const result = { HOME: home, CFFIXED_USER_HOME: home, TMPDIR: temporary, LANG: 'C', LC_ALL: 'C', PATH: [...new Set(directories)].join(':'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const [key, value] of Object.entries(values)) {
    assert(/^(TODO_(DB|PORT|VERIFICATION_MANIFEST|SERVER_BINARY|CLI_BINARY|SEED_BINARY|SWIFT_BUILD_PATH|VERIFICATION_TRAP_LIBRARY)|SEC_SEARCH_RECOVERY_SEED)$/.test(key), 'Unapproved process setting: ' + key);
    result[key] = String(value);
  }
  return result;
}
export function command(argv) {
  let [program, ...args] = argv;
  if (program === 'git' || program === '/usr/bin/git') return ['/usr/bin/git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'credential.helper=', ...args];
  if (program.endsWith('.mjs')) return [node, path.resolve(program), ...args];
  if (program.endsWith('.sh')) return ['/bin/sh', path.resolve(program), ...args];
  return [executable(program), ...args];
}
export function run(argv, options) {
  const expanded = command(argv);
  assert(options?.env && !Object.keys(options.env).some(key => /^(DYLD_|CURL_|SSLKEYLOGFILE$|NODE_OPTIONS$|BUN_OPTIONS$|.*PROXY$)/i.test(key)), 'Ambient configuration reached a child boundary');
  return spawnSync(expanded[0], expanded.slice(1), { ...options });
}
export function start(argv, options) {
  const expanded = command(argv);
  assert(options?.env && !Object.keys(options.env).some(key => /^(DYLD_|CURL_|SSLKEYLOGFILE$|NODE_OPTIONS$|BUN_OPTIONS$|.*PROXY$)/i.test(key)));
  return spawn(expanded[0], expanded.slice(1), { ...options });
}
