#!/usr/bin/env python3
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
evidence = root / sys.argv[1]
assert evidence.resolve().is_relative_to(root) and not evidence.exists()
evidence.mkdir(parents=True)
state = evidence / "state"
capture = evidence / "capture"
state.mkdir()
capture.mkdir()

def write(path, value):
    path.write_text(json.dumps(value) + "\n")

provenance = {"head": "synthetic-control", "sources": {"apps/macos/Sources/DependencyBatch.swift": "synthetic-hash"}}
suites = ["DependencyStateTests", "DependencyDeleteStateTests", "DependencyBatchStateTests", "DependencyProtocolTests", "DependencyResponseTests", "DependencyReviewSnapshots"]
receipt = {"command": ["synthetic-state-command"], "exit": 0, "source": "synthetic-control", "log": str((state / "command.log").relative_to(root)), "state_proof": str(state.relative_to(root))}
(state / "command.log").write_text("Synthetic metadata control only; no real compiler or app.\n")
(capture / "control.png").write_bytes(b"synthetic-existing-file")
results = []

def reset():
    write(evidence / "command.json", receipt)
    write(state / "source-provenance.json", provenance)
    write(capture / "source-provenance.json", provenance)
    write(state / "commands.json", [{"exit": 0}])
    write(state / "result.json", {"status": "PASS"})
    (state / "state-tests.log").write_text("\n".join("Suite " + name + " passed" for name in suites))
    write(capture / "dag-capture-manifest.json", [{"png": "control.png", "behavior_status": "pending", "behavior_receipt": None, "identifiers": ["dependency-picker"]}])

def run(name, expected, attach=True):
    command = ["bun", "apps/macos/scripts/validate-dependency-captures.ts", str(capture.relative_to(root))]
    if attach:
        command.append(str((evidence / "command.json").relative_to(root)))
    with (evidence / (name + ".log")).open("w") as log:
        result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
    results.append({"name": name, "command": command, "actual_exit": result.returncode, "expected_exit": expected})
    write(evidence / "controls.json", {"synthetic": True, "compiler_or_app_launched": False, "controls": results})
    assert result.returncode == expected, name
    if expected:
        row = json.loads((capture / "dag-capture-manifest.json").read_text())[0]
        assert row["behavior_status"] == "pending" and row["behavior_receipt"] is None

reset()
write(evidence / "command.json", dict(receipt, exit=1))
run("failed-command", 1)
reset()
write(state / "source-provenance.json", dict(provenance, head="other-source"))
run("different-source", 1)
reset()
write(capture / "source-provenance.json", dict(provenance, sources={"apps/macos/Sources/DependencyBatch.swift": "changed-bytes"}))
run("different-bytes", 1)
reset()
write(state / "result.json", {"status": "FAIL"})
run("failed-state-result", 1)
reset()
write(state / "commands.json", [{"exit": 1}])
run("failed-state-constituent", 1)
reset()
(state / "state-tests.log").write_text("No successful suites\n")
run("missing-literal-cases", 1)
reset()
write(evidence / "command.json", dict(receipt, state_proof="../outside-repo"))
run("escaping-proof-path", 1)
reset()
run("successful-link", 0)
run("linked-inputs", 0, attach=False)
row = json.loads((capture / "dag-capture-manifest.json").read_text())[0]
assert row["behavior_status"] == "passed" and row["behavior_receipt"] == "behavior-state-command.json"
print("PASS:9 synthetic capture proof controls")
