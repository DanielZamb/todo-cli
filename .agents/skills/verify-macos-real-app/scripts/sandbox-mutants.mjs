import fs from 'node:fs';
import path from 'node:path';
export function generateSandboxMutants(root, scratch) {
  const file = 'apps/macos/VerificationApp/ScratchSandbox.swift';
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  const variants = original.split('\n').filter(line => /^\s+\((deny|allow) /.test(line) && !line.includes('(allow default)')).map(line => ({ file, original: line.trim(), replacement: '(removed)', source: original.replace(line, '') }));
  const resultGuard = original.split('\n').find(line => line.includes('try LaunchGuard.require(result == 0'));
  variants.push({ file, original: resultGuard.trim(), replacement: resultGuard.trim().replace('result == 0', 'result != 0'), source: original.replace(resultGuard, resultGuard.replace('result == 0', 'result != 0')) });
  const ownerGuard = 'getpwuid(getuid())';
  variants.push({ file, original: ownerGuard, replacement: 'getpwuid(getuid()).flatMap { _ -> UnsafeMutablePointer<passwd>? in nil }', source: original.replace(ownerGuard, '(getpwuid(getuid()).flatMap { _ -> UnsafeMutablePointer<passwd>? in nil })') });
  const cases = variants.map((_, index) => 'case "' + index + '": try SandboxMutant' + index + '.install(manifest)');
  const probe = fs.readFileSync(path.join(root, '.agents/skills/verify-macos-real-app/scripts/SandboxProbe.swift'), 'utf8').replace('try ScratchSandbox.install(manifest)', 'switch CommandLine.arguments[5] {\ncase "baseline": try ScratchSandbox.install(manifest)\n' + cases.join('\n') + '\ndefault: exit(2)\n}');
  const filePath = path.join(scratch, 'SandboxMutants.swift');
  fs.writeFileSync(filePath, original + '\n' + variants.map((variant, index) => variant.source.replaceAll('ScratchSandbox', 'SandboxMutant' + index).replaceAll('sandboxInitialize', 'sandboxInitialize' + index).replaceAll('sandboxFreeError', 'sandboxFreeError' + index)).join('\n') + '\n' + probe);
  return { generated: filePath, variants: variants.map(({ source, ...receipt }, index) => ({ ...receipt, index })) };
}
