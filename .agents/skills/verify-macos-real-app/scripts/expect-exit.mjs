import { environment, run, command } from './process-policy.mjs';
const [expected, root, program, ...args] = process.argv.slice(2);
const env = environment(root + '/home', root + '/tmp', { TODO_VERIFICATION_MANIFEST: root + '/manifest.json' });
const value = run([program, ...args], { env, encoding: 'utf8', timeout: 1200000 });
const passed = value.status === Number(expected);
console.log(JSON.stringify({ expectedExit: Number(expected), exit: value.status, signal: value.signal, error: value.error?.code, stdout: value.stdout, stderr: value.stderr, command: command([program, ...args]), environment: env, passed }));
process.exit(passed ? 0 : 1);
