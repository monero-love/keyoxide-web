#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Rehearse nginx HTTPS, rate limits and rollback on isolated local containers."""
import argparse,importlib.util,json,socket,ssl,subprocess,tempfile,time,urllib.request,urllib.error,uuid
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('image')
parser.add_argument('--nginx-image',required=True,help='Pinned nginx image digest')
args=parser.parse_args()

def docker(*parts):return subprocess.check_output(['docker',*parts],text=True,stderr=subprocess.PIPE).strip()
def inspect(container):return json.loads(docker('inspect',container))[0]
name='keyoxide-rehearsal-'+uuid.uuid4().hex[:10]
containers=[]
network=None
try:
    network=docker('network','create',name)
    config=json.loads(docker('network','inspect',network))[0]['IPAM']['Config'][0]
    gateway=config['Gateway']
    def free_port():
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));return listener.getsockname()[1]
    https_port=free_port();http_port=free_port();app_port=free_port()
    with tempfile.TemporaryDirectory(prefix='keyoxide-tls-rehearsal-') as directory:
        directory=Path(directory)
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=keyoxide.test','-addext','subjectAltName=DNS:keyoxide.test,DNS:proxy,IP:127.0.0.1','-keyout',str(directory/'tls.key'),'-out',str(directory/'tls.crt')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        spec=importlib.util.spec_from_file_location('render',Path(__file__).with_name('render-nginx.py'))
        renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
        conf=renderer.render('keyoxide.test','127.0.0.1:'+str(app_port),'/certs/tls.crt','/certs/tls.key',http_port,https_port,'127.0.0.1')
        (directory/'site.conf').write_text(conf)
        def start_app():
            container=docker('run','-d','--name',name+'-app','--network',network,'-p',f'127.0.0.1:{app_port}:3000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--memory','512m','--pids-limit','128','-e','TRUST_PROXY_IPS='+gateway,'-e','RATE_LIMIT_MAX=8','-e','DOMAIN=keyoxide.test','-e','ENABLE_PUBLIC_PROOF_PROXY=true',args.image)
            containers.append(container)
            for _ in range(60):
                try:
                    docker('exec',container,'node','-e',"fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
                    return container
                except subprocess.CalledProcessError:time.sleep(.25)
            raise RuntimeError('App did not start')
        app=start_app()
        proxy=docker('run','-d','--name',name+'-proxy','--network','host','--read-only','--security-opt','no-new-privileges','--tmpfs','/var/cache/nginx:rw,size=16m','--tmpfs','/var/run:rw,size=1m','--tmpfs','/tmp:rw,size=1m','-v',str(directory/'site.conf')+':/etc/nginx/conf.d/default.conf:ro','-v',str(directory)+':/certs:ro',args.nginx_image)
        containers.append(proxy)
        base='https://127.0.0.1:'+str(https_port)
        context=ssl.create_default_context(cafile=str(directory/'tls.crt'))
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=context))
        def get(path,headers=None):
            try:
                response=opener.open(urllib.request.Request(base+path,headers={'Host':'keyoxide.test',**(headers or {})}),timeout=10)
            except urllib.error.HTTPError as error:response=error
            with response:return response.status,response.headers,response.read()
        for _ in range(60):
            try:
                assert get('/healthz')[0]==200;break
            except (OSError,AssertionError):time.sleep(.25)
        else:raise RuntimeError('HTTPS proxy did not start')
        docker('exec',proxy,'nginx','-t')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*unused):return None
        redirect_opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        try:redirect_opener.open('http://127.0.0.1:'+str(http_port)+'/util')
        except urllib.error.HTTPError as redirect:
            assert redirect.code==308 and redirect.headers['Location']=='https://keyoxide.test/util'
            redirect.close()
        else:raise AssertionError('HTTP did not redirect to HTTPS')
        status,headers,body=get('/healthz')
        health=json.loads(body)
        expected=inspect(app)['Config']['Labels']['org.opencontainers.image.revision']
        assert health['revision']==expected and expected
        assert headers['Strict-Transport-Security']=='max-age=31536000'
        assert headers['X-Content-Type-Options']=='nosniff'
        print('PASS trusted TLS, nginx configuration, security headers and exact release revision',flush=True)
        for path in ['/','/util','/static/main.js','/source.tar.gz']:
            assert get(path)[0]==200,path
        assert get('/api/3/profile/verify')[0]==403
        assert get('/api/3/get/http?url=https%3A%2F%2F127.0.0.1&format=text')[0]==400
        assert get('/api/3/get/dns?domain=localhost')[0]==400
        assert get('/api/3/get/telegram')[0]==501
        print('PASS ordinary pages/assets/source, restricted proof proxy and disabled legacy APIs',flush=True)
        statuses=[get('/',{'X-Forwarded-For':f'198.51.100.{n+1}','Forwarded':f'for=198.51.100.{n+1}'})[0] for n in range(12)]
        assert 429 in statuses and statuses[-1]==429
        assert get('/healthz')[0]==200
        # A real second loopback source IP must have its own quota. Forged headers
        # on the first client above must not create a new quota.
        result=docker('run','--rm','--network','host','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','-e','NODE_EXTRA_CA_CERTS=/cert/tls.crt','-v',str(directory/'tls.crt')+':/cert/tls.crt:ro','--entrypoint','node',args.image,'-e',f"require('https').get('https://127.0.0.1:{https_port}/',{{localAddress:'127.0.0.2'}},r=>{{console.log(r.statusCode);r.resume();process.exit(r.statusCode===200?0:1)}}).on('error',()=>process.exit(1))")
        assert result=='200'
        print('PASS spoofed forwarding headers cannot bypass quotas, independent client stays available, health remains available',flush=True)
        # Rehearse stop/start rollback mechanics with the same tested image.
        # The live predecessor is deliberately never accessed here.
        docker('stop','--timeout','12',app)
        assert inspect(app)['State']['ExitCode']==0
        assert get('/healthz')[0]==502
        docker('rm',app);containers.remove(app)
        app=start_app()
        assert get('/healthz')[0]==200
        print('PASS outage detection and recovery using the pinned image (local rollback rehearsal)',flush=True)
finally:
    for container in reversed(containers):
        try:docker('rm','-f',container)
        except subprocess.CalledProcessError:pass
    if network:
        try:docker('network','rm',network)
        except subprocess.CalledProcessError:pass
