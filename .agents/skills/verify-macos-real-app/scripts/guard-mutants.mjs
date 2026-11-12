import fs from 'node:fs';
import path from 'node:path';
export function generateGuardMutants(root, output) {
  const file = 'apps/macos/VerificationApp/LaunchGuard.swift';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = source.split('\n');
  const variants = [];
  for (const [index, line] of lines.entries()) {
    const call = line.includes('try verificationRequire(') ? 'try verificationRequire(' : 'try require(';
    const start = line.indexOf(call), end = line.lastIndexOf(', "');
    if (start < 0 || end < start) continue;
    const expression = line.slice(start + call.length, end);
    const replacement = line.slice(0, start) + call + '!(' + expression + ')' + line.slice(end);
    variants.push({ file, line: index + 1, original: line.trim(), replacement: replacement.trim(), source: lines.map((value, at) => at === index ? replacement : value).join('\n') });
  }
  const names = ['VerificationManifest', 'VerificationRefusal', 'ScratchDescriptor', 'ScratchFiles', 'VerificationClaim', 'VerificationHTTP', 'LaunchGuard', 'verificationRequire', 'verificationCanonical'];
  const copies = variants.map((variant, index) => {
    let value = variant.source.replace(/@_silgen_name\("[^"]+"\)\n(?:private )?func[^\n]+\n/g, '');
    for (const name of names) value = value.replaceAll(new RegExp('\\b' + name + '\\b', 'g'), 'Mutant' + index + '_' + name);
    return value;
  });
  const call = name => 'try ' + name + '.check(expectedContract: VerificationBuild.contract, visible: true, expectedServerSHA256: VerificationBuild.serverSHA256, expectedCLISHA256: VerificationBuild.cliSHA256, expectedBoundarySHA256: VerificationBuild.boundarySHA256, expectedPreflightSHA256: VerificationBuild.preflightSHA256, beforeSandbox: { data in let state = try JSONSerialization.jsonObject(with: data) as! [String: Any]; let captured = state["uptimeSeconds"] as! Double; try verificationRequire(ProcessInfo.processInfo.systemUptime >= captured && ProcessInfo.processInfo.systemUptime - captured <= 2, "The compiled metadata result became stale in the headless predicate test.") })';
  const cases = variants.map((_, index) => 'case "' + index + '": defer { Mutant' + index + '_LaunchGuard.stop() }; ' + call('Mutant' + index + '_LaunchGuard'));
  const driver = '\n@main struct GuardMutants { @MainActor static func main() { do { switch CommandLine.arguments[1] { case "baseline": defer { LaunchGuard.stop() }; ' + call('LaunchGuard') + '\n' + cases.join('\n') + '\ndefault: exit(2) }; print("manifest accepted") } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\\n").utf8)); exit(78) } } }\n';
  const generated = path.join(output, 'GuardMutants.swift');
  fs.writeFileSync(generated, source + '\n' + copies.join('\n') + driver);
  return { generated, variants: variants.map(({ source, ...variant }, index) => ({ index, ...variant })) };
}
