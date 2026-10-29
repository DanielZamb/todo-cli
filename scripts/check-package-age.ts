import { readFileSync } from "node:fs";

const minimumDays = Number(process.argv[2] ?? 7);
const lock = readFileSync("pnpm-lock.yaml", "utf8");
const section = lock.split(/^packages:\s*$/m)[1]?.split(/^snapshots:\s*$/m)[0] ?? "";
const entries = [...section.matchAll(/^ {2}'?(@?[^@\s']+)@([^\s'():]+)'?:\s*$/gm)].map(([, name, version]) => ({ name, version }));
const cutoff = Date.now() - minimumDays * 86_400_000;

const check = async ({ name, version }: { name: string; version: string }) => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!response.ok) return { name, version, status: `registry ${response.status}` };
  const published = (await response.json()).time?.[version];
  if (!published) return { name, version, status: "no publish time" };
  return { name, version, published, status: Date.parse(published) > cutoff ? "too new" : "ok" };
};

const results = [];
for (let index = 0; index < entries.length; index += 12) {
  results.push(...(await Promise.all(entries.slice(index, index + 12).map(check))));
}
const problems = results.filter((result) => result.status !== "ok");
console.log(JSON.stringify({ minimumDays, checked: results.length, problems }, null, 2));
process.exit(problems.length === 0 ? 0 : 1);
