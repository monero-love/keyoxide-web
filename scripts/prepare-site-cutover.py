#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Render a narrow nginx routing diff for the inspected keyoxide.net topology."""
import argparse,re
from pathlib import Path

def cutover(source):
    if 'keyoxide_static_web' in source or 'keyoxide_static_onion' in source:raise ValueError('Already a candidate config')
    # Fail closed on topology drift. Never replace the whole shared nginx config.
    for old in [3000,3001]:
        if source.count(f'location / {{ proxy_pass http://127.0.0.1:{old}; }}')!=1:raise ValueError('Unexpected application location layout')
        if f'location /api/' not in source:raise ValueError('Missing existing proof API routing')
    for name,old,new in [('web',3000,3300),('onion',3001,3301)]:
        original=f'location / {{ proxy_pass http://127.0.0.1:{old}; }}'
        # Existing account-backed verifiers and signing actor remain on the old
        # service. Legacy signature pages retain their matching perf1 assets.
        locations='\n'.join(f'    location {selector} {{ proxy_pass http://127.0.0.1:{old}; }}' for selector in ['= /sig','= /users/keyoxide','= /.well-known/webfinger','^~ /static/source/'])
        locations+=f'\n    location = /onion-proof/check {{ proxy_pass http://127.0.0.1:{new}; proxy_connect_timeout 3s; proxy_read_timeout 30s; }}'
        locations+=f'\n    location / {{ proxy_pass http://127.0.0.1:{new}; proxy_connect_timeout 3s; proxy_read_timeout 15s; }}'
        source=source.replace(original,locations.strip())
        pattern=r'(location ~ \^/static/\[\^/\]\+\\\.\(js\|css\)\$ \{)([^{}]*proxy_pass http://127\.0\.0\.1:'+str(old)+r';[^{}]*)(\})'
        def assets(match):
            body=match[2].replace(f'proxy_pass http://127.0.0.1:{old};',f'proxy_pass http://127.0.0.1:$keyoxide_static_{name};')
            setup=f'\n        set $keyoxide_static_{name} {new};\n        if ($arg_v = perf1) {{ set $keyoxide_static_{name} {old}; }}'
            return match[1]+setup+body+match[3]
        source,count=re.subn(pattern,assets,source)
        if count!=1:raise ValueError('Unexpected static asset routing layout')
    if source.count('proxy_set_header Host $host;')!=2:raise ValueError('Unexpected forwarding-header layout')
    if 'proxy_set_header X-Forwarded-For' in source:raise ValueError('Review existing forwarding-header policy before cutover')
    source=source.replace('proxy_set_header Host $host;','proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-For $remote_addr;\n    proxy_set_header Forwarded "";')
    return source

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('existing_config',type=Path)
    args=parser.parse_args()
    print(cutover(args.existing_config.read_text()))
