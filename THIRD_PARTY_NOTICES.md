# Third-party notices

Todo is MIT-licensed. Third-party components retain their own licenses.

Desktop builds include `THIRD_PARTY_NOTICES.txt` in their resources. The build
collects license and notice files from installed production dependencies and
the checked-in `licenses/` directory. The inventory includes CSS build
dependencies and may include packages unused by a particular client. Generate
the same document for a CLI or server distribution with:

```sh
bun scripts/third-party-notices.ts "$PWD/dist/THIRD_PARTY_NOTICES.txt"
```

Include that document when distributing standalone compiled binaries.

## Vendored source

The Electron components and `apps/electron/src/vendor/shadcn.css` derive from
[shadcn/ui](https://github.com/shadcn-ui/ui). The stylesheet is copied from
shadcn 4.22.1 with its full MIT license retained. Its body is unchanged.
The corresponding notice is also in `licenses/shadcn-4.22.1-LICENSE.txt`.

## Swift dependencies

`licenses/swift/` retains the license and notice files for the four runtime
packages resolved by the Xcode app: swift-collections, swift-http-types,
swift-openapi-runtime, and swift-openapi-urlsession. Their versions and source
revisions are pinned in the Xcode project's `Package.resolved`. Refresh the
notice copies from the matching resolved checkouts when updating these pins.

## Binary runtimes

Electron's upstream license and Chromium notices are copied from its distribution
into `Contents/Resources/LICENSE.electron` and `LICENSES.chromium.html` before
signing. The macOS app's compiled server contains Bun. The upstream Bun 1.4.4
license information is retained in `licenses/Bun-1.4.4-NOTICE.md`, including its
linked-library licenses and JavaScriptCore/WebKit source and rebuild instructions.
See [Bun's versioned license information](https://github.com/oven-sh/bun/blob/bun-v1.4.4/LICENSE.md).

Record the Bun and Electron versions used for a binary release. Review their
upstream runtime notices when changing versions. This notice collection does
not replace the source and relinking provisions described by the runtime
licenses or approval for a public binary release.
