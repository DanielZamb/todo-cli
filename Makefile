BINARY := todo
CMD := ./cmd/todo
BUILD_DIR := ./bin
COVER_FILE := /tmp/todo-cli.cover
GOCACHE_DIR := /tmp/go-build-cache
USE_TMP_GOCACHE ?= 1

ifeq ($(USE_TMP_GOCACHE),1)
GOENV := GOCACHE=$(GOCACHE_DIR)
else
GOENV :=
endif

.PHONY: all build run test test-integration cover fmt tidy clean install-local release-check

all: build

build:
	mkdir -p $(BUILD_DIR)
	$(GOENV) go build -o $(BUILD_DIR)/$(BINARY) $(CMD)

run:
	$(GOENV) go run $(CMD) --help

test:
	$(GOENV) go test ./...

test-integration:
	$(GOENV) go test ./test/integration

cover:
	$(GOENV) go test -cover ./...

fmt:
	gofmt -w $(shell find . -name '*.go' -type f)

tidy:
	$(GOENV) go mod tidy

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(COVER_FILE)

install-local: build
	./scripts/install.sh --from-local $(BUILD_DIR)/$(BINARY)

release-check: build test
	@echo "Release artifact checks"
	@ls -lh $(BUILD_DIR)/$(BINARY)
	@shasum -a 256 $(BUILD_DIR)/$(BINARY)
	@echo "Installer smoke test (local mode)"
	@rm -rf /tmp/todo-install-smoke
	@mkdir -p /tmp/todo-install-smoke/bin /tmp/todo-install-smoke/home
	@HOME=/tmp/todo-install-smoke/home ./scripts/install.sh --from-local $(BUILD_DIR)/$(BINARY) --install-dir /tmp/todo-install-smoke/bin
	@HOME=/tmp/todo-install-smoke/home /tmp/todo-install-smoke/bin/todo --help-human-flag >/tmp/todo-install-smoke/help.txt
	@grep -q "Human Onboarding" /tmp/todo-install-smoke/help.txt
	@echo "release-check OK"
