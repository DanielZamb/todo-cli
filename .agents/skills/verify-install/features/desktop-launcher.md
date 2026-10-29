# Signed desktop output and launcher

## Sub-features

- Signed build products use `dist/signed.noindex` so Spotlight ignores them.
- Desktop resource bundles retain generated dependency and runtime notices.
- The signing target unregisters its build copies from LaunchServices.
- Desktop installation registers `/Applications/Todo.app` and `/Applications/Todo Electron.app`.
- Installed apps retain valid signatures and the staged icon assets.
- Signing identity and team come from ignored local settings or environment
  variables. Missing settings fail before a signing build starts.

## Drive

The main install helper checks the paths in `make -n sign-desktop` without signing.
It exercises missing-team and missing-identity failures, and a synthetic complete
configuration, through `make check-signing-config` without building or signing.
The Xcode command must keep the automatic `Apple Development` identity class;
a concrete certificate name conflicts with automatic Swift package signing.
The helper generates notices from an unrelated scratch working directory,
requires the project, Effect, React, shadcn, Swift and Bun notices, and rejects
checkout paths in the output. A relative output path must fail without a write.
Malformed inventory supplied by a scratch pnpm stub must fail schema validation
before writing an output file.
The public Swift build lock must preserve argument boundaries and child exit
codes, including 75, and reject an empty command.
After desktop installation, run the parent skill's `desktop-launcher.py` command.
It compares both registration sources against the literal two installed paths.
It checks each bundle ID and strict signature verification, then compares
`Assets.car` and `Todo.icns` between staged and installed copies.
The signing receipt also requires the generated notices and byte-identical
copies of Electron's upstream `LICENSE` and `LICENSES.chromium.html` resources.
The macOS server build phase declares its binary and notices as outputs so
incremental builds refresh the app's resource seal. During an authorized signing
run, add a temporary notice under `licenses/`, sign, then remove it and sign
again. Both receipts must pass strict signature checks; the final bundle must
omit the temporary notice. Never install the temporary verification bundle.

To exercise Xcode's registration path without launching an app, run:

```sh
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R -trusted "$PWD/dist/signed.noindex/macos/Todo.app"
python3 scripts/unregister-desktop-builds.py "$PWD/dist/signed.noindex"
```

Run the read-only check afterward. The cleanup helper verifies that the build
paths are absent from LaunchServices. It checks the resulting registrations
because `lsregister -u` can unregister an excluded app, then return a Spotlight
scan error. Repeating cleanup must still pass.

## Evidence and cleanup

The new evidence directory retains commands, raw registration lists and a JSON
receipt. The check reads existing apps without launching, signing or rebuilding.
It changes no credentials, databases or registrations. No scratch cleanup is needed.
