#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Print a reviewable nginx config. Never modifies or reloads the host server."""
import argparse,re
from pathlib import Path

def render(domain,upstream,certificate,private_key,http_port=80,https_port=443,bind_address=""):
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',domain):raise ValueError('Invalid domain')
    if not re.fullmatch(r'(?:127\.0\.0\.1|[a-z][a-z0-9-]*):[0-9]{1,5}',upstream):raise ValueError('Use a loopback port or isolated rehearsal service name')
    if not 1<=int(upstream.rsplit(':',1)[1])<=65535:raise ValueError('Invalid upstream port')
    for port in [http_port,https_port]:
        if not 1<=port<=65535:raise ValueError('Invalid listener port')
    for path in [certificate,private_key]:
        if not re.fullmatch(r'/[a-zA-Z0-9_./-]+',path):raise ValueError('Invalid certificate path')
    if bind_address not in ['', '127.0.0.1']:raise ValueError('Invalid listener address')
    text=(Path(__file__).resolve().parents[1]/'deploy/nginx.conf.template').read_text()
    for name,value in {'DOMAIN':domain,'UPSTREAM':upstream,'CERTIFICATE':certificate,'PRIVATE_KEY':private_key,'HTTP_PORT':http_port,'HTTPS_PORT':https_port,'BIND':bind_address+':' if bind_address else ''}.items():
        text=text.replace('__'+name+'__',str(value))
    return text

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--domain',default='keyoxide.net')
    parser.add_argument('--upstream',default='127.0.0.1:3301')
    parser.add_argument('--certificate',required=True)
    parser.add_argument('--private-key',required=True)
    parser.add_argument('--bind-address',default='')
    parser.add_argument('--http-port',type=int,default=80)
    parser.add_argument('--https-port',type=int,default=443)
    print(render(**vars(parser.parse_args())))
