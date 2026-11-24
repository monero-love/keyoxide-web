#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build, test, audit and export an immutable deployment bundle. Never deploys."""
import argparse,datetime,hashlib,json,os,re,subprocess,tarfile,tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NGINX='nginx@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--trivy',default='trivy')
parser.add_argument('--gitleaks',default='gitleaks')
args=parser.parse_args()
os.chdir(ROOT)
def output(*command):return subprocess.check_output(command,text=True).strip()
if output('git','status','--porcelain'):raise SystemExit('Commit the source before preparing a deployment bundle')
if output('node','--version')!='v22.23.5':raise SystemExit('Use pinned Node v22.23.5')
sha=output('git','rev-parse','HEAD')
branch=output('git','branch','--show-current')
tag='monero-love-keyoxide:'+sha[:12]
out=ROOT/'release-artifacts'/sha[:12]
out.mkdir(parents=True,exist_ok=False)
steps=[]
def run(name,command,**kwargs):
    print('Running '+name,flush=True)
    with (out/(name+'.log')).open('w') as log:
        result=subprocess.run(command,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,timeout=600,**kwargs)
    steps.append({'step':name,'exitCode':result.returncode})
    if result.returncode:raise SystemExit(f'{name} failed. See {out/name}.log. No deployment performed.')

run('release-gate',['npm','run','check:release'])
with tempfile.TemporaryDirectory(prefix='keyoxide-release-source-') as staging:
    staging=Path(staging)
    subprocess.run(['git','archive','--format=tar.gz','--output='+str(out/'source.tar.gz'),sha],check=True)
    with tarfile.open(out/'source.tar.gz') as archive:archive.extractall(staging,filter='data')
    run('source-secrets',[args.gitleaks,'dir',str(staging),'--config',str(staging/'.gitleaks.toml'),'--redact','--report-format','json','--report-path',str(out/'source-secrets.json')])
    run('build',['docker','build','--build-arg','CI_COMMIT_SHA='+sha,'--build-arg','CI_COMMIT_BRANCH='+branch,'-t',tag,str(staging)])
    run('config-scan',[args.trivy,'config','--exit-code','1','--format','json','--output',str(out/'config-scan.json'),str(staging/'Dockerfile')])
image=json.loads(output('docker','image','inspect',tag))[0]
assert image['Config']['Labels']['org.opencontainers.image.revision']==sha
run('container-smoke',['python3','scripts/container-smoke.py',image['Id']])
run('https-rehearsal',['python3','scripts/deployment-smoke.py',image['Id'],'--nginx-image',NGINX])
run('image-audit',[args.trivy,'image','--image-src','docker','--scanners','vuln','--exit-code','1','--severity','UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL','--format','json','--output',str(out/'image-audit.json'),image['Id']])
run('image-sbom',[args.trivy,'image','--image-src','docker','--format','cyclonedx','--output',str(out/'image-sbom.cdx.json'),image['Id']])
run('native-export',['python3','scripts/export-native.py',image['Id'],str(out/'native-release.tar.gz')])
run('image-export',['docker','save','--output',str(out/'image.tar'),tag])
(out/'checks.json').write_text(json.dumps(steps,indent=2)+'\n')
def digest(path):
    sha256=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):sha256.update(block)
    return sha256.hexdigest()
gate=(out/'release-gate.log').read_text()
counts=re.findall(r'^# tests (\d+)$',gate,re.MULTILINE)
browser=re.findall(r'^\s+(\d+) passed \(',gate,re.MULTILINE)
assert len(counts)==2 and len(browser)==1, 'Missing test counts in release evidence'
manifest={'revision':sha,'branch':branch,'imageTag':tag,'imageId':image['Id'],'nginxRehearsalImage':NGINX,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tests':f'{counts[0]} application, {counts[1]} verifier, {browser[0]} browser','liveSiteModified':False,'artifacts':{p.name:digest(p) for p in sorted(out.iterdir()) if p.is_file()}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'SHA256SUMS').write_text(''.join(digest(p)+'  '+p.name+'\n' for p in sorted(out.iterdir()) if p.is_file() and p.name!='SHA256SUMS'))
print('PASS: deployment bundle ready at '+str(out),flush=True)
