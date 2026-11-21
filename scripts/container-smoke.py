#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local-only smoke test. Starts and removes one release container, never deploys."""
import io,json,subprocess,sys,tarfile,time,urllib.request,urllib.error
image=sys.argv[1] if len(sys.argv)>1 else 'monero-love-keyoxide:simplex-rc1'
def docker(*args):
    return subprocess.check_output(['docker',*args],text=True).strip()
c=docker('run','-d','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--memory','512m','--pids-limit','128','-p','127.0.0.1::3000',image)
try:
    port=json.loads(docker('inspect',c))[0]['NetworkSettings']['Ports']['3000/tcp'][0]['HostPort']
    base='http://127.0.0.1:'+port
    for attempt in range(60):
        try:
            urllib.request.urlopen(base+'/healthz',timeout=1).close()
            break
        except (OSError,urllib.error.URLError): time.sleep(.25)
    else: raise RuntimeError('startup failed')
    for path in ['/healthz','/','/util','/source.tar.gz','/api/3/profile/verify','/api/3/profile/fetch?query=foo&doVerification=true']:
        try:
            with urllib.request.urlopen(base+path,timeout=5) as r:
                body=r.read()
                assert r.status==200 and body
                assert r.headers['X-Content-Type-Options']=='nosniff'
                assert r.headers['X-Frame-Options']=='DENY'
                if path=='/source.tar.gz':
                    with tarfile.open(fileobj=io.BytesIO(body),mode='r:gz') as archive:
                        names=archive.getnames()
                        assert './package-lock.json' in names and './Dockerfile' in names
                        assert not any('/node_modules/' in n or '/.local/' in n or n.endswith('.asc') for n in names)
                assert not path.startswith('/api/')
                print('PASS',path,r.status)
        except urllib.error.HTTPError as e:
            assert path.startswith('/api/') and e.code==403,(path,e.code)
            print('PASS disabled legacy API',path,e.code)
    print(docker('exec',c,'node','-e',"const assert=require('assert');assert.equal(process.getuid(),1000);assert.equal(process.version,'v22.23.5');try{require('fs').writeFileSync('/app/audit-write','x');process.exit(1)}catch(e){assert.equal(e.code,'EROFS')}console.log('PASS non-root, pinned Node, read-only filesystem')"))
    docker('stop','--timeout','12',c)
    assert docker('inspect','--format','{{.State.ExitCode}}',c)=='0'
    print('PASS graceful shutdown')
finally:
    docker('rm','-f',c)
