#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('evidence',type=Path)
parser.add_argument('--ref',action='append')
parser.add_argument('--variant',choices=['production','no-drag','item-provider'],default='production')
args=parser.parse_args()
evidence=args.evidence.resolve();evidence.mkdir(parents=True,exist_ok=False)
commands=[]
for ref in args.ref or ['225b512f','e69230f9']:
    sha=subprocess.check_output(['git','rev-parse',ref],cwd=ROOT,text=True).strip()
    package=ROOT/'.scratch/mac-perf'/sha/'apps/macos'
    assert (package/'API/Sources/TodoAPI/PerfConnectionTrace.swift').is_file(),'Prepare connection-probe first'
    runner=package/'RowRunner';runner.mkdir(exist_ok=True)
    for target,source in [('Runner.swift','RowRunner.swift'),('RowSelection.swift','RowSelection.swift')]:
        (runner/target).write_text((Path(__file__).parent/source).read_text().replace('private func measureRowSelection','func measureRowSelection'))
    for name in ['AppViews.swift','DependencyDrag.swift']:
        result=subprocess.run(['git','show',f'{sha}:apps/macos/Sources/{name}'],cwd=ROOT,capture_output=True)
        if result.returncode==0 and (package/'Sources'/name).read_bytes()!=result.stdout:(package/'Sources'/name).write_bytes(result.stdout)
    if args.variant=='no-drag':
        path=package/'Sources/AppViews.swift';source=path.read_text();marker='.modifier(DependencyDragModifier(model: model, task: task))';assert source.count(marker)==1;path.write_text(source.replace(marker,''))
    elif args.variant=='item-provider':
        path=package/'Sources/DependencyDrag.swift';source=path.read_text();assert source.count('.onDrag {')==1;path.write_text(source.replace('.onDrag {','.itemProvider {'))
    manifest=package/'Package.swift';source=manifest.read_text();marker='.testTarget(name: "MacPerfTests"'
    if '.executableTarget(name: "RowProbeRunner"' not in source:
        assert source.count(marker)==1
        manifest.write_text(source.replace(marker,'.executableTarget(name: "RowProbeRunner", dependencies: ["TodoState", .product(name: "TodoAPI", package: "API")], path: "RowRunner"),\n    '+marker))
    argv=[ROOT/'scripts/swift-slot.sh','swift','build','--configuration','release','--package-path',package,'--disable-automatic-resolution','--product','RowProbeRunner','--jobs','2']
    with (evidence/(ref.replace('/','-')+'.log')).open('w') as log:result=subprocess.run(argv,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
    commands.append(dict(ref=sha,variant=args.variant,command=[str(x) for x in argv],exit=result.returncode));(evidence/'commands.json').write_text(json.dumps(commands,indent=2));assert result.returncode==0
    app=package/'RowProbe.app/Contents';(app/'MacOS').mkdir(parents=True,exist_ok=True)
    executable=app/'MacOS/RowProbeRunner';shutil.copy2(package/'.build/release/RowProbeRunner',executable)
    (app/'Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='local.todo.scratch-row-probe',CFBundleName='Todo scratch row probe',CFBundleExecutable='RowProbeRunner',CFBundlePackageType='APPL',NSPrincipalClass='NSApplication',NSHighResolutionCapable=True,LSMinimumSystemVersion='26.0')))
    (evidence/(ref.replace('/','-')+'-hashes.json')).write_text(json.dumps({str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [executable,*runner.glob('*.swift'),*package.glob('Sources/*.swift')]},indent=2))
print(json.dumps(dict(errors=0,builds=len(commands),variant=args.variant)))
