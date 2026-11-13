import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command, environment, run } from './process-policy.mjs';
import { SEAM_FILE, checkSeam } from './production-seam.mjs';

process.umask(0o077);
const evidence = process.argv[2], baseline = process.argv[3];
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-source-audit-'));
fs.mkdirSync(scratch + '/home'); fs.mkdirSync(scratch + '/tmp');
const env = environment(scratch + '/home', scratch + '/tmp'), commands = [];
function checked(argv, label) {
  const value = run(argv, { env, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal });
  fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); assert.equal(value.status, 0, value.stderr); return value.stdout;
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let result = { status: 'FAIL', freshProductionBinaryClaimed: false, appLaunched: false, SwiftStarted: false };
try {
  const prior = JSON.parse(fs.readFileSync(path.join(baseline, 'comparison.json'), 'utf8'));
  assert.equal(prior.status, 'PASS'); assert.equal(prior.baselineSourceHead, '8b9be429751165d4ecef11f3f23d1844384e54b4');
  assert.equal(prior.symbolsAdded.length, 26); assert.deepEqual(prior.symbolsRemoved, []);
  result.sourceHead = checked(['git', 'rev-parse', 'HEAD'], 'head').trim();
  const paths = ['apps/macos/Sources', 'apps/macos/API', 'apps/macos/Resources', 'apps/macos/Todo.xcodeproj', 'apps/macos/Package.swift', 'apps/macos/Tests', 'apps/macos/StateTests', 'apps/macos/DesignSnapshots'];
  // Product code equals the installed candidate 8 except the reviewed Session storage seam, line for line.
  const productBase = '20d592d3ba50b38cf17c697d0645304e75334cc1';
  const changedFiles = checked(['git', 'diff', '--name-only', productBase, '--', ...paths], 'production-source-diff-files').trim().split('\n').filter(Boolean);
  const reviewedDiff = checked(['git', 'diff', '8b9be429751165d4ecef11f3f23d1844384e54b4', 'ab989410cef89b5670fc2a6101698441753b5ec5', '--', SEAM_FILE], 'reviewed-seam-diff');
  const currentDiff = checked(['git', 'diff', productBase, '--', SEAM_FILE], 'production-source-diff');
  const seam = checkSeam({ changedFiles, reviewedDiff, currentDiff });
  const files = checked(['git', 'ls-files', '--', ...paths], 'production-source-files').trim().split('\n').filter(Boolean);
  const sources = Object.fromEntries(files.map(file => [file, hash(file)]));
  assert.equal(sources['apps/macos/Sources/SessionVault.swift'], prior.sessionVaultSourceSHA256);
  fs.writeFileSync(evidence + '/reviewed-comparison.json', JSON.stringify(prior, null, 2));
  result = { ...result, status: 'PASS_SOURCE_CONTINUITY', sourceHead: result.sourceHead, productBase, seam, symbolComparisonAgainstProductBase: false, reviewedSymbolSourceHead: 'ab989410cef89b5670fc2a6101698441753b5ec5', reviewedComparisonSHA256: hash(path.join(baseline, 'comparison.json')), baselineBinarySHA256: prior.baselineBinarySHA256, reviewedProductionBinarySHA256: prior.productionBinarySHA256, symbolsAdded: prior.symbolsAdded, symbolsRemoved: prior.symbolsRemoved, credentialImports: prior.credentialImports, sources };
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); fs.rmSync(scratch, { recursive: true });
  console.log(JSON.stringify({ status: result.status, sourceHead: result.sourceHead, freshProductionBinaryClaimed: false, error: result.error }));
}
