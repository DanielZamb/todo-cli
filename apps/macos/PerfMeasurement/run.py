#!/usr/bin/env python3
import argparse
import fcntl
import hashlib
import http.client
import http.server
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import select
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from fixture import OWNER, owner_items, finish_owner_fixture
from owner_activity import wait_for_owner_idle

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).with_name('Measurement.swift')
BASE_ENV = {k: v for k, v in os.environ.items() if not k.startswith(('TODO_', 'MAC_PERF_'))}
parser = argparse.ArgumentParser()
parser.add_argument('evidence', type=Path)
parser.add_argument('--runs', type=int, default=5)
parser.add_argument('--prepare-only', action='store_true')
parser.add_argument('--ref', action='append')
parser.add_argument('--working-tree', action='store_true')
parser.add_argument('--climb', action='store_true')
parser.add_argument('--climb-backlogs', type=int, nargs='+', choices=[0, 50, 300], default=[0, 50, 300])
parser.add_argument('--root-window', action='store_true')
parser.add_argument('--diagnostics', action='store_true')
parser.add_argument('--compare-diagnostics', action='store_true')
parser.add_argument('--personal-tasks', type=int, choices=[80, 180], default=180)
parser.add_argument('--history-operations', type=int, default=0)
parser.add_argument('--active-layout', choices=['compact', 'full'], default='full')
parser.add_argument('--max-start-load', type=float, default=6, help='One-minute load ceiling; 0 measures the busy host without waiting')
parser.add_argument('--slow-actions', action='store_true')
parser.add_argument('--reply-delay-ms', type=int, default=0)
parser.add_argument('--compare-delays', action='store_true')
parser.add_argument('--cpu-workers', type=int, default=0)
parser.add_argument('--iteration-offset', type=int, default=0)
parser.add_argument('--owner-fixture', action='store_true')
parser.add_argument('--connection-probe', action='store_true')
parser.add_argument('--inspector-layout', action='store_true')
args = parser.parse_args()
os.umask(0o077)
if args.owner_fixture: args.personal_tasks=OWNER['personal']['total']
if args.connection_probe and not args.prepare_only: parser.error('--connection-probe prepares the target; run connections.py for the direct-server drive')
if args.slow_actions and not args.owner_fixture and args.personal_tasks != 80: parser.error('--slow-actions requires --personal-tasks 80')
if args.slow_actions and (args.diagnostics or args.compare_diagnostics or args.active_layout != 'full'): parser.error('--slow-actions uses a full window with Diagnostics closed')
if (args.compare_delays or args.reply_delay_ms) and not args.slow_actions: parser.error('reply delays require --slow-actions')
if args.runs < 1 or args.cpu_workers < 0 or args.reply_delay_ms < 0: parser.error('runs must be positive; workers and delay must be nonnegative')
measurement_lock = open('/tmp/todo-performance.lock', 'w')
fcntl.flock(measurement_lock, fcntl.LOCK_EX)
evidence = args.evidence.resolve()
evidence.mkdir(parents=True, exist_ok=False)
(evidence / 'settings.json').write_text(json.dumps({**vars(args), 'evidence': str(evidence)}, indent=2))
(evidence / 'harness.json').write_text(json.dumps({path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in SOURCE.parent.iterdir() if path.suffix in {'.py', '.swift'}}, indent=2))
commands = []
sys.path.insert(0, str(ROOT / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
owned = OwnedCommands(evidence / 'command-unsafe')

def run(argv, name, env=None, cwd=ROOT, input=None):
    with (evidence / (name + '.log')).open('w') as log:
        process = subprocess.Popen([str(x) for x in argv], cwd=cwd, env=env, stdin=subprocess.PIPE if input is not None else None, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        try:
            process.communicate(input=input, timeout=1200)
            result = subprocess.CompletedProcess(argv, process.returncode)
        finally:
            try:
                owned.stop(process)
            except BaseException:
                (evidence / ('command-unsafe-' + name)).touch()
                raise
    commands.append(dict(command=[str(x) for x in argv], exit=result.returncode, log=name + '.log'))
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2))
    if result.returncode:
        raise RuntimeError(f'{name} exited {result.returncode}')
    return (evidence / (name + '.log')).read_text()

selected_refs = args.ref or ([] if args.working_tree else ['225b512f', 'origin/main', 'e69230f9'])
refs = {ref: run(['git', 'rev-parse', '--verify', ref + '^{commit}'], 'ref-' + str(index)).strip() for index, ref in enumerate(selected_refs)}
if args.working_tree:
    refs['working-tree'] = run(['git', 'rev-parse', 'HEAD'], 'working-parent').strip()
    (evidence / 'working-tree.diff').write_bytes(subprocess.check_output(['git', 'diff', '--binary', 'HEAD', '--', 'apps/macos/Sources', 'apps/macos/API/Sources'], cwd=ROOT))
(evidence / 'revisions.json').write_text(json.dumps(refs, indent=2))
labels = {ref: str(index) + '-' + sha[:8] if args.climb else sha[:8] for index, (ref, sha) in enumerate(refs.items())}
packages = {}
for ref, sha in refs.items():
    cache_name = ('climb-working-tree' if ref == 'working-tree' else 'climb-' + sha) if args.climb else ('working-tree' if ref == 'working-tree' else sha)
    package = ROOT / '.scratch/mac-perf' / cache_name / 'apps/macos'
    label = labels[ref]
    package.mkdir(parents=True, exist_ok=True)
    archive = subprocess.check_output(['git', 'archive', sha, 'apps/macos'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar:
            if member.isfile():
                destination = package.parents[1] / member.name
                data = tar.extractfile(member).read()
                local = ROOT / member.name
                if ref == 'working-tree' and ('/Sources/' in member.name) and local.is_file(): data = local.read_bytes()
                if not destination.exists() or destination.read_bytes() != data:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
    if ref == 'working-tree':
        for source_root in ['Sources', 'API/Sources']:
            current = ROOT / 'apps/macos' / source_root
            for local in current.rglob('*'):
                if local.is_file():
                    destination = package / source_root / local.relative_to(current)
                    data = local.read_bytes()
                    if not destination.exists() or destination.read_bytes() != data:
                        destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(data)
            for cached in (package / source_root).rglob('*.swift'):
                if cached.name not in ['PerfTrace.swift', 'PerfConnectionTrace.swift'] and not (current / cached.relative_to(package / source_root)).exists(): cached.unlink()
    pins = {str(p.relative_to(package)): hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('Package.resolved') if '.build' not in p.parts}
    (evidence / ('sources-' + label + '.json')).write_text(json.dumps({str(p.relative_to(package)): hashlib.sha256(p.read_bytes()).hexdigest() for source_root in ['Sources', 'API/Sources'] for p in (package / source_root).rglob('*.swift') if p.name not in ['PerfTrace.swift', 'PerfConnectionTrace.swift']}, indent=2))
    (package / 'Perf').mkdir(exist_ok=True)
    fixture = SOURCE.read_text()
    connection_file=package/'API/Sources/TodoAPI/PerfConnectionTrace.swift'
    if args.connection_probe:
        fixture=SOURCE.with_name('ConnectionMeasurement.swift').read_text() + '\n' + SOURCE.with_name('RowSelection.swift').read_text()
        shutil.copytree(SOURCE.parent/'Descriptors',package/'PerfC',dirs_exist_ok=True)
        connection_file.write_text(SOURCE.with_name('ConnectionTrace.swift').read_text())
        transport_file=package/'API/Sources/TodoAPI/Transport.swift'
        transport=transport_file.read_text()
        marker='public func todoClient(server: URL, credential: String) -> Client {'
        assert transport.count(marker)==1
        transport=transport.replace(marker,marker+'\n    let perfFactoryStart = Date().timeIntervalSince1970 * 1000')
        transport=transport.replace('return Client(serverURL: server, transport: URLSessionTransport(configuration: .init(session: URLSession(configuration: configuration))), middlewares: [BearerMiddleware(credential: credential)])','let perfSession = PerfConnectionTrace.shared.session(configuration)\n    return Client(serverURL: server, transport: URLSessionTransport(configuration: .init(session: perfSession.session)), middlewares: [BearerMiddleware(credential: credential), PerfConnectionTiming(factoryStartMS: perfFactoryStart, sessionID: perfSession.id)])')
        assert 'let perfSession =' in transport
        transport_file.write_text(transport)
    else:
        connection_file.unlink(missing_ok=True)
    if args.climb:
        fixture = fixture.replace('for index in 0..<10 {', 'for index in 0..<1 {')
        fixture = fixture.replace('for backlog in [0, 50, 300] {', 'for backlog in ' + str(args.climb_backlogs) + ' {')
        old_model = 'model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-mac-perf"), clientFactory: { url, _ in measurementClient(server: url, credential: credential) })'
        assert fixture.count(old_model) == 1
        diagnostics_argument = ', clientDiagnostics: ClientDiagnosticsRecorder(journalDirectory: URL(fileURLWithPath: env["HOME"]!).appendingPathComponent("client-journal"))' if (package / 'API/Sources/TodoAPI/ClientDiagnosticsRecorder.swift').exists() else ''
        fixture = fixture.replace(old_model, 'model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-mac-perf")' + diagnostics_argument + ')\n            model.replaceCredential(credential)')
        begin = fixture.index('        try await step("profile-switch")')
        end = fixture.index('        model.editor = nil', begin)
        fixture = fixture[:begin] + fixture[end:]
        fixture = fixture.replace('            try await action()', '''            try await action()
            let actionFinishedMS = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
            try await wait { PerfTrace.shared.snapshot().allSatisfy { $0["endMS"] != nil } && !model.searchPending }
            try await Task.sleep(for: .seconds(1))
            try await wait { PerfTrace.shared.snapshot().allSatisfy { $0["endMS"] != nil } && !model.searchPending }''')
        fixture = fixture.replace('"step": name, "elapsedMS": elapsed,', '"step": name, "elapsedMS": elapsed, "actionFinishedMS": actionFinishedMS,')
        fixture = fixture.replace('            for window in windows { window.close() }', '''            if model.appliedSearchSnapshot != nil {
                let canonical = try JSONDecoder().decode([TaskSnapshot].self, from: await control("catalog/" + model.profile))
                try #require(model.tasks == canonical, "Catalog differs from the authoritative server response")
                try #require(model.appliedSearchSnapshot?.rows == canonical, "All-tasks rows are not current")
            }
            for window in windows { window.close() }''')
        fixture = fixture.replace('            var toLive = 0.0', '            var toLive = 0.0, toCurrent = 0.0')
        fixture = fixture.replace('                if backlog > 0 { try await wait { (Int64(model.lastSequence', r'''                if backlog > 0 { try await wait { model.tasks.contains { $0.title == "Backlog \(backlog) \(backlog - 1)" } } }
                toCurrent = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
                if backlog > 0 { try await wait { (Int64(model.lastSequence''')
        fixture = fixture.replace('rows[rows.count - 1]["switchToLiveMS"] = toLive', 'rows[rows.count - 1]["switchToLiveMS"] = toLive; rows[rows.count - 1]["switchToCurrentMS"] = toCurrent')
    if args.connection_probe:
        pass
    elif args.inspector_layout:
        fixture = fixture.split('@MainActor struct MacPerformanceMeasurement')[0] + SOURCE.with_name('InspectorMeasurement.swift').read_text()
    elif args.slow_actions:
        fixture = fixture.split('@MainActor struct MacPerformanceMeasurement')[0] + SOURCE.with_name('SlowActions.swift').read_text()
        modern = 'func setSearchText' in (package / 'Sources/TodoModel.swift').read_text()
        fixture = fixture.replace('// SEARCH_STATE', 'wasSearching = sampledModel.searchPending' if modern else '')
        fixture = fixture.replace('// PICKER_STATE', 'wasPicking = sampledModel.dependencies.picker?.loading ?? false' if (package / 'Sources/Dependencies.swift').exists() else '')
        search_action = '''
            for text in ["M", "Me", "Mea", "Meas", "Measurement"] {
                model.setSearchText(text)
                try await Task.sleep(for: .milliseconds(50))
            }
            try await wait { !model.searchPending && model.appliedSearchSnapshot?.appliedIdentity.text == "Measurement" }
        ''' if modern else '''
            for text in ["M", "Me", "Mea", "Meas", "Measurement"] {
                NotificationCenter.default.post(name: Notification.Name("MacPerfSearch"), object: text)
                try await Task.sleep(for: .milliseconds(50))
            }
            try #require(PerfSearchInput.applied == "Measurement")
        '''
        fixture = fixture.replace('// SEARCH_ACTION', search_action)
        fixture = fixture.replace('// CLEAR_SEARCH', 'model.setSearchText(""); try await wait { !model.searchPending && model.appliedSearchSnapshot?.appliedIdentity.text == "" }' if modern else 'NotificationCenter.default.post(name: Notification.Name("MacPerfSearch"), object: "")')
        picker_action = '''
        attach(AnyView(HStack { TaskListView(model: model).sidebar.frame(width: 220); TaskListView(model: model).taskContent }))
        _ = try await control("delay/" + (env["MAC_PERF_REPLY_DELAY_MS"] ?? "0"))
        try await step("dependency-picker") {
            await model.openDependencyPicker(model.tasks[0])
            try #require(model.dependencies.picker?.loading == false && model.dependencies.picker?.failure == nil)
            attach(AnyView(DependencyPickerView(model: model, compact: false)))
            model.closeDependencyPicker()
        }
        ''' if (package / 'Sources/Dependencies.swift').exists() else 'try await step("dependency-picker-unavailable") {}'
        fixture = fixture.replace('// PICKER_ACTION', picker_action)
        if not modern:
            view_file = package / 'Sources/AppViews.swift'
            views = view_file.read_text()
            marker = '.searchable(text: $search, prompt: "Find a task")'
            assert views.count(marker) == 1
            views = views.replace(marker, marker + '\n                .onReceive(NotificationCenter.default.publisher(for: Notification.Name("MacPerfSearch"))) { message in search = message.object as? String ?? ""; PerfSearchInput.applied = search }')
            view_file.write_text(views)
    elif args.root_window or args.diagnostics or args.compare_diagnostics or args.personal_tasks != 180 or args.owner_fixture:
        from root_fixture import decorate
        fixture = decorate(fixture, args.root_window, climb=args.climb)
    dependency_steps = '''
        var pickerLayouts: [Double] = []
        try await step("dependency-picker") {
            await model.openDependencyPicker(model.tasks[0])
            try #require(model.dependencies.picker?.loading == false && model.dependencies.picker?.failure == nil)
            pickerLayouts = [measureView(AnyView(DependencyPickerView(model: model, compact: true)), compact: true), measureView(AnyView(DependencyPickerView(model: model, compact: false)), compact: false)]
            model.closeDependencyPicker()
        }
        rows[rows.count - 1]["pickerLayoutMS"] = pickerLayouts
        try await step("dependencies-view") { await model.readDependencyGraph(root: model.tasks[0].id); try #require(model.dependencies.graph?.report != nil); model.closeDependencyGraph() }
    ''' if (package / 'Sources/Dependencies.swift').exists() else '''
        try await step("dependency-picker-unavailable") {}
        try await step("dependencies-view-unavailable") {}
    '''
    (package / 'Perf/Measurement.swift').write_text(fixture.replace('// DEPENDENCY_STEPS', dependency_steps))
    (package / 'Sources/PerfTrace.swift').write_text(SOURCE.with_name('Trace.swift').read_text())
    model_file = package / 'Sources/TodoModel.swift'
    model_source = model_file.read_text()
    original_model_source = model_source
    begin = model_source.index('    private func readSearchCatalog(' if args.climb else '    private func refresh(')
    end = model_source.index('\n    private func ', begin + 5)
    function = model_source[begin:end]
    opening = function.index('{')
    closing = function.rindex('}')
    prefix = function[:opening + 1]
    body = function[opening + 1:closing]
    throws = 'throws' in prefix
    wrapped = prefix + '\n        let perfID = PerfTrace.shared.begin()\n        defer { PerfTrace.shared.end(perfID) }\n        return ' + ('try ' if throws else '') + 'await PerfTrace.$refreshID.withValue(perfID) {\n' + body + '\n        }\n    }\n\n'
    model_source = model_source[:begin] + wrapped + model_source[end:]
    model_source = model_source.replace('if let cursor = lastSequence.flatMap(Int64.init), operation.seq <= cursor { continue }', 'if let cursor = lastSequence.flatMap(Int64.init), operation.seq <= cursor { continue }\n                            PerfTrace.shared.consumed(operation.seq)')
    model_source = model_source.replace('if Task.isCancelled || generation != run { return }', 'if Task.isCancelled || generation != run { return }\n                PerfTrace.record(error)', 1)
    model_source = model_source.replace('try JSONDecoder().decode(type, from: JSONEncoder().encode(wire))', 'try PerfTrace.decode { try JSONDecoder().decode(type, from: JSONEncoder().encode(wire)) }')
    model_file.write_text(original_model_source if args.connection_probe else model_source)
    snapshot_file = package / 'Sources/TaskSnapshot.swift'
    if not args.connection_probe: snapshot_file.write_text(snapshot_file.read_text().replace('try JSONDecoder().decode(Self.self, from: JSONEncoder().encode(value))', 'try PerfTrace.decode { try JSONDecoder().decode(Self.self, from: JSONEncoder().encode(value)) }'))
    (package / 'Sources/SessionVault.swift').write_text('''
import Foundation
struct SessionVault {
    let service: String
    let account: String
    func load() throws -> String? { fatalError("Keychain is forbidden in MAC-PERF") }
    func save(_ credential: String) throws { fatalError("Keychain is forbidden in MAC-PERF") }
    func delete() throws { fatalError("Keychain is forbidden in MAC-PERF") }
}
func configureVerificationKeychain() { fatalError("Keychain is forbidden in MAC-PERF") }
struct VaultError: LocalizedError { var errorDescription: String? { "Forbidden Keychain access" } }
''')
    (package / 'Package.swift').write_text('''// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "MacPerf", platforms: [.macOS(.v26)], dependencies: [.package(path: "API")], targets: [
    .target(name: "TodoState", dependencies: [.product(name: "TodoAPI", package: "API")], path: "Sources", exclude: ["TodoApp.swift"], swiftSettings: [.unsafeFlags(["-enable-testing"])]),
    .testTarget(name: "MacPerfTests", dependencies: ["TodoState", .product(name: "TodoAPI", package: "API")], path: "Perf")])
''')
    if args.connection_probe:
        manifest=package/'Package.swift'
        value=manifest.read_text().replace('targets: [', 'targets: [\n    .target(name: "PerfDescriptors", path: "PerfC", publicHeadersPath: "include", linkerSettings: [.linkedLibrary("proc")]),')
        value=value.replace('.testTarget(name: "MacPerfTests", dependencies: ["TodoState",', '.testTarget(name: "MacPerfTests", dependencies: ["TodoState", "PerfDescriptors",')
        manifest.write_text(value)
    packages[ref] = package
    run(['sh', ROOT / 'scripts/disk-guard.sh'], 'disk-' + label)
    build_hash = hashlib.sha256()
    for path in sorted([*package.glob('Sources/*.swift'), *package.glob('Perf/*.swift'), *package.glob('API/Sources/TodoAPI/*.swift'), *package.glob('API/Sources/TodoAPI/GeneratedSources/*.swift'), package / 'Package.swift', package / 'API/Package.swift']):
        build_hash.update(str(path.relative_to(package)).encode()); build_hash.update(path.read_bytes())
    if args.connection_probe:
        for path in sorted((package/'PerfC').rglob('*')):
            if path.is_file(): build_hash.update(path.read_bytes())
    build_hash.update(json.dumps(pins, sort_keys=True).encode())
    cache = package / 'perf-build.json'
    reused = json.loads(cache.read_text()) if cache.exists() else None
    if reused and reused['hash'] == build_hash.hexdigest():
        (evidence / ('reused-build-' + label + '.json')).write_text(json.dumps(reused, indent=2))
    else:
        run([ROOT / 'scripts/swift-slot.sh', 'swift', 'build', '--configuration', 'release', '--package-path', package, '--disable-automatic-resolution', '--build-tests', '--jobs', '2'], 'build-' + label)
        cache.write_text(json.dumps(dict(hash=build_hash.hexdigest(), evidence=str(evidence), command=commands[-1]), indent=2))
    assert pins == {str(p.relative_to(package)): hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('Package.resolved') if '.build' not in p.parts}, 'pins changed'
    artifacts = [p for p in [package / '.build/release/MacPerfPackageTests.xctest/Contents/MacOS/MacPerfPackageTests', package / '.build/release/MacPerfPackageTests'] if p.is_file()]
    assert artifacts, 'compiled unhosted measurement binary missing'
    (evidence / ('artifact-' + label + '.json')).write_text(json.dumps({str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts}, indent=2))
if args.prepare_only:
    raise SystemExit(0)

while args.max_start_load > 0 and os.getloadavg()[0] > args.max_start_load:
    (evidence / 'load-gate.json').write_text(json.dumps(dict(load=os.getloadavg(), at=time.time(), waiting=True)))
    time.sleep(5)

binaries = json.loads((ROOT / '.scratch/bin/build.json').read_text())
(evidence / 'binaries.json').write_text(json.dumps(dict(receipt=binaries, sha256={key: hashlib.sha256(Path(binaries[key]).read_bytes()).hexdigest() for key in ['cli', 'server', 'seed']}), indent=2))
for iteration in range(args.iteration_offset, args.iteration_offset + args.runs):
    modes = [False, True] if args.compare_diagnostics else [args.diagnostics]
    delays = [0, 500, 2000, 5000] if args.compare_delays else [args.reply_delay_ms]
    order = [(ref, sha, diagnostics, delay) for ref, sha in refs.items() for diagnostics in modes for delay in delays]
    if iteration % 2: order.reverse()
    for ref, sha, diagnostics, delay in order:
        name = f'{iteration}-' + (('open-' if diagnostics else 'closed-') if args.compare_diagnostics else '') + (f'delay{delay}-' if args.compare_delays else '') + labels[ref]
        while args.max_start_load > 0 and os.getloadavg()[0] > args.max_start_load:
            (evidence / 'load-gate.json').write_text(json.dumps(dict(load=os.getloadavg(), at=time.time(), waiting=True, nextRun=name)))
            time.sleep(5)
        folder = evidence / name
        folder.mkdir(exist_ok=False)
        (folder / 'variant.json').write_text(json.dumps(dict(ref=ref, commit=sha, label=labels[ref], working_tree=ref == 'working-tree'), indent=2))
        (folder / 'host.json').write_text(json.dumps(dict(load=os.getloadavg(), at=time.time(), cores=os.cpu_count())))
        scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-mac-perf-'))
        home = scratch / 'home'
        home.mkdir()
        env = dict(BASE_ENV, HOME=str(home), CFFIXED_USER_HOME=str(home), TODO_DB=str(scratch / 'scratch.db'))
        processes = []
        load_stop = threading.Event()
        def sample_load():
            while not load_stop.is_set():
                with (folder / 'load.ndjson').open('a') as output:
                    output.write(json.dumps(dict(at=time.time(), monotonic=time.monotonic(), load=os.getloadavg())) + '\n')
                load_stop.wait(2)
        load_thread = threading.Thread(target=sample_load, daemon=True)
        load_thread.start()
        try:
            run([binaries['seed'], scratch], 'seed-' + name, env)
            log = (folder / 'server.log').open('w')
            server = subprocess.Popen([binaries['server']], env=dict(env, TODO_PORT='0'), stdout=log, stderr=subprocess.STDOUT)
            processes.append(server)
            deadline = time.monotonic() + 60
            port = None
            while time.monotonic() < deadline:
                match = re.search(r'Listening on http://127.0.0.1:(\d+)', (folder / 'server.log').read_text())
                if match: port = int(match[1]); break
                time.sleep(.05)
            assert port, 'server readiness deadline'
            def request(method, path, payload=None, credential=''):
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=60)
                headers = {'content-type': 'application/json', 'authorization': 'Bearer ' + credential}
                connection.request(method, path, json.dumps(payload) if payload is not None else None, headers)
                response = connection.getresponse()
                data = response.read()
                assert response.status < 300, (response.status, path, data)
                connection.close()
                return json.loads(data) if data else None
            credential = request('POST', '/auth/sessions', {'passphrase': 'scratch verification passphrase'})['credential']
            for profile in ['work', 'personal']:
                run([binaries['cli'], 'login', '--password-stdin', '--profile', profile, '--format', 'json'], 'login-' + profile + name, env, input='scratch verification passphrase\n')
                items = [dict(external_id=f'perf-{i}', title=f'Measurement Task {i:03}', description='Ordinary description for planning and follow-up. ' * 3, priority=['P1','P2','P3','P4'][i % 4], project_name=f'Project {i % 12:02}', tag_names=[f'Tag {i % 70:02}', f'Tag {(i + 13) % 70:02}'], energy=i % 5 + 1, estimate_min=25, **({'due_at': {'kind':'date','date':'2026-11-09'}} if i % 3 == 0 else {}), **({'depends_on': [f'perf-{i-1}']} if i in [1,3,5] else {})) for i in range(args.personal_tasks if profile == 'personal' else 180)]
                if args.owner_fixture: items=owner_items(profile,dependencies=True)
                file = scratch / (profile + '.json')
                file.write_text(json.dumps(items))
                run([binaries['cli'], 'import', file, '--profile', profile, '--format', 'json'], 'import-' + profile + name, env)
            if args.owner_fixture:
                shape=finish_owner_fixture(run,lambda method,path,payload=None:request(method,path,payload,credential),binaries['cli'],scratch,env,name)
                (folder / 'owner-shape.json').write_text(json.dumps(shape,indent=2))
            if args.history_operations:
                current = request('GET', '/profiles/work/tasks', credential=credential)
                target = next(t for t in current if not t.get('depends_on') and not t.get('blocks'))
                with sqlite3.connect(scratch / 'scratch.db') as db: existing = db.execute('select max(seq) from op_log').fetchone()[0]
                assert existing <= args.history_operations
                for i in range(args.history_operations - existing):
                    request('PATCH', f"/profiles/work/tasks/{target['id']}", {'from_version': target['row_version'], 'changes': {'title': f'History warmup {i}'}}, credential)
                    target['row_version'] += 1
            tasks = request('GET', '/profiles/work/tasks', credential=credential)
            tasks.sort(key=lambda x:x['title'])
            with sqlite3.connect(scratch / 'scratch.db') as db:
                cursor = str(db.execute('select max(seq) from op_log').fetchone()[0])
            (folder / 'workload.json').write_text(json.dumps(dict(tasks={'work': OWNER['work']['total'] if args.owner_fixture else 180, 'personal': args.personal_tasks}, ownerFixture=args.owner_fixture, initialHistory=int(cursor), rootWindow=args.root_window or args.slow_actions, diagnostics=diagnostics, activeLayout=args.active_layout, slowActions=args.slow_actions, replyDelayMS=delay, cpuWorkers=args.cpu_workers), indent=2))
            contract = re.search(r'"([0-9a-f]{64})"', (packages[ref] / 'API/Sources/TodoAPI/ContractIdentity.swift').read_text())[1]
            legacy = not (packages[ref] / 'Sources/Dependencies.swift').exists()
            def compatible(value):
                if isinstance(value, list): return [compatible(item) for item in value]
                if isinstance(value, dict):
                    omitted = {'depends_on', 'blocks', 'ready', 'blocked', 'remaining_energy'} if legacy and {'id', 'profile_id', 'row_version'}.issubset(value) else set()
                    return {key: compatible(item) for key, item in value.items() if key not in omitted}
                return value
            counts = []
            events = []
            close_generation = [0]
            inspector_edit_serial = [0]
            reply_delay_ms = [0]
            streams = []
            class Handler(http.server.BaseHTTPRequestHandler):
                protocol_version = 'HTTP/1.1'
                disable_nagle_algorithm = True
                def log_message(self, *args): pass
                def do_POST(self): self.do_GET()
                def reply(self, value):
                    data = json.dumps(value).encode()
                    self.send_response(200); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
                def do_GET(self):
                    if self.path.startswith('/__perf/'):
                        action = self.path[len('/__perf/'):]
                        value = None
                        if action.startswith('start/'): counts.clear(); events.clear()
                        elif action.startswith('catalog/'):
                            value = request('GET', '/profiles/' + action.split('/')[-1] + '/tasks', credential=credential)
                        elif action.startswith('description/'):
                            characters=int(action.split('/')[-1]);target=request('GET','/profiles/work/tasks',credential=credential)[0]
                            description=('Description with ordinary words. ' * ((characters+32)//33))[:characters]
                            description=(description+' ' * characters)[:characters]
                            request('PATCH',f"/profiles/work/tasks/{target['id']}",{'from_version':target['row_version'],'changes':{'description':description}},credential)
                            with sqlite3.connect(scratch/'scratch.db') as db: latest=db.execute('select max(seq) from op_log').fetchone()[0]
                            value=dict(task=target['id'],cursor=str(latest))
                        elif action.startswith('edit/'):
                            i = int(action.split('/')[-1]); task = tasks[10 + i]
                            title = f'Live edit {i}'
                            if args.inspector_layout:
                                task=next(t for t in request('GET','/profiles/work/tasks',credential=credential) if t['id']==task['id'])
                                inspector_edit_serial[0]+=1;title+=f' inspector {inspector_edit_serial[0]}'
                            run([binaries['cli'], 'edit', task['id'], '--expected-version', str(task['row_version']), '--title', title, '--profile', 'work', '--format', 'json'], f'edit-{name}-{i}', env)
                        elif action == 'close-stream':
                            close_generation[0] += 1
                            for stream in list(streams):
                                try: stream.fp.raw._sock.shutdown(socket.SHUT_RD)
                                except (AttributeError, OSError): pass
                        elif action.startswith('backlog/') or action == 'burst':
                            profile = 'personal'
                            total = int(action.split('/')[-1]) if action.startswith('backlog/') else 20
                            current = request('GET', f'/profiles/{profile}/tasks', credential=credential)
                            target = next(t for t in current if not t.get('depends_on') and not t.get('blocks'))
                            with sqlite3.connect(scratch / 'scratch.db') as db: before = db.execute('select max(seq) from op_log').fetchone()[0]
                            for i in range(total):
                                if action == 'burst':
                                    run([binaries['cli'], 'edit', target['id'], '--expected-version', str(target['row_version']), '--title', f'Burst {i}', '--profile', profile, '--format', 'json'], f'burst-{name}-{i}', env)
                                else:
                                    request('PATCH', f"/profiles/{profile}/tasks/{target['id']}", {'from_version': target['row_version'], 'changes': {'title': f'Backlog {total} {i}'}}, credential)
                                target['row_version'] += 1
                            with sqlite3.connect(scratch / 'scratch.db') as db: after = db.execute('select max(seq) from op_log').fetchone()[0]
                            value = dict(before=str(before), after=str(after))
                        elif action == 'cursor':
                            with sqlite3.connect(scratch / 'scratch.db') as db: value = dict(after=str(db.execute('select max(seq) from op_log').fetchone()[0]))
                        elif action.startswith('delay/'):
                            reply_delay_ms[0] = int(action.split('/')[-1])
                        self.reply(value if value is not None else dict(requests=list(counts), operationEvents=list(events))); return
                    upstream = http.client.HTTPConnection('127.0.0.1', port, timeout=60)
                    headers = dict(self.headers)
                    if self.path.endswith('/events') and not any(k.lower() == 'last-event-id' for k in headers): headers['Last-Event-ID'] = cursor
                    body = self.rfile.read(int(self.headers.get('Content-Length', '0'))) or None
                    started = time.monotonic()
                    upstream.request(self.command, self.path, body, headers)
                    response = upstream.getresponse()
                    record = dict(method=self.command, path=self.path, status=response.status, started=started, refresh=self.headers.get('X-Mac-Perf-Refresh'), cursor=next((v for k,v in headers.items() if k.lower() == 'last-event-id'), None))
                    counts.append(record)
                    if not self.path.endswith('/events') and self.command == 'GET' and reply_delay_ms[0]:
                        time.sleep(reply_delay_ms[0] / 1000)
                    self.send_response(response.status)
                    self.send_header('Content-Type', response.getheader('Content-Type', 'application/json'))
                    if response.getheader('Cache-Control'):
                        self.send_header('Cache-Control', response.getheader('Cache-Control'))
                    if self.path.endswith('/events'):
                        if args.climb: response.fp.raw._sock.settimeout(None)
                        stream_log = folder / f'stream-{time.time_ns()}.txt'
                        stream_log.write_text(str(response.status) + '\n' + str(response.headers) + '\n')
                        self.send_header('Connection','close'); self.end_headers()
                        generation = close_generation[0]
                        pending = b''
                        streams.append(response)
                        watch_stop = threading.Event()
                        def watch_client():
                            while not watch_stop.is_set():
                                try:
                                    readable, _, _ = select.select([self.connection], [], [], .1)
                                    if readable and not self.connection.recv(1, socket.MSG_PEEK):
                                        response.fp.raw._sock.shutdown(socket.SHUT_RD)
                                        return
                                except (OSError, ValueError, AttributeError):
                                    try: response.fp.raw._sock.shutdown(socket.SHUT_RD)
                                    except (OSError, AttributeError): pass
                                    return
                        watch_thread = threading.Thread(target=watch_client, daemon=True)
                        watch_thread.start()
                        try:
                            while generation == close_generation[0]:
                                chunk = response.read1(65536)
                                with stream_log.open('ab') as trace: trace.write(chunk)
                                if not chunk: break
                                pending += chunk
                                while b'\n\n' in pending:
                                    frame, pending = pending.split(b'\n\n', 1)
                                    if b'event: operation' in frame:
                                        events.append(dict(id=re.search(rb'id: (\d+)', frame)[1].decode(), profile=self.path, at=time.monotonic()))
                                self.wfile.write(chunk); self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError, http.client.HTTPException, TimeoutError): pass
                        finally:
                            watch_stop.set()
                            watch_thread.join(timeout=1)
                            streams.remove(response)
                        self.close_connection = True
                    else:
                        data = response.read()
                        record['upstreamBytes'] = len(data)
                        adapting = time.monotonic()
                        if self.path == '/health':
                            health = json.loads(data); health['contract'] = contract; data = json.dumps(health).encode()
                        elif legacy and 'json' in response.getheader('Content-Type', ''):
                            data = json.dumps(compatible(json.loads(data)), separators=(',', ':')).encode()
                        record['adapterMS'] = (time.monotonic() - adapting) * 1000
                        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
                        record['bytes'] = len(data)
                        record['elapsedMS'] = (time.monotonic() - record['started']) * 1000
                    upstream.close()
            class ClimbProxy(http.server.ThreadingHTTPServer):
                request_queue_size = 1024
            proxy = (ClimbProxy if args.climb else http.server.ThreadingHTTPServer)(('127.0.0.1', 0), Handler)
            (folder / 'proxy.json').write_text(json.dumps(dict(accept_backlog=proxy.request_queue_size, request_accounting='Client only; controller truth reads excluded'), indent=2))
            proxy.daemon_threads = True
            threading.Thread(target=proxy.serve_forever, daemon=True).start()
            url = f'http://127.0.0.1:{proxy.server_port}'
            if args.cpu_workers: wait_for_owner_idle(folder / 'cpu-worker-admission.json')
            for _ in range(args.cpu_workers):
                processes.append(subprocess.Popen([sys.executable, '-c', 'while True: pass'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            if args.cpu_workers: time.sleep(1)
            run([ROOT / 'scripts/swift-slot.sh', 'swift', 'test', '--configuration', 'release', '--package-path', packages[ref], '--disable-automatic-resolution', '--skip-build', '--filter', 'MacPerformanceMeasurement'], 'session-' + name, dict(env, MAC_PERF_SERVER=url, MAC_PERF_OUTPUT=str(folder / 'measurement.json'), MAC_PERF_PERSONAL_TASKS=str(args.personal_tasks), MAC_PERF_DIAGNOSTICS='1' if diagnostics else '0', MAC_PERF_ACTIVE_LAYOUT=args.active_layout, MAC_PERF_REPLY_DELAY_MS=str(delay), MAC_PERF_WORK_TASKS=str(OWNER['work']['total'] if args.owner_fixture else 180), MAC_PERF_WORK_TAGS=str(OWNER['work']['tags'] if args.owner_fixture else 70), MAC_PERF_WORK_PROJECTS=str(OWNER['work']['projects'] if args.owner_fixture else 12), MAC_PERF_COMPLETE_TITLE='Measurement Task 020' if args.owner_fixture else ('Measurement Task 100' if args.slow_actions else '')))
            proxy.shutdown(); proxy.server_close()
        finally:
            for process in processes:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait()
            unsafe = list(evidence.glob('command-unsafe-*'))
            if not unsafe: shutil.rmtree(scratch)
            load_stop.set()
            load_thread.join(timeout=3)
            (folder / 'cleanup.json').write_text(json.dumps(dict(processes=[dict(pid=p.pid, exit=p.returncode) for p in processes], scratchRemoved=not scratch.exists(), retainedScratch=str(scratch) if unsafe else None)))
            if 'log' in locals(): log.close()

if args.inspector_layout:
    print(json.dumps(dict(errors=0, sessions=sum(command['log'].startswith('session-') for command in commands))))
    raise SystemExit(0)
if args.climb:
    print(run([sys.executable, SOURCE.with_name('climb_summary.py'), evidence], 'climb-summary'), end='')
    raise SystemExit(0)
summary_text = run([sys.executable, SOURCE.with_name('summarize.py'), evidence], 'summary')
print(summary_text, end='')
print((evidence / 'work.json').read_text())
