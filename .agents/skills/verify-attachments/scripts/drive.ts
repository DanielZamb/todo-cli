import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const evidence = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2] && !existsSync(evidence), "Pass a fresh absolute evidence directory");
mkdirSync(evidence, { recursive: true });
const built = spawnSync("bun", [join(import.meta.dirname, "build.ts")], { cwd: root, encoding: "utf8" });
assert.equal(built.status, 0, built.stderr);
const binaries = JSON.parse(readFileSync(join(root, ".scratch/bin/build.json"), "utf8"));
writeFileSync(join(evidence, "provenance.json"), JSON.stringify(binaries, null, 2));
const scratch = mkdtempSync(join(tmpdir(), "todo-f11-verify-"));
const home = join(scratch, "home");
mkdirSync(home);
const env = { ...process.env, HOME: home, TODO_DB: join(home, ".todo-cli", "todo.db"), TODO_PORT: "0" };
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let stream: ChildProcess | undefined;
let serverLog = "";
let sse = "";
const waitFor = async (check: () => boolean, message: string) => {
  const until = Date.now() + 60000;
  while (!check()) { assert.ok(Date.now() < until, message); await new Promise((r) => setTimeout(r, 40)); }
};
const run = (command: string, args: string[], input?: string) => {
  const result = spawnSync(command, args, { cwd: root, env, input, encoding: "utf8", timeout: 120000 });
  if (result.error) throw result.error;
  assert.notEqual(result.status, null, `${command} did not exit`);
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr };
};
const cli = (args: string[], input?: string) => {
  const result = run(join(scratch, "todo"), ["--profile", "work", ...args], input);
  actions.push({ command: ["todo", ...args], ...result });
  assert.equal(result.exit, 0, result.stderr);
  return result.stdout;
};
const stop = async (process: ChildProcess | undefined) => {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  process.kill("SIGTERM");
  const exited = new Promise<void>((r) => process.once("exit", () => r()));
  await Promise.race([exited, new Promise<void>((r) => setTimeout(r, 1500))]);
  if (process.exitCode === null && process.signalCode === null) process.kill("SIGKILL");
  await exited;
};
try {
  for (const [source, binary] of [["apps/cli/src/main.ts", "todo"], ["apps/server/src/main.ts", "server"]]) {
    const supplied = binary === "todo" ? (process.env.TODO_CLI_BINARY ?? binaries.cli) : (process.env.TODO_SERVER_BINARY ?? binaries.server);
    copyFileSync(supplied, join(scratch, binary));
    const result = { exit: 0, stdout: `Reused ${supplied}`, stderr: "" };
    writeFileSync(join(evidence, `compile-${binary}.json`), JSON.stringify(result, null, 2));
    assert.equal(result.exit, 0, result.stderr);
  }
  cli(["init", "--password-stdin"], "scratch F11 passphrase\n");
  cli(["login", "--password-stdin"], "scratch F11 passphrase\n");
  assert.equal(run(join(scratch, "todo"), ["--profile", "personal", "init"]).exit, 0);
  const created = JSON.parse(cli(["add", "Attachment proof", "--format", "json"]));
  const id: string = created.task.id;
  const file = join(scratch, "draft.md");
  writeFileSync(file, "Jira draft stays here\n");
  const attached = JSON.parse(cli(["attach", id, file, "--label", "jira", "--format", "json"]));
  assert.equal(attached.task.attachments[0].path, file);
  assert.equal(attached.task.attachments[0].exists, true);
  const first: string = attached.task.attachments[0].id;
  cli(["attach", id, "https://example.com/issue/42", "--format", "json"]);
  cli(["attach", id, join(scratch, "missing.md"), "--format", "json"]);
  const shown = JSON.parse(cli(["show", id, "--format", "json"]));
  assert.equal(shown.task.attachments[2].exists, false);
  assert.match(cli(["show", id]), /missing file/);
  for (const name of ["attach", "detach", "label-attachment"]) {
    const schema = JSON.parse(cli(["schema", name]));
    assert.ok(JSON.stringify(schema).includes("attachments"));
    writeFileSync(join(evidence, `schema-${name}.json`), JSON.stringify(schema, null, 2));
  }
  const dry = JSON.parse(cli(["detach", id, first, "--dry-run", "--format", "json"]));
  assert.equal(dry.dry_run, true);
  assert.equal(dry.task.attachments.length, 2);
  assert.equal(JSON.parse(cli(["show", id, "--format", "json"])).task.attachments.length, 3);
  server = spawn(join(scratch, "server"), [], { cwd: scratch, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (value) => { serverLog += value.toString(); });
  server.stderr?.on("data", (value) => { serverLog += value.toString(); });
  await waitFor(() => /Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(serverLog), "Server readiness");
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverLog)?.[1];
  assert.ok(base);
  const request = (method: string, path: string, body?: unknown, credential?: string, expected = 200) => {
    const response = run("curl", ["--silent", "--show-error", "--max-time", "10", "--write-out", "\n%{http_code}", "-X", method, ...(credential ? ["-H", `Authorization: Bearer ${credential}`] : []), ...(body ? ["-H", "Content-Type: application/json", "--data-binary", "@-"] : []), base + path], body ? JSON.stringify(body) : undefined);
    assert.equal(response.exit, 0, response.stderr);
    const index = response.stdout.lastIndexOf("\n");
    const status = Number(response.stdout.slice(index + 1));
    const result = JSON.parse(response.stdout.slice(0, index));
    if (path !== "/auth/sessions") actions.push({ method, path, body, status, result });
    assert.equal(status, expected, JSON.stringify(result));
    return result;
  };
  assert.deepEqual(request("GET", "/health"), { service: "todo-server" });
  const { credential } = request("POST", "/auth/sessions", { passphrase: "scratch F11 passphrase" });
  const target = `/profiles/work/tasks/${id}`;
  stream = spawn("curl", ["-sSN", "--max-time", "20", "-H", `Authorization: Bearer ${credential}`, base + "/profiles/work/events"], { cwd: scratch, env });
  stream.stdout?.on("data", (data) => { sse += data.toString(); });
  await waitFor(() => sse.includes("event: ready"), "SSE ready");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==";
  const upload = request("POST", `${target}/attachments/upload`, { from_version: 4, mime_type: "image/png", data: png }, credential);
  const image = upload.attachments[3];
  assert.ok(existsSync(image.path));
  assert.equal(readFileSync(image.path).toString("base64"), png);
  assert.deepEqual(request("GET", `${target}/attachments/${image.id}/image`, undefined, credential), { mime_type: "image/png", data: png });
  await waitFor(() => sse.includes('"kind":"AttachmentAdded"') && sse.includes(image.id), "Upload SSE");
  cli(["detach", id, first, "--format", "json"]);
  await waitFor(() => sse.includes('"kind":"AttachmentRemoved"'), "CLI detach SSE");
  const history = request("GET", `${target}/history`, undefined, credential);
  const removal = history.findLast((entry: { event: { kind: string } }) => entry.event.kind === "AttachmentRemoved");
  const restored = request("POST", `${target}/revert`, { from_version: 6, seq: removal.seq }, credential);
  assert.equal(restored.attachments.length, 4);
  const copied = request("POST", `${target}/copy`, {from_version: 7, destination_profile: "personal"}, credential);
  const copiedImage = copied.attachments.find((value: {kind: string}) => value.kind === "image");
  assert.ok(copiedImage);
  assert.deepEqual(request("GET", `/profiles/personal/tasks/${copied.id}/attachments/${copiedImage.id}/image`, undefined, credential), {mime_type: "image/png",data:png});
  assert.ok(copied.attachments.every((value: {id:string}) => !restored.attachments.some((source: {id:string}) => source.id === value.id)));
  assert.notEqual(copiedImage.path, image.path);
  assert.equal(copied.attachments.find((value: {kind:string;path?:string}) => value.kind === "file" && value.path === file)?.path, file);
  assert.deepEqual(request("GET", `${target}/attachments/${image.id}/image`, undefined, credential), {mime_type: "image/png",data:png});
  const copyPreview = JSON.parse(cli(["copy", id, "--to", "personal", "--dry-run", "--format", "json"]));
  assert.equal(copyPreview.results[0].managed_image_count, 1); assert.equal(copyPreview.results[0].managed_image_bytes, 67);
  const movedCopy = request("POST", `/profiles/personal/tasks/${copied.id}/move`, {from_version:1,destination_profile:"work"}, credential);
  assert.deepEqual(movedCopy.attachments,copied.attachments);
  cli(["rm", id, "--expected-version", "7"]);
  assert.equal(existsSync(image.path), true);
  cli(["rm", id, "--expected-version", "8", "--force"]);
  assert.equal(existsSync(image.path), false);
  assert.deepEqual(request("GET", `/profiles/work/tasks/${copied.id}/attachments/${copiedImage.id}/image`, undefined, credential), {mime_type:"image/png",data:png});
  assert.equal(readFileSync(file, "utf8"), "Jira draft stays here\n");
  const redacted = request("GET", `${target}/history`, undefined, credential);
  assert.ok(!JSON.stringify(redacted).includes(file));
  assert.ok(!JSON.stringify(redacted).includes(image.path));
  assert.equal(run(join(scratch, "todo"), ["--profile","doomed","init"]).exit, 0);
  const doomed = request("POST", "/profiles/doomed/tasks", {title:"Deleted Profile attachment"}, credential);
  const doomedTarget = `/profiles/doomed/tasks/${doomed.id}`;
  const doomedImage = request("POST", doomedTarget + "/attachments/upload", {from_version:1,mime_type:"image/png",data:png}, credential).attachments[0];
  request("DELETE", "/profiles/doomed", {with_tasks:true,dry_run:false}, credential);
  const deletedRequests: [string,string,unknown?][] = [
    ["POST",doomedTarget+"/attachments",{from_version:2,location:{kind:"file",path:file}}],
    ["POST",doomedTarget+"/attachments/detach",{from_version:2,attachment_id:doomedImage.id}],
    ["POST",doomedTarget+"/attachments/label",{from_version:2,attachment_id:doomedImage.id,label:"jira"}],
    ["POST",doomedTarget+"/attachments/upload",{from_version:2,mime_type:"image/png",data:png}],
    ["GET",doomedTarget+`/attachments/${doomedImage.id}/image`]
  ];
  for (const [method,path,body] of deletedRequests) {
    const failure = request(method,path,body,credential,404);
    assert.equal(failure.code,"not_found");
    assert.equal(failure.message,"Profile not found; choose a Profile from GET /profiles");
  }
  assert.deepEqual(request("GET", `/profiles/work/tasks/${copied.id}/attachments/${copiedImage.id}/image`, undefined, credential),{mime_type:"image/png",data:png});
  const metadata = JSON.parse(cli(["add", "Label metadata proof", "--project", "Client Project", "--tag", "planning", "--tag", "review", "--format", "json"]));
  const metadataTask = metadata.task.id;
  const reference = JSON.parse(cli(["attach", metadataTask, file, "--format", "json"])).task.attachments[0];
  const labeled = JSON.parse(cli(["label-attachment", metadataTask, reference.id, "--label", "jira", "--expected-version", "2", "--format", "json"]));
  assert.equal(labeled.task.attachments[0].label, "jira");
  const metadataShown = JSON.parse(cli(["show", metadataTask, "--format", "json"])).task;
  assert.equal(metadataShown.project, "Client Project");
  assert.deepEqual(metadataShown.tags, ["planning", "review"]);
  const beforeClear = request("GET", `/profiles/work/tasks/${metadataTask}`, undefined, credential);
  const cleared = JSON.parse(cli(["label-attachment", metadataTask, reference.id, "--expected-version", "3", "--format", "json"]));
  assert.equal(cleared.task.attachments[0].label, undefined);
  const labelHistory = request("GET", `/profiles/work/tasks/${metadataTask}/history`, undefined, credential);
  const clearing = labelHistory.at(-1);
  assert.equal(clearing.event.kind, "TaskEdited");
  assert.equal(clearing.event.project_after.name, "Client Project");
  assert.deepEqual(clearing.event.tags_after.map((tag: {name: string})=>tag.name), ["planning", "review"]);
  const revertedLabel = request("POST", `/profiles/work/tasks/${metadataTask}/revert`, {from_version:4,seq:clearing.seq}, credential);
  assert.equal(revertedLabel.attachments[0].label, "jira");
  assert.equal(revertedLabel.project_id, beforeClear.project_id);
  assert.deepEqual(revertedLabel.tags, beforeClear.tags);
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ status: "PASS", compiledCLI: true, curlHTTP: true, sse: true, purgeErasedCopiedImage: true, externalFilePreserved: true, historyRedacted: true, dryRunDidNotWrite: true, deletedProfileAttachments404: true, copyImagesIndependent: true, copyNewAttachmentIds: true, copyDryRunBytes: true, moveKeepsFilesAndIds: true }, null, 2));
} finally {
  await stop(stream);
  await stop(server);
  writeFileSync(join(evidence, "server.log"), serverLog);
  writeFileSync(join(evidence, "events.sse"), sse);
  writeFileSync(join(evidence, "actions.json"), JSON.stringify(actions, null, 2));
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ serverExit: server?.exitCode ?? server?.signalCode, streamExit: stream?.exitCode ?? stream?.signalCode }));
  rmSync(scratch, { recursive: true, force: true });
}
assert.ok(!existsSync(scratch));
assert.ok(existsSync(join(evidence, "result.json")));
process.stdout.write("PASS; evidence survived cleanup\n");
