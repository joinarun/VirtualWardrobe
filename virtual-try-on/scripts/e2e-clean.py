#!/usr/bin/env python3
"""Run the standard E2E path against a disposable isolated local Compose project."""
from pathlib import Path
import json, os, secrets, shutil, socket, subprocess, sys, time

os.umask(0o077)
root=Path(__file__).resolve().parents[1]
project=f"virtualwardrobe-e2e-{time.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
artifacts=root/'work'/project
artifacts.mkdir(parents=True,mode=0o700)
bootstrap=artifacts/'bootstrap'
state=artifacts/'state'
media=artifacts/'media'
demo=artifacts/'demo'
for directory in (bootstrap,state,media,demo): directory.mkdir(mode=0o700)
source=artifacts/'source'
source.mkdir(mode=0o700)
ignored=shutil.ignore_patterns('node_modules','target','work','.env','.env.*','demo-credentials*','__pycache__','*.pyc','test-results','playwright-report','dist')
for item in ('apps','services','scripts'):
    shutil.copytree(root/item,source/item,ignore=ignored)
for item in ('Makefile','compose.yaml'):
    shutil.copy2(root/item,source/item)


def port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0))
        return listener.getsockname()[1]

# Public Maven artifacts may be shared; no application database, media or credential state is shared.
cache_name=None
try:
    config=json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=root,text=True,env={**os.environ,'POSTGRES_PASSWORD':secrets.token_hex(24)}))
    candidate=config.get('volumes',{}).get('maven-cache',{}).get('name')
    if candidate and subprocess.run(['docker','volume','inspect',candidate],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
        cache_name=candidate
except (subprocess.SubprocessError,ValueError):
    pass

override={'services':{service:{'volumes':[{'type':'bind','source':str(media),'target':'/workspace/work/local-data'}]} for service in ('api','worker')}}
if cache_name: override['volumes']={'maven-cache':{'external':True,'name':cache_name}}
override_file=artifacts/'compose-isolated.json'
override_file.write_text(json.dumps(override,indent=2))
ports=set()
while len(ports)<3: ports.add(port())
api_port,web_port,db_port=sorted(ports)
environment=dict(os.environ)
environment.update({'COMPOSE_PROJECT_NAME':project,'COMPOSE_FILE':str(source/'compose.yaml')+os.pathsep+str(override_file),'POSTGRES_DB':'virtualwardrobe','POSTGRES_USER':'virtualwardrobe','POSTGRES_PASSWORD':secrets.token_hex(24),'API_PORT':str(api_port),'WEB_PORT':str(web_port),'DB_PORT':str(db_port),'BOOTSTRAP_OUTPUT_DIRECTORY':str(bootstrap),'E2E_BOOTSTRAP_FILE':str(bootstrap/'bootstrap-credentials.txt'),'E2E_STATE_DIRECTORY':str(state),'E2E_DEMO_DATASET':'virtualwardrobe-demo-v1','E2E_DEMO_CREDENTIALS_FILE':str(demo/'demo-credentials-virtualwardrobe-demo-v1.json')})
log=artifacts/'verification.log'
result=1
with log.open('w') as output:
    try:
        subprocess.run(['make','dev'],cwd=source,env=environment,stdout=output,stderr=subprocess.STDOUT,check=True)
        subprocess.run(['make','e2e'],cwd=source,env=environment,stdout=output,stderr=subprocess.STDOUT,check=True)
        result=0
    except subprocess.CalledProcessError as error:
        result=error.returncode or 1
    finally:
        cleanup=subprocess.run(['docker','compose','down','--volumes','--remove-orphans'],cwd=source,env=environment,stdout=output,stderr=subprocess.STDOUT)
        if cleanup.returncode and result==0: result=cleanup.returncode
metadata={'project':project,'isolated':True,'applicationDataShared':False,'sharedBuildTargetUsed':False,'ports':{'api':api_port,'web':web_port,'database':db_port},'exitCode':result,'log':str(log)}
(artifacts/'result.json').write_text(json.dumps(metadata,indent=2))
print(f"Isolated E2E exit code: {result}. Protected evidence: {artifacts}")
sys.exit(result)
