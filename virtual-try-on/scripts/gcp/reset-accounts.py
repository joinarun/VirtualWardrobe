#!/usr/bin/env python3
"""Owner-authorized four-account demo reset. Default is an offline plan."""
import argparse,importlib.util,json,os,secrets,subprocess,sys,uuid,zipfile
from pathlib import Path
from deploy import Deployment,ROOT

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True,choices=['virtualtryon-511016']);p.add_argument('--apply',action='store_true');p.add_argument('--rehearse',action='store_true');a=p.parse_args()
 if not (a.apply or a.rehearse):
  print(json.dumps({'mode':'PLAN','project':a.project,'activeAccountsAfter':4,'revokeAllOldSessions':True,'catalog':'preserved','oldAccounts':'anonymized and disabled; audit stubs retained','oldPrivatePhotos':'access removed; deletion queued','modelCalls':0}));return
 if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT):raise RuntimeError('Commit source first')
 work=ROOT/'work/gcp';suffix='rehearsal' if a.rehearse else '20261031';out=work/f'fresh-accounts-{suffix}.json';receipt=work/f'fresh-accounts-{suffix}-receipt.json'
 if out.exists() or receipt.exists():raise RuntimeError('Existing reset outputs preserved; no blind rerun')
 spec=importlib.util.spec_from_file_location('cloud_demo',ROOT/'scripts/gcp/cloud-demo.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 d=Deployment(json.loads((ROOT/'infra/gcp-demo.json').read_text()));adc=m.existing_user_adc(dict(os.environ))
 users=[]
 for role,kind,name,identifier in [('SUPER_ADMIN','WORKFORCE','Super Admin','super@wardrobe.test'),('STORE_ADMIN','WORKFORCE','Store Admin','admin@wardrobe.test'),('STAFF','WORKFORCE','Store Staff','staff@wardrobe.test'),('CUSTOMER','CUSTOMER','Demo Customer','+919000000001')]:
  users.append(dict(id=str(uuid.uuid4()),role=role,kind=kind,name=name,identifier=identifier,password='Vw-'+secrets.token_urlsafe(18)+'9a!'))
 data=dict(project=a.project,origin='https://virtualwardrobe-511016.web.app',users=users)
 def private(path,text):
  fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
 private(out,json.dumps(data,indent=2)+'\n')
 runtime=work/'reset-accounts-runtime';runtime.mkdir(mode=0o700,exist_ok=True)
 with zipfile.ZipFile(ROOT/'services/backend/target/backend-0.0.1-SNAPSHOT.jar') as jar:
  for name in jar.namelist():
   if name.startswith('BOOT-INF/lib/') and name.endswith('.jar'):
    target=runtime/Path(name).name
    if not target.exists():target.write_bytes(jar.read(name))
 cp=os.pathsep.join(str(x) for x in runtime.glob('*.jar'))
 subprocess.run([str(m.DEFAULT_JAVA_HOME/'bin/javac'),'-cp',cp,'-d',str(runtime),str(ROOT/'scripts/gcp/ResetAccounts.java')],check=True,capture_output=True)
 pw=d.value('secrets','versions','access','latest','--secret',d.database_secret);env=m.child_environment(d,adc,pw);env['VW_RESET_CREDENTIALS']=str(out);env['VW_RESET_ROLLBACK']='true' if a.rehearse else 'false'
 r=subprocess.run([str(m.DEFAULT_JAVA_HOME/'bin/java'),'-cp',cp+os.pathsep+str(runtime),'ResetAccounts'],env=env,capture_output=True,text=True,timeout=180)
 if r.returncode or not r.stdout.strip().startswith('RESET_OK '):raise RuntimeError('Reset failed; raw diagnostics withheld; pending credentials preserved for review')
 private(receipt,json.dumps({'status':'PASS','source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'result':r.stdout.strip(),'newActiveAccounts':4,'rehearsalRolledBack':a.rehearse,'modelCalls':0},indent=2)+'\n')
 text='VirtualWardrobe fresh demo accounts\nhttps://virtualwardrobe-511016.web.app\n\nStaff sign-in: /staff/login\nCustomer sign-in: /account/login\n\n'
 for u in users:text+=f"{u['role']}\nUsername: {u['identifier']}\nPassword: {u['password']}\n\n"
 text+='All previous logins and sessions have been revoked. Customer phone is demo-only and unverified.\n'
 private(out.with_suffix('.txt'),text)
 print(json.dumps({'status':'PASS','activeAccounts':4,'credentialsFile':str(out.with_suffix('.txt')),'modelCalls':0}))
if __name__=='__main__':
 try:main()
 except Exception:print('Account reset stopped. Private pending outputs preserved; no secrets or raw diagnostics printed.',file=sys.stderr);sys.exit(1)
