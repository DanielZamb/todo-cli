import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Schema } from "effect";

const PackageLicense = Schema.Struct({
  name: Schema.String,
  versions: Schema.Array(Schema.String),
  paths: Schema.Array(Schema.String),
  license: Schema.String,
});
const LicenseInventory = Schema.Record(
  Schema.String,
  Schema.Array(PackageLicense),
);

const root = resolve(import.meta.dirname, "..");
const output = process.argv[2];
if (!output || !isAbsolute(output) || process.argv.length !== 3)
  throw new Error(
    "Usage: bun scripts/third-party-notices.ts <absolute-output-file>",
  );

const inventory: unknown = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }),
);
const packages = Object.values(
  Schema.decodeUnknownSync(LicenseInventory)(inventory),
)
  .flat()
  .sort((left, right) => left.name.localeCompare(right.name));
const sections = [
  `Todo and third-party license notices\n\n${readFileSync(join(root, "LICENSE"), "utf8")}`,
  readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8"),
];
for (const pkg of packages) {
  const source = pkg.name.startsWith("@rolldown/binding-")
    ? packages.find((entry) => entry.name === "rolldown")
    : pkg;
  if (!source) throw new Error(`Missing upstream license for ${pkg.name}`);
  const texts = new Set<string>();
  for (const path of source.paths) {
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name);
      if (
        /^(licen[cs]e|copying|notice|third[-_ ]?party)/i.test(name) &&
        statSync(file).isFile()
      )
        texts.add(readFileSync(file, "utf8").trim());
    }
  }
  if (!texts.size) throw new Error(`No license files found for ${pkg.name}`);
  sections.push(
    `${pkg.name} ${pkg.versions.join(", ")} (${pkg.license})\n\n${[...texts].join("\n\n")}`,
  );
}
function appendNotices(directory: string, prefix = "licenses") {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const label = `${prefix}/${name}`;
    if (statSync(path).isDirectory()) appendNotices(path, label);
    else sections.push(`${label}\n\n${readFileSync(path, "utf8").trim()}`);
  }
}
appendNotices(join(root, "licenses"));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${sections.join("\n\n--------------------\n\n")}\n`);
console.log(`Wrote notices for ${packages.length} packages to ${output}`);
