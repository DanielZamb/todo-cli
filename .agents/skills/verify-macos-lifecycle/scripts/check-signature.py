#!/usr/bin/env python3
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys

binary, evidence = map(Path, sys.argv[1:])
verification = subprocess.run(["/usr/bin/codesign", "--verify", "--strict", "--verbose=2", str(binary)], capture_output=True, text=True, timeout=10)
metadata = subprocess.run(["/usr/bin/codesign", "--display", "--verbose=4", str(binary)], capture_output=True, text=True, timeout=10)
entitlements = subprocess.run(["/usr/bin/codesign", "--display", "--entitlements", ":-", str(binary)], capture_output=True, timeout=10)
(evidence / "helper-signature.txt").write_text(verification.stdout + verification.stderr + metadata.stdout + metadata.stderr)
(evidence / "helper-entitlements.plist").write_bytes(entitlements.stdout)
expected = {f"com.apple.security.cs.{key}": True for key in (
    "allow-jit", "allow-unsigned-executable-memory", "disable-executable-page-protection",
    "allow-dyld-environment-variables", "disable-library-validation")}
actual = plistlib.loads(entitlements.stdout) if entitlements.stdout else {}
flags = re.search(r"flags=0x([0-9a-f]+)", metadata.stderr)
result = dict(verified=verification.returncode == 0, adHoc="Signature=adhoc" in metadata.stderr,
              hardened=flags is not None and bool(int(flags[1], 16) & 0x00010000), entitlementsMatch=actual == expected)
(evidence / "helper-signing.json").write_text(json.dumps(result, indent=2))
assert all(result.values()), result
