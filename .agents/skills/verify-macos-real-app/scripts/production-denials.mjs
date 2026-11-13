import assert from 'node:assert/strict';
export function protectedDenials(rows, pids, paths, services) {
 assert(Array.isArray(rows) && pids.length && pids.every(pid => Number.isInteger(pid) && pid > 0));
 const owned = new Set(pids), result = [];
 for (const row of rows) {
  if (typeof row.eventMessage !== 'string' || !row.eventMessage.startsWith('Sandbox:')) continue;
  const match = row.eventMessage.match(/\((\d+)\)\s+deny(?:\(\d+\))?\s+(.+)$/);
  assert(match, 'Unknown sandbox denial format');
  if (!owned.has(Number(match[1]))) continue;
  const detail = match[2];
  const file = detail.match(/^(file-\S+)\s+(.+)$/);
  const service = detail.match(/^mach-lookup\s+(\S+)/);
  const protectedFile = file && paths.some(root => file[2] === root || file[2].startsWith(root + '/'));
  const protectedService = service && services.some(name => service[1] === name || service[1].startsWith(name + '.'));
  if (protectedFile || protectedService) result.push({ pid: Number(match[1]), timestamp: row.timestamp, message: row.eventMessage });
 }
 return result;
}
