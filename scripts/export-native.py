#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Export the audited app plus pinned glibc Node for the existing systemd host."""
import argparse,hashlib,json,subprocess,tarfile,tempfile
from pathlib import Path
NODE_IMAGE='node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('image');parser.add_argument('output',type=Path)
args=parser.parse_args()
def docker(*parts):return subprocess.check_output(['docker',*parts],text=True,stdin=subprocess.DEVNULL).strip()
image=json.loads(docker('image','inspect',args.image))[0]
revision=image['Config']['Labels']['org.opencontainers.image.revision']
branch=next(value.split('=',1)[1] for value in image['Config']['Env'] if value.startswith('COMMIT_BRANCH='))
containers=[]
try:
    with tempfile.TemporaryDirectory(prefix='keyoxide-native-') as folder:
        folder=Path(folder);(folder/'node/bin').mkdir(parents=True)
        app=docker('create',args.image);containers.append(app)
        node=docker('create',NODE_IMAGE);containers.append(node)
        docker('cp',app+':/app',str(folder/'app'))
        docker('cp',node+':/usr/local/bin/node',str(folder/'node/bin/node'))
        docker('cp',node+':/usr/local/LICENSE',str(folder/'node/LICENSE'))
        if list((folder/'app/node_modules').rglob('*.node')):raise SystemExit('Native addons require a separate glibc build')
        (folder/'release.env').write_text('COMMIT_SHA='+revision+'\nCOMMIT_BRANCH='+branch+'\n')
        metadata={'revision':revision,'appImage':image['Id'],'nodeImage':NODE_IMAGE,'nodeSha256':hashlib.sha256((folder/'node/bin/node').read_bytes()).hexdigest()}
        (folder/'release.json').write_text(json.dumps(metadata,indent=2)+'\n')
        # Exercise the exported layout on glibc, independent of the Alpine image.
        check="""const {spawn}=require('child_process');
const child=spawn('/release/node/bin/node',['src/index.js'],{cwd:'/release/app',env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3339',COMMIT_SHA:process.env.EXPECTED_REVISION},stdio:'ignore'});
(async()=>{try{let ready=false;for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:3339/healthz');if(r.ok){const j=await r.json();if(j.revision!==process.env.EXPECTED_REVISION)throw Error('revision');ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ready)throw Error('health');for(const p of ['/','/privacy','/util','/source.tar.gz']){if(!(await fetch('http://127.0.0.1:3339'+p)).ok)throw Error(p)}console.log('PASS native Node '+process.version+', health revision, homepage/privacy/utilities/source')}catch(e){console.error(e.message);process.exitCode=1}finally{child.kill('SIGTERM')}})();"""
        # TemporaryDirectory is private. Allow only container UID 1000 to traverse
        # this public-runtime-only tree for the unprivileged smoke test.
        folder.chmod(0o755)
        print(docker('run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','-e','EXPECTED_REVISION='+revision,'-v',str(folder)+':/release:ro','--entrypoint','/release/node/bin/node',NODE_IMAGE,'-e',check),flush=True)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with tarfile.open(args.output,'w:gz') as archive:
            for p in sorted(folder.iterdir()):archive.add(p,arcname=p.name)
        print('Native systemd bundle exported.',flush=True)
finally:
    for container in containers:docker('rm','-f',container)
