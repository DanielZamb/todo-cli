import fs from 'node:fs';
import path from 'node:path';

export function generateGuardMutants(root, scratch) {
  const file = 'apps/macos/VerificationApp/LaunchGuard.swift';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const split = source.indexOf('@MainActor enum LaunchGuard');
  const declarations = source.slice(0, split);
  const body = source.slice(split);
  const variants = [];
  for (const [index, line] of body.split('\n').entries()) {
    const start = line.indexOf('try require(');
    const separator = line.lastIndexOf(', "');
    if (start < 0 || separator < 0) continue;
    const expression = line.slice(start + 'try require('.length, separator);
    const replacement = line.slice(0, start) + 'try require(!(' + expression + ')' + line.slice(separator);
    variants.push({ file, line: source.slice(0, split).split('\n').length + index, original: line.trim(), replacement: replacement.trim(), source: body.split('\n').map((value, at) => at === index ? replacement : value).join('\n') });
  }
  const presence = 'guard let path = environment["TODO_VERIFICATION_MANIFEST"] else {';
  variants.push({ file, original: presence, replacement: 'guard let path = environment["TODO_VERIFICATION_MANIFEST"].flatMap({ _ -> String? in nil }) else {', source: body.replace(presence, 'guard let path = environment["TODO_VERIFICATION_MANIFEST"].flatMap({ _ -> String? in nil }) else {') });
  const url = 'destination.host == "127.0.0.1"';
  variants.push({ file, original: url, replacement: 'destination.host != "127.0.0.1"', source: body.replace(url, 'destination.host != "127.0.0.1"') });
  const ownFile = 'apps/macos/VerificationApp/OwnerIdle.swift';
  const own = fs.readFileSync(path.join(root, ownFile), 'utf8');
  const ownSplit = own.indexOf('@MainActor enum OwnerIdle');
  const ownDeclarations = own.slice(0, ownSplit);
  const ownBody = own.slice(ownSplit);
  for (const line of ownBody.split('\n').filter(line => line.includes('try LaunchGuard.require('))) {
    const start = line.indexOf('try LaunchGuard.require(');
    const separator = line.lastIndexOf(', "');
    const expression = line.slice(start + 'try LaunchGuard.require('.length, separator);
    const replacement = line.slice(0, start) + 'try LaunchGuard.require(!(' + expression + ')' + line.slice(separator);
    variants.push({ file: ownFile, original: line.trim(), replacement: replacement.trim(), owner: true, source: ownBody.replace(line, replacement) });
  }
  variants.push({ file: ownFile, original: 'idleSeconds.contains { $0 < elapsed }', replacement: 'idleSeconds.contains { $0 >= elapsed }', owner: true, timer: true, source: ownBody.replace('idleSeconds.contains { $0 < elapsed }', 'idleSeconds.contains { $0 >= elapsed }') });
  const entryFile = 'apps/macos/VerificationApp/VerificationApp.swift';
  const registrationLine = fs.readFileSync(path.join(root, entryFile), 'utf8').split('\n').find(line => line.includes('try LaunchGuard.require(registration == noErr'));
  variants.push({ file: entryFile, original: registrationLine.trim(), replacement: registrationLine.trim().replace('registration == noErr', 'registration != noErr'), registration: true, source: '@MainActor enum RegistrationGuard { static func check(expectedContract: String?) throws { let registration: Int32 = 0; ' + registrationLine.trim().replace('registration == noErr', 'registration != noErr') + ' } }' });
  const launch = declarations + '\n' + body;
  const classes = variants.map((variant, index) => variant.source.replaceAll(variant.registration ? 'RegistrationGuard' : variant.owner ? 'OwnerIdle' : 'LaunchGuard', 'GuardMutant' + index));
  const cases = variants.map((variant, index) => variant.timer ? 'case "' + index + '": try LaunchGuard.require(!GuardMutant' + index + '.sessionInputArrived(elapsed: 10, idleSeconds: [120]), "The idle timer must retain an idle app.")' : 'case "' + index + '": try GuardMutant' + index + (variant.owner ? '.validate(OwnerPreflight(frontmostBundleID: "synthetic", frontmostName: "synthetic", frontmostBundleName: "Finder.app", idleSeconds: 120, hidIdleSeconds: 120))' : '.check(expectedContract: CommandLine.arguments[2])'));
  const driver = `\n@main struct MutantProbe {\n @MainActor static func main() {\n do {\n switch CommandLine.arguments[1] {\n case "baseline": try LaunchGuard.check(expectedContract: CommandLine.arguments[2])\n ${cases.join('\n')}\n default: exit(2)\n }\n print("manifest accepted")\n } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\\n").utf8)); exit(78) }\n }\n}\n`;
  const generated = path.join(scratch, 'GuardMutants.swift');
  fs.writeFileSync(generated, 'import CoreServices\n' + launch + '\n' + ownDeclarations + '\n' + classes.join('\n') + driver);
  return { generated, variants: variants.map(({ source, ...receipt }, index) => ({ ...receipt, index })) };
}
