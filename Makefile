INSTALL_DIR ?= $(HOME)/.local/bin
-include signing.local.mk
export TODO_SIGNING_TEAM TODO_SIGNING_IDENTITY

.PHONY: all build install install-local check test clean check-signing-config sign-desktop

all: build

build:
	pnpm --filter @todo/cli --filter @todo/server build

install install-local:
	./scripts/install.sh --install-dir "$(INSTALL_DIR)"

check:
	pnpm check

test:
	pnpm test

clean:
	rm -rf apps/cli/dist apps/server/dist

check-signing-config:
	@test -n "$$TODO_SIGNING_TEAM" || { echo 'Set TODO_SIGNING_TEAM in signing.local.mk or the environment.' >&2; exit 2; }
	@test -n "$$TODO_SIGNING_IDENTITY" || { echo 'Set TODO_SIGNING_IDENTITY in signing.local.mk or the environment.' >&2; exit 2; }

sign-desktop: check-signing-config
	bun scripts/check-package-age.ts 7
	"$(CURDIR)/scripts/disk-guard.sh"
	rm -f dist/signed.noindex/signing-receipt.json
	mkdir -p dist/signed.noindex/macos dist/signed.noindex/electron
	xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Release -destination platform=macOS -derivedDataPath "$(CURDIR)/dist/signed.noindex/DerivedData" CONFIGURATION_BUILD_DIR="$(CURDIR)/dist/signed.noindex/macos" DEVELOPMENT_TEAM="$$TODO_SIGNING_TEAM" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" CODE_SIGNING_ALLOWED=YES CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO OTHER_CODE_SIGN_FLAGS="--timestamp=none" build
	"$(CURDIR)/scripts/disk-guard.sh"
	pnpm --filter @todo/electron build --sign --output "$(CURDIR)/dist/signed.noindex/electron/Todo.app"
	python3 scripts/signing-receipt.py "$(CURDIR)/dist/signed.noindex"
	python3 scripts/unregister-desktop-builds.py "$(CURDIR)/dist/signed.noindex"
