import json
import os
from pathlib import Path
import runpy
import importlib.util
import subprocess
import sys

spec = importlib.util.spec_from_file_location('production_results', Path(__file__).with_name('production-results.py'))
results_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(results_module)

recipe, evidence, configuration = sys.argv[1:]
settings = json.loads(Path(configuration).read_text())
root = Path(settings['root'])
proof = Path(settings['proof'])
base = settings['environment']
records = []
Original = subprocess.Popen

class ExplicitProcess(Original):
    def __init__(self, args, *positional, **options):
        if isinstance(args, (str, bytes)):
            raise RuntimeError('Shell command strings are forbidden')
        argv = [str(value) for value in args]
        source = options.pop('env', None) or base
        env = dict(base)
        env.update({key: str(value) for key, value in source.items() if key.startswith('TODO_') or key == 'SEC_SEARCH_RECOVERY_SEED'})
        env['HOME'] = str(source.get('HOME', base['HOME']))
        if not Path(env['HOME']).is_relative_to(proof):
            raise RuntimeError('A production proof HOME escaped scratch')
        env['CFFIXED_USER_HOME'] = env['HOME']
        env['TMPDIR'] = base['TMPDIR']
        env.update(TODO_PROOF_AUDIT=settings['audit'], TODO_PROOF_OWNER_HOME=settings['ownerHome'])
        if argv[:2] == ['node', 'apps/macos/scripts/graph-resources.mjs']:
            argv = ['node', settings['graphCopier'], *argv[2:]]
        name = argv[0]
        if argv[:2] == ['bun', 'build'] and '--compile' in argv:
            argv[2:2] = ['--no-env-file', '--config=/dev/null', '--no-macros', '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json']
        if name == 'git': argv = ['/usr/bin/git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', *argv[1:]]
        elif name in settings['tools']: argv[0] = settings['tools'][name]
        elif not Path(name).is_absolute():
            resolved = (root / name).resolve()
            if resolved.suffix == '.sh': argv = ['/bin/sh', str(resolved), *argv[1:]]
            else: raise RuntimeError('Unapproved relative executable: ' + name)
        swift = name == 'swift' or name == 'xcrun' and len(argv) > 1 and argv[1].startswith('swift')
        self._test_xml = None
        if name == 'swift':
            if argv[1] in ['test', 'build']: argv += ['--disable-keychain', '--disable-netrc']
            if argv[1] in ['test', 'build'] and '--show-bin-path' not in argv:
                argv += ['-Xlinker', '-needed_library', '-Xlinker', settings['library']]
            if argv[1] == 'test':
                self._test_xml = str(Path(settings['evidence']) / ('tests-' + str(len(records)) + '.xml'))
                argv += ['--xunit-output', self._test_xml]
            argv = ['/usr/bin/xcrun', 'swift', *argv[1:]]
        if swift:
            if any(Path(settings[key]).exists() for key in ['hold', 'parentHold']): raise RuntimeError('Coordinator holds new Swift jobs')
            if settings['denyProfile']:
                argv = ['/usr/bin/sandbox-exec', '-f', settings['denyProfile'], *argv]
            argv = ['/bin/sh', str(root / 'scripts/swift-slot.sh'), *argv]
        self._swift_job = swift
        self._queue_budget_added = False
        if Path(argv[0]).name == 'server' and env.get('TODO_DB'):
            executable = Path(argv[0]).resolve(strict=True)
            if not executable.is_relative_to(proof): raise RuntimeError('Production server escaped scratch')
            argv[0] = str(executable)
            database = Path(env['TODO_DB']).resolve()
            if not database.is_relative_to(proof): raise RuntimeError('Production database escaped scratch')
            options['cwd'] = str(database.parent)
            profile = '(version 1)(allow default)(deny file-read*)(deny file-write*)(allow file-read-data (literal "/"))(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple") (subpath "/Library/Fonts"))(allow file-read* (literal "/dev/null" "/dev/random" "/dev/urandom"))(allow file-read* file-write* (subpath ' + json.dumps(str(proof)) + '))(deny network-outbound)(deny mach-lookup)(deny process-exec)(allow process-exec (literal ' + json.dumps(str(executable)) + '))'
            env = {key: env[key] for key in ['HOME', 'CFFIXED_USER_HOME', 'TMPDIR', 'TODO_DB', 'TODO_PORT', 'LANG', 'LC_ALL']}
            argv = ['/usr/bin/sandbox-exec', '-p', profile, *argv]
        options['env'] = env
        super().__init__(argv, *positional, **options)
        output = options.get('stdout')
        records.append({'argv': argv, 'environment': env, 'pid': self.pid, 'testXML': self._test_xml, 'logFile': getattr(output, 'name', None), 'hostLoad': os.getloadavg()})
        (Path(settings['evidence']) / 'expanded-commands.json').write_text(json.dumps(records, indent=2))
    def _record_exit(self):
        for row in records:
            if row['pid'] == self.pid:
                row['exit'] = self.returncode
                row['hostLoadAfter'] = os.getloadavg()
                if self._test_xml and row['logFile']:
                    row.update(results_module.read_results(self._test_xml, row['logFile']))
        (Path(settings['evidence']) / 'expanded-commands.json').write_text(json.dumps(records, indent=2))
    def wait(self, *args, **kwargs):
        if self._swift_job and not self._queue_budget_added:
            timeout = args[0] if args else kwargs.get('timeout')
            if timeout is not None and timeout >= 60:
                self._queue_budget_added = True
                if args: args = (timeout + 3600, *args[1:])
                else: kwargs['timeout'] = timeout + 3600
        value = super().wait(*args, **kwargs); self._record_exit(); return value
    def communicate(self, *args, **kwargs):
        value = super().communicate(*args, **kwargs); self._record_exit(); return value

subprocess.Popen = ExplicitProcess
sys.argv = [recipe, evidence]
runpy.run_path(recipe, run_name='__main__')
