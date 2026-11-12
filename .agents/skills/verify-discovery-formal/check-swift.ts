import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import coverage from "./coverage.json";
import { discoveryInputs } from "./inputs";
import {
  repositoryInput,
  verificationRoot,
} from "../../../scripts/verification-inputs";

const skill = import.meta.dirname;
const root = verificationRoot(skill);
const commit = process.argv[2] ?? coverage.candidateCommit;
assert.match(commit, /^[a-f0-9]{40}$/, "Pass the full reviewed candidate SHA");
const repeatClean = process.argv[4] === "--repeat-clean=20";
assert.ok(
  process.argv[4] === undefined || repeatClean,
  "Use --repeat-clean=20 for twenty consecutive clean discovery suites",
);
const inputs = discoveryInputs(root, commit);
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "swift-"));
const captured = join(evidence, "source");
mkdirSync(captured);
const reuse =
  process.argv[3] === undefined
    ? undefined
    : repositoryInput(root, process.argv[3], "TODO_DISCOVERY_SWIFT_REUSE");
if (reuse)
  assert.ok(
    reuse.startsWith(`${base}/swift-`),
    "Reuse only this worktree's owned source/build cache",
  );
const source = reuse === undefined ? captured : join(reuse, "source");
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const pinPaths = [
  "apps/macos/Package.resolved",
  "apps/macos/API/Package.resolved",
  "apps/macos/Todo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
];
async function execute(
  label: string,
  command: string,
  args: string[],
  cwd = root,
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  record(`${label}-started`, { command, args, cwd, pid: child.pid });
  let out = "",
    err = "",
    timedOut = false;
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
    appendFileSync(join(evidence, `${label}.stdout`), chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
    appendFileSync(join(evidence, `${label}.stderr`), chunk);
  });
  const stop = () => {
    child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, 600_000);
  try {
    const result = await new Promise<{
      exit: number | null;
      signal: string | null;
    }>((done, reject) => {
      child.on("error", reject);
      child.on("close", (exit, signal) => done({ exit, signal }));
    });
    writeFileSync(join(evidence, `${label}.stdout`), out);
    writeFileSync(join(evidence, `${label}.stderr`), err);
    record(label, { command, args, cwd, ...result, timedOut });
    assert.equal(timedOut, false, "Timeout is incomplete proof");
    assert.equal(result.signal, null, "Interrupted proof");
    return { ...result, out, err };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
async function success(
  label: string,
  command: string,
  args: string[],
  cwd = root,
) {
  const result = await execute(label, command, args, cwd);
  assert.equal(result.exit, 0, `${label}: inspect ${evidence}`);
  return result.out;
}
const slot = repositoryInput(root, "scripts/swift-slot.sh", "Swift build slot");
const wrapper = join(skill, "swift-command.sh");
const clientFile = "apps/macos/Sources/Discovery.swift";
const modelFile = "apps/macos/Sources/TodoModel.swift";
const mutations = [
  {
    name: "publication",
    path: clientFile,
    from: "signedIn && connection == .live && !Task.isCancelled && discovery.credentialEpoch == identity.credentialEpoch && discovery.generation == identity.generation && discovery.dialog == identity.dialog && discovery.requestedIdentity == identity && (identity.dialog == .directory || discovery.prefix == identity.prefix)",
    to: "true",
    filter: "discoveryPublicationDraftDecisionsAndCompletedTaskReveal",
    witness: "Expectation failed: (model.discovery.appliedSnapshot",
  },
  {
    name: "attempt-uuid",
    path: clientFile,
    from: "discovery.showIntent == intent",
    to: "discovery.showIntent?.identity == intent.identity",
    filter: "discoveryPublicationDraftDecisionsAndCompletedTaskReveal",
    witness: "model.discardAndNavigate(cancelledTarget)",
  },
  {
    name: "dismissal",
    path: modelFile,
    from: "func dismissNavigationPrompt() {\n        pendingNavigation = nil\n    }",
    to: "func dismissNavigationPrompt() {\n        pendingNavigation = nil\n        discovery.showIntent = nil\n    }",
    filter:
      "queuedDraftActionsSurviveAlertDismissalAndExplicitCancelRevokesShow",
    witness: "model.discovery.showIntent?.id",
  },
  {
    // Candidate 7: expireSession compares the epoch without Task cancellation, so the epoch
    // comparison is one helper used by both isCurrentCredential and expireSession; the mutant
    // removes it from both layers at once.
    name: "authorization-epoch",
    path: modelFile,
    from: "func isCurrentEpoch(_ credentialEpoch: Int) -> Bool { discovery.credentialEpoch == credentialEpoch }",
    to: "func isCurrentEpoch(_ credentialEpoch: Int) -> Bool { true }",
    filter:
      "oldUnauthorizedCannotExpireReplacementSessionAndCurrentUnauthorizedStillExpires",
    witness: "replacementSurvived",
  },
];
try {
  console.log(`Evidence: ${evidence}`);
  await success("preflight", "sh", [wrapper, "true"]);
  for (const binary of Object.values(inputs.backend.binaries))
    assert.equal(
      sha(readFileSync(binary.path)),
      binary.sha256,
      "Fixed root backend binary drift",
    );
  await success("archive", "git", [
    "archive",
    `--output=${join(evidence, "source.tar")}`,
    commit,
    "apps/macos",
    ".agents/skills/verify-macos/fixtures/auth-epoch",
  ]);
  await success("extract", "tar", [
    "-xf",
    join(evidence, "source.tar"),
    "-C",
    captured,
  ]);
  const paths = (
    await success("source-list", "git", [
      "ls-tree",
      "-r",
      "--name-only",
      commit,
      "--",
      "apps/macos/Sources",
      "apps/macos/API/Sources",
      "apps/macos/StateTests",
    ])
  )
    .trim()
    .split("\n");
  const originals = paths.map((path) => {
    const copied = join(source, path),
      live = join(root, path);
    assert.equal(lstatSync(copied).isSymbolicLink(), false);
    assert.notEqual(lstatSync(copied).ino, lstatSync(live).ino);
    const hash = sha(readFileSync(join(captured, path)));
    assert.equal(
      hash,
      sha(readFileSync(live)),
      "Live source differs from immutable candidate",
    );
    assert.equal(
      sha(readFileSync(copied)),
      reuse && path.endsWith("/SessionVault.swift")
        ? sha(
            readFileSync(
              join(
                source,
                ".agents/skills/verify-macos/fixtures/auth-epoch/SessionVault.swift",
              ),
            ),
          )
        : hash,
      "Reused source must already be restored",
    );
    return { path, hash };
  });
  const memory =
    ".agents/skills/verify-macos/fixtures/auth-epoch/SessionVault.swift";
  for (const [from, to] of [
    [memory, "apps/macos/Sources/SessionVault.swift"],
    [
      ".agents/skills/verify-macos/fixtures/auth-epoch/AuthEpochTests.swift",
      "apps/macos/StateTests/AuthEpochTests.swift",
    ],
  ]) {
    assert.ok(from && to);
    const target = join(source, to);
    if (
      !existsSync(target) ||
      sha(readFileSync(target)) !== sha(readFileSync(join(source, from)))
    )
      copyFileSync(join(source, from), target);
  }
  const packagePath = join(source, "apps/macos/Package.swift");
  const packageOriginal = readFileSync(
    join(captured, "apps/macos/Package.swift"),
    "utf8",
  );
  const beforeTarget =
    '.testTarget(name: "WriteStateTests", dependencies: ["TodoState"], path: "StateTests")';
  assert.equal(packageOriginal.split(beforeTarget).length, 2);
  const proofPackage = packageOriginal.replace(
    beforeTarget,
    '.testTarget(name: "WriteStateTests", dependencies: ["TodoState"], path: "StateTests", sources: ["DiscoveryStateTests.swift", "DiscoveryReportStateTests.swift", "AuthEpochTests.swift"])',
  );
  if (readFileSync(packagePath, "utf8") !== proofPackage)
    writeFileSync(packagePath, proofPackage);
  const build = join(reuse ?? evidence, "swift-build");
  if (!reuse) mkdirSync(build);
  const installed = repositoryInput(
    root,
    process.env.TODO_DISCOVERY_SWIFT_SEED ?? "apps/macos/API/.build",
    "TODO_DISCOVERY_SWIFT_SEED (run make generate-api first)",
  );
  if (!reuse)
    for (const path of ["checkouts", "repositories", "workspace-state.json"])
      await success(`dependencies-${path.replace(".json", "")}`, "cp", [
        "-cR",
        join(installed, path),
        join(build, path),
      ]);
  const cleanPins = pinPaths.map((path) => ({
    path,
    bytes: readFileSync(join(source, path)),
    live: sha(readFileSync(join(root, path))),
  }));
  const dependencyPins: unknown = JSON.parse(
    readFileSync(join(source, "apps/macos/Package.resolved"), "utf8"),
  );
  record("provenance", {
    commit,
    reuse,
    source,
    build,
    originals,
    memoryAdapterHash: sha(readFileSync(join(source, memory))),
    packageOriginalHash: sha(packageOriginal),
    packageProofHash: sha(readFileSync(packagePath)),
    backend: inputs.backend,
    dependencyPins,
    nativeApp: false,
    keychain: false,
  });
  const proofHashes = () =>
    originals.map(({ path, hash }) => ({
      path,
      expected: path.endsWith("/SessionVault.swift")
        ? sha(readFileSync(join(source, memory)))
        : hash,
      observed: sha(readFileSync(join(source, path))),
      live: sha(readFileSync(join(root, path))),
    }));
  const restoreProof = (label: string) => {
    const files = proofHashes();
    record(`${label}-source-restored`, files);
    assert.ok(files.every((file) => file.expected === file.observed));
    assert.ok(
      files.every(
        (file) =>
          file.live ===
          originals.find((original) => original.path === file.path)?.hash,
      ),
    );
  };
  async function test(label: string, filter: string) {
    const runPath = join(evidence, label);
    mkdirSync(runPath);
    const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-discovery-e-"));
    mkdirSync(join(scratch, "home"));
    const env = {
      ...process.env,
      HOME: join(scratch, "home"),
      TODO_DB: join(scratch, "scratch.db"),
      TODO_PORT: "0",
      TODO_AUTH_EPOCH_MEMORY_VAULT: "1",
      TODO_W06_RECEIPT: join(runPath, "http-receipt.json"),
      TODO_AUTH_EPOCH_RECEIPT: join(runPath, "auth-receipt.json"),
      TODO_F10_CLI: inputs.backend.binaries.cli.path,
    };
    assert.equal(
      (
        await execute(
          `${label}-seed`,
          inputs.backend.binaries.seed.path,
          [scratch, "diagnostics"],
          source,
          env,
        )
      ).exit,
      0,
    );
    const server = spawn(inputs.backend.binaries.server.path, [], {
      cwd: source,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    record(`${label}-server`, {
      pid: server.pid,
      database: env.TODO_DB,
      binary: inputs.backend.binaries.server,
    });
    let log = "";
    server.stdout.on("data", (chunk: Buffer) => {
      log += chunk.toString();
      appendFileSync(join(runPath, "server.log"), chunk);
    });
    server.stderr.on("data", (chunk: Buffer) => {
      log += chunk.toString();
      appendFileSync(join(runPath, "server.log"), chunk);
    });
    const stop = () => {
      server.kill("SIGTERM");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      const deadline = Date.now() + 60_000;
      while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
        assert.equal(server.exitCode, null, "Server exited before readiness");
        assert.ok(Date.now() < deadline, "Server readiness timeout");
        await new Promise((done) => setTimeout(done, 50));
      }
      const url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      assert.ok(url);
      const before = cleanPins.map(({ path, bytes, live }) => {
        assert.equal(sha(readFileSync(join(source, path))), sha(bytes));
        assert.equal(sha(readFileSync(join(root, path))), live);
        const copy = join(runPath, path.replaceAll("/", "_"));
        writeFileSync(copy, bytes);
        return { path, hash: sha(bytes), copy };
      });
      const argv = [
        "swift",
        "test",
        "--package-path",
        join(source, "apps/macos"),
        "--scratch-path",
        build,
        "--jobs",
        "2",
        "--disable-automatic-resolution",
        "--skip-update",
        "--no-parallel",
        "--filter",
        filter,
      ];
      let result;
      try {
        result = await execute(label, slot, ["sh", wrapper, ...argv], source, {
          ...env,
          TODO_W06_SERVER: url,
          TODO_AUTH_EPOCH_SERVER: url,
        });
      } finally {
        const after = [];
        for (const pin of before) {
          const diff = await execute(`${label}-pin-${after.length}`, "git", [
            "diff",
            "--no-index",
            "--",
            pin.copy,
            join(source, pin.path),
          ]);
          after.push({
            path: pin.path,
            beforeHash: pin.hash,
            afterHash: sha(readFileSync(join(source, pin.path))),
            diffExit: diff.exit,
            diff: diff.out,
          });
        }
        record(`${label}-pins`, { argv, before, after });
        assert.ok(
          after.every(
            (pin) => pin.beforeHash === pin.afterHash && pin.diffExit === 0,
          ),
        );
      }
      record(`${label}-swift-invocation`, {
        argv,
        stdout: result.out,
        stderr: result.err,
        actualExit: result.exit,
      });
      return result;
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      if (server.exitCode === null) {
        const closed = new Promise((done) => server.once("close", done));
        server.kill("SIGTERM");
        await closed;
      }
      rmSync(scratch, { recursive: true, force: true });
      record(`${label}-cleanup`, {
        pid: server.pid,
        serverExit: server.exitCode,
        serverSignal: server.signalCode,
        scratchRemoved: true,
      });
      const temporaries = await execute(`${label}-bun-temporaries`, "find", [
        root,
        "-name",
        ".*.bun-build",
        "-type",
        "f",
      ]);
      record(`${label}-order30`, {
        created: 0,
        retired: 0,
        remaining: temporaries.out.trim().split("\n").filter(Boolean),
      });
      assert.equal(temporaries.exit, 0);
      assert.equal(
        temporaries.out.trim(),
        "",
        "Unexpected Bun temporary needs ownership/lsof review",
      );
    }
  }
  if (repeatClean) {
    const runs = [];
    for (let index = 1; index <= 20; index += 1) {
      const label = `clean-${String(index).padStart(2, "0")}`;
      const result = await test(
        label,
        "DiscoveryStateTests|DiscoveryReportStateTests",
      );
      runs.push({ label, actualExit: result.exit });
      record("clean-repetitions", { commit, runs });
      assert.equal(
        result.exit,
        0,
        "Every consecutive suite must pass without a retry",
      );
      restoreProof(label);
    }
    record("result", {
      passed: true,
      commit,
      evidence,
      consecutiveSuites: 20,
      runs,
      nativeApp: false,
      keychain: false,
    });
    console.log(
      JSON.stringify({ passed: true, commit, evidence, consecutiveSuites: 20 }),
    );
    process.exit(0);
  }
  const baseline = await test(
    "clean",
    "DiscoveryStateTests|DiscoveryReportStateTests|AuthEpochTests",
  );
  assert.equal(baseline.exit, 0);
  restoreProof("clean");
  const outcomes = [];
  for (const mutation of mutations) {
    const path = join(source, mutation.path),
      original = readFileSync(path, "utf8");
    assert.equal(
      original.split(mutation.from).length,
      2,
      "Mutation anchor drift",
    );
    try {
      const broken = original.replace(mutation.from, mutation.to);
      writeFileSync(path, broken);
      writeFileSync(join(evidence, `broken-${mutation.name}.swift`), broken);
      record(`mutation-${mutation.name}`, {
        ...mutation,
        originalHash: sha(original),
        mutatedHash: sha(broken),
      });
      const result = await test(`broken-${mutation.name}`, mutation.filter);
      assert.equal(result.exit, 1, "Swift mutant needs assertion exit1");
      assert.match(result.out + result.err, /Expectation failed:/);
      assert.ok(
        (result.out + result.err).includes(mutation.witness),
        "Intended assertion witness missing",
      );
      assert.doesNotMatch(
        result.out + result.err,
        /caught error:|error: fatalError|Build complete!.*error: emit-module/s,
        "Execution/compiler failure cannot establish sensitivity",
      );
      outcomes.push({ ...mutation, actualExit: result.exit });
    } finally {
      writeFileSync(path, original);
      restoreProof(`restored-${mutation.name}`);
      assert.equal(
        (await test(`restored-${mutation.name}`, mutation.filter)).exit,
        0,
      );
    }
  }
  assert.equal(
    (
      await test(
        "final-clean",
        "DiscoveryStateTests|DiscoveryReportStateTests|AuthEpochTests",
      )
    ).exit,
    0,
  );
  restoreProof("final-clean");
  record("result", {
    passed: true,
    commit,
    evidence,
    outcomes,
    memorySessionVault: true,
    nativeApp: false,
    keychain: false,
    liveSourceUnchanged: true,
  });
  console.log(JSON.stringify({ passed: true, commit, evidence }));
} catch (error) {
  record("result", { passed: false, commit, evidence, error: String(error) });
  console.error(error);
  process.exitCode = 1;
}
