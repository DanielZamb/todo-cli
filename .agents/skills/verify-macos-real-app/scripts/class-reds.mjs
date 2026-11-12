import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

export async function runClassReds(c) {
  const { tools, native, evidence, execute, must, fixture, build, guardFile, bindings, policyObject, sourceHead } = c;
  const reds = [];
  const owner = 'apps/macos/VerificationApp/OwnerIdle.swift';
  const sandbox = 'apps/macos/VerificationApp/ScratchSandbox.swift';
  const defaults = 'apps/macos/VerificationApp/VerificationDefaults.swift';
  const probe = '.agents/skills/verify-macos-real-app/scripts/NativeBoundaryProbe.swift';
  function variant(file, before, after, label) {
    const source = fs.readFileSync(file, 'utf8'); assert(source.includes(before), label);
    const output = tools + '/' + label + '.swift'; fs.writeFileSync(output, source.replace(before, after)); return output;
  }
  function expected(program, args, expected, label, env) {
    const value = execute([program, ...args], label, env);
    // This is the literal matching assertion used by the baseline; run it in a separate process.
    const assertion = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]), Number(process.argv[2]))', String(value.status), String(expected)], label + '-matching-test');
    assert.equal(assertion.status, 1, label + ' unexpectedly passed');
    reds.push({ label, observedExit: value.status, expectedExit: expected, matchingTestExit: assertion.status });
  }
  for (const [label, before, after, mode, expectedExit] of [
    ['modifier-mask-removed', '.keyUp, .flagsChanged,', '.keyUp,', 'input-mask', 0],
    ['HID-stop-removed', 'sessionIdle < 0 || hidIdle < 0 || sessionIdle < elapsed || hidIdle < elapsed', 'false', 'busy-main', 80],
  ]) {
    const file = variant(owner, before, after, label);
    build([guardFile, bindings, owner, probe], native + '/' + label, 'build-' + label, [policyObject], { [owner]: file });
    expected(native + '/' + label, [mode], expectedExit, label);
  }
  {
    const file = variant(owner, 'NSEvent.addLocalMonitorForEvents(matching: inputMask)', 'NSEvent.addLocalMonitorForEvents(matching: [])', 'local-monitor-removed');
    build([guardFile, owner, '.agents/skills/verify-macos-real-app/scripts/InputCoverageProbe.swift'], native + '/no-local-monitor', 'build-no-local-monitor', [], { [owner]: file });
    expected(native + '/no-local-monitor', [tools + '/red-input', 'modifier'], 80, 'local-monitor-removed');
  }
  {
    const file = variant(defaults, 'method_exchangeImplementations(original, replacement)', '// mutation: leave ambient standard defaults selected', 'memory-defaults-removed');
    build([guardFile, bindings, owner, probe], native + '/no-memory-defaults', 'build-no-memory-defaults', [policyObject], { [defaults]: file });
    expected(native + '/no-memory-defaults', ['defaults'], 0, 'memory-defaults-removed');
  }
  const sentinel = tools + '/outside-sandbox-sentinel'; fs.writeFileSync(sentinel, 'synthetic');
  const listener = http.createServer((request, response) => response.end('scratch'));
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  try {
    const args = ['sandbox', sentinel, String(listener.address().port)];
    const f = await fixture(); try { must([native + '/boundary', ...args], 'sandbox-baseline', f.env); } finally { f.dispose(); }
    for (const [label, before, after, mode] of [
      ['outside-file-read-allowed', '(deny file-read*)', '(allow file-read*)', 'sandbox'],
      ['outside-file-write-allowed', '(deny file-write*)', '(allow file-write*)', 'sandbox'],
      ['unrelated-network-allowed', '(deny network-outbound)', '(allow network-outbound)', 'sandbox'],
      ['unapproved-exec-allowed', '(deny process-exec)', '(allow process-exec)', 'sandbox'],
      ['credential-brokers-allowed', '(deny mach-lookup)', '(allow mach-lookup)', 'policy'],
      ['scratch-files-denied', '(allow file-read* file-write* (subpath \\(literal(root))))', '(allow file-read* (subpath \\(literal(root))))', 'sandbox'],
      ['owned-server-exec-denied', '(allow process-exec (literal \\(literal(executable))))', '', 'sandbox'],
      ['owned-server-network-denied', '(allow network-outbound (remote ip "localhost:\\(port)"))', '', 'sandbox'],
    ]) {
      const file = variant(sandbox, before, after, label);
      build([guardFile, bindings, owner, probe], native + '/' + label, 'build-' + label, [policyObject], { [sandbox]: file });
      const f = await fixture(); try { expected(native + '/' + label, mode === 'sandbox' ? args : ['policy'], 0, label, f.env); } finally { f.dispose(); }
      assert.equal(fs.readFileSync(sentinel, 'utf8'), label === 'outside-file-write-allowed' ? 'must remain untouched' : 'synthetic');
      fs.writeFileSync(sentinel, 'synthetic');
    }
  } finally { await new Promise(resolve => listener.close(resolve)); }
  must(['node', '.agents/skills/verify-macos-real-app/scripts/process-policy.test.mjs'], 'process-policy');
  fs.writeFileSync(evidence + '/class-reds.json', JSON.stringify({ sourceHead, controls: reds, originalCredentialCalls: false }, null, 2));
}
