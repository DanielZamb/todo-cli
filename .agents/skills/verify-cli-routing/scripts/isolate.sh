#!/bin/sh
set -eu
# All verification subprocesses inherit OS denial, including fetch and new binaries.
route_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
route_home=$(node -p 'require("node:os").userInfo().homedir')
route_scratch=$(mktemp -d /private/tmp/todo-routing-isolated-XXXXXX)
trap 'rm -rf "$route_scratch"' EXIT HUP INT TERM
mkdir "$route_scratch/home" "$route_scratch/tmp"
cat > "$route_scratch/isolate.sb" <<'PROFILE'
(version 1)
(allow default)
(deny file-read* file-write* (subpath (param "PROTECTED")))
(deny network*)
(allow network-inbound network-outbound (local ip "localhost:*") (remote ip "localhost:*"))
(deny network-inbound network-outbound (local tcp "*:4310") (remote tcp "*:4310") (local udp "*:4310") (remote udp "*:4310"))
(deny network-inbound network-outbound (local tcp "*:14310") (remote tcp "*:14310") (local udp "*:14310") (remote udp "*:14310"))
PROFILE
cd "$route_root"
/usr/bin/sandbox-exec -D "PROTECTED=$route_home/.todo-cli" -f "$route_scratch/isolate.sb" /usr/bin/env HOME="$route_scratch/home" TMPDIR="$route_scratch/tmp" TODO_DB="$route_scratch/home/no-default.db" TODO_PORT=0 TODO_ROUTING_ISOLATED=1 "$@"
