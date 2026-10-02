#!/usr/bin/env python3
"""Install or remove the visible per-user Photo Stream login schedule."""
import argparse
import os
from pathlib import Path
import plistlib
import subprocess
import sys

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--remove',action='store_true')
args=p.parse_args()
label='com.user.photo-stream-cloudflare'
root=Path.home()/'Pictures'/'PhotoStream'
plist=Path.home()/'Library'/'LaunchAgents'/(label+'.plist')
domain='gui/'+str(os.getuid())
if args.remove:
    subprocess.run(['launchctl','bootout',domain+'/'+label],check=False)
    plist.unlink(missing_ok=True)
    print('Automatic capture stopped. All local photos retained.')
else:
    if not (root/'config.json').exists():
        raise SystemExit('Run python3 photo_upload.py --setup first.')
    if plist.exists():
        raise SystemExit('Schedule already exists. Use --remove before reinstalling.')
    plist.parent.mkdir(parents=True,exist_ok=True)
    data={'Label':label,'ProgramArguments':[sys.executable,str(Path(__file__).with_name('photo_upload.py').resolve())],
          'RunAtLoad':True,'StartInterval':60,'LimitLoadToSessionType':'Aqua',
          'EnvironmentVariables':{'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},
          'StandardOutPath':str(root/'schedule.log'),'StandardErrorPath':str(root/'schedule-error.log')}
    with plist.open('wb') as f: plistlib.dump(data,f)
    subprocess.run(['launchctl','bootstrap',domain,str(plist)],check=True)
    print('Photo Stream scheduled every minute while this user is logged in and the Mac is awake.')
    print('Normal camera permissions and camera indicator remain enabled. Photos are in '+str(root))
    print('Stop with: python3 '+str(Path(__file__).resolve())+' --remove')
