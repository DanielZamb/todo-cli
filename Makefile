INSTALL_DIR ?= $(HOME)/.local/bin
-include signing.local.mk
export TODO_SIGNING_TEAM TODO_SIGNING_IDENTITY

.PHONY: all build generate-api install install-local check test clean help-signing check-signing-config check-signing-commands sign-desktop

all: build

build:
	pnpm --filter @todo/cli --filter @todo/server build

generate-api:
	./apps/macos/scripts/generate-api.sh

install install-local:
	./scripts/install.sh --install-dir "$(INSTALL_DIR)"

check:
	pnpm check

test:
	pnpm test

clean:
	rm -rf apps/cli/dist apps/server/dist

help-signing:
	@echo 'Copy signing.example.mk to ignored signing.local.mk, or export TODO_SIGNING_TEAM and TODO_SIGNING_IDENTITY.'
	@echo 'TODO_SIGNING_TEAM selects the Xcode development team and the expected team for both signed apps.'
	@echo 'TODO_SIGNING_IDENTITY selects the Electron certificate. Xcode uses automatic Apple Development signing for that team.'
	@echo 'Inspect with make -n sign-desktop. Local publish is scripts/sign-and-install.sh.'
	@echo 'Check rendered commands without signing: make check-signing-commands.'
	@echo 'Unsigned Electron: pnpm --filter @todo/electron build'
	@echo 'Unsigned macOS: xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO'

check-signing-commands:
	python3 scripts/signing-receipt.py --check-commands

check-signing-config:
	@test -n "$$TODO_SIGNING_TEAM" || { echo 'Set TODO_SIGNING_TEAM in signing.local.mk or the environment.' >&2; exit 2; }
	@test -n "$$TODO_SIGNING_IDENTITY" || { echo 'Set TODO_SIGNING_IDENTITY in signing.local.mk or the environment.' >&2; exit 2; }

sign-desktop: check-signing-config
	bun scripts/check-package-age.ts 7
	"$(CURDIR)/scripts/disk-guard.sh"
	rm -f dist/signed.noindex/signing-receipt.json
	mkdir -p dist/signed.noindex/macos dist/signed.noindex/electron
	xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Release -destination platform=macOS -derivedDataPath "$(CURDIR)/dist/signed.noindex/DerivedData" CONFIGURATION_BUILD_DIR="$(CURDIR)/dist/signed.noindex/macos" DEVELOPMENT_TEAM="$(TODO_SIGNING_TEAM)" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" CODE_SIGNING_ALLOWED=YES CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO OTHER_CODE_SIGN_FLAGS="--timestamp=none" build
	"$(CURDIR)/scripts/disk-guard.sh"
	TODO_SIGNING_TEAM="$(TODO_SIGNING_TEAM)" TODO_SIGNING_IDENTITY="$(TODO_SIGNING_IDENTITY)" pnpm --filter @todo/electron build --sign --output "$(CURDIR)/dist/signed.noindex/electron/Todo.app"
	python3 scripts/signing-receipt.py "$(CURDIR)/dist/signed.noindex"
	python3 scripts/unregister-desktop-builds.py "$(CURDIR)/dist/signed.noindex"
