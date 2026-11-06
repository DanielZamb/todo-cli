import { execFileSync } from 'node:child_process';
import path from 'node:path';

const revision = process.argv[2] ?? 'HEAD';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const commit = git('rev-parse', '--verify', `${revision}^{commit}`).trim();
const entries = new Set(git('ls-tree', '-r', '-t', '--name-only', '-z', commit).split('\0').filter(Boolean));
const documents = [...entries].filter(file => file.endsWith('.md') && (
  file.startsWith('.agents/skills/verify-macos/') ||
  file.startsWith('.agents/skills/verify-macos-lifecycle/') ||
  file === 'apps/macos/README.md' || file === 'apps/macos/HANDOFF.md' ||
  file.startsWith('design/')
));
const broken = [];
let localLinks = 0;
for (const file of documents) {
  const source = git('show', `${commit}:${file}`);
  let fence;
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const text = line.replace(/(`+).*?\1/g, '');
    const destinations = [
      ...text.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g),
      ...text.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/g),
    ];
    for (const match of destinations) {
      const link = match[1] ?? match[2];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(link)) continue;
      const target = decodeURIComponent(link.split(/[?#]/)[0]);
      if (!target) continue;
      localLinks++;
      const resolved = target.startsWith('/')
        ? path.posix.normalize(target.slice(1))
        : path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (!entries.has(resolved.replace(/\/$/, ''))) broken.push({ file, line: index + 1, link, resolved });
    }
  }
}
console.log(JSON.stringify({ commit, documents: documents.length, localLinks, brokenCount: broken.length, broken }, null, 2));
process.exitCode = broken.length ? 1 : 0;
