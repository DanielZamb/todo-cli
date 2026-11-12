import assert from 'node:assert/strict';
import { command, environment } from './process-policy.mjs';
const hostile = ['HOME', 'CFFIXED_USER_HOME', 'PATH', 'CURL_HOME', 'CURL_CA_BUNDLE', 'NETRC', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'SSLKEYLOGFILE', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_PRINT_TO_FILE', 'NODE_OPTIONS', 'BUN_OPTIONS', 'ENV', 'BASH_ENV', 'RUBYOPT', 'PYTHONPATH', 'XDG_CONFIG_HOME', 'DEVELOPER_DIR', 'GIT_CONFIG_PARAMETERS'];
const old = new Map(hostile.map(key => [key, process.env[key]]));
try {
  for (const key of hostile) process.env[key] = '/untrusted/' + key;
  const env = environment('/private/tmp/owned/home', '/private/tmp/owned/tmp');
  assert.equal(env.HOME, '/private/tmp/owned/home'); assert.equal(env.CFFIXED_USER_HOME, env.HOME);
  for (const key of hostile.filter(key => !['HOME', 'CFFIXED_USER_HOME', 'PATH'].includes(key))) assert(!(key in env), key);
  assert(!env.PATH.includes('/untrusted'));
  for (const name of ['node', 'bun', 'git', 'xcrun', 'xcodebuild', 'codesign']) assert(command([name])[0].startsWith('/'));
  console.log('PASS: explicit child environment ignores every hostile parent setting');
} finally { for (const [key, value] of old) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
