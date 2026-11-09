import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { TaskResponse } from "../src/presentation.ts";

export async function proveTtyDelete(input: {
  readonly cli: string;
  readonly env: Record<string, string | undefined>;
  readonly evidence: string;
  readonly run: (
    args: readonly string[],
    expected?: number,
  ) => Record<string, Schema.Json>;
  readonly state: () => unknown;
}) {
  const { cli, env, evidence, run, state } = input;
  const create = (title: string) =>
    Schema.decodeUnknownSync(TaskResponse)(run(["add", title])).task;
  const transcripts: unknown[] = [];
  const ask = async (
    id: string,
    version: number,
    answer: string,
    expected: number,
    competing?: () => void,
  ) => {
    let output = "";
    let replied = false;
    let callbackError: unknown;
    const process = Bun.spawn(
      [cli, "rm", id, "--expected-version", String(version), "--format", "md"],
      {
        env: { ...env, TERM: "xterm-256color" },
        terminal: {
          cols: 100,
          rows: 30,
          data(terminal, bytes) {
            output += new TextDecoder().decode(bytes);
            if (
              !replied &&
              output.includes("Delete Task and remove these Dependencies?")
            ) {
              replied = true;
              try {
                competing?.();
                terminal.write(answer);
              } catch (error) {
                callbackError = error;
                terminal.write("n\n");
              }
            }
          },
        },
      },
    );
    const timeout = setTimeout(() => process.kill("SIGKILL"), 10000);
    let exit: number;
    try {
      exit = await process.exited;
    } finally {
      clearTimeout(timeout);
      process.terminal?.close();
    }
    transcripts.push({
      id,
      version,
      answer: answer === "\x04" ? "EOF" : answer.trim(),
      exit,
      output,
    });
    if (callbackError) throw callbackError;
    assert.equal(exit, expected, output);
    assert.equal(replied, true, output);
    assert.match(output, /\[y\/N\]/);
    return output;
  };
  try {
    const blocker = create("TTY blocker");
    const target = create("TTY target");
    const dependent = create("TTY dependent");
    run(["depend", target.id, "--on", blocker.id, "--expected-version", "1"]);
    run(["depend", dependent.id, "--on", target.id, "--expected-version", "1"]);
    const before = state();
    const no = await ask(target.id, 2, "n\n", 0);
    assert.match(no, /TTY target depends on TTY blocker/);
    assert.match(no, /TTY dependent depends on TTY target/);
    assert.deepEqual(state(), before);
    await ask(target.id, 2, "\x04", 0);
    assert.deepEqual(state(), before);
    await ask(target.id, 2, "\n", 0);
    assert.deepEqual(state(), before);
    await ask(target.id, 2, "y\n", 0);
    run(["show", target.id], 3);
    const beforePurgePreview = state();
    const purgePreview = run([
      "rm",
      target.id,
      "--force",
      "--dry-run",
      "--expected-version",
      "3",
    ]);
    assert.equal(purgePreview.status, "would_purge");
    assert.equal(purgePreview.dry_run, true);
    assert.deepEqual(state(), beforePurgePreview);
    run(["rm", target.id, "--force", "--expected-version", "3"]);
    const race = create("TTY fingerprint target");
    const oldDependent = create("TTY original dependent");
    const newDependent = create("TTY new dependent");
    run([
      "depend",
      oldDependent.id,
      "--on",
      race.id,
      "--expected-version",
      "1",
    ]);
    const refusal = await ask(race.id, 1, "y\n", 2, () => {
      run([
        "depend",
        newDependent.id,
        "--on",
        race.id,
        "--expected-version",
        "1",
      ]);
    });
    assert.match(refusal, /has_dependencies/);
    assert.match(refusal, /--with-dependencies/);
    run(["show", race.id]);
    const pipe = Bun.spawnSync(
      [cli, "rm", race.id, "--expected-version", "1", "--format", "md"],
      { env },
    );
    assert.equal(pipe.exitCode, 2);
    assert.match(pipe.stderr.toString(), /has_dependencies/);
    assert.match(pipe.stderr.toString(), /--with-dependencies/);
    assert.equal(pipe.stdout.toString(), "");
  } finally {
    writeFileSync(
      join(evidence, "tty.json"),
      JSON.stringify(transcripts, null, 2),
    );
  }
}
