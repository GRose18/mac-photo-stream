import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import json
import hashlib
import subprocess

spec=importlib.util.spec_from_file_location('uploader',Path(__file__).with_name('photo_upload.py'))
uploader=importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploader)

class ClientTests(unittest.TestCase):
    def test_receipt_requires_exact_identity_hash_and_true(self):
        item={'id':'example','sha256':'abc'}
        for body in ({}, {'stored':True,'id':'wrong','sha256':'abc'}, {'stored':True,'id':'example','sha256':'bad'}, {'stored':1,'id':'example','sha256':'abc'}):
            self.assertFalse(uploader.confirmed(200,body,item))
        self.assertTrue(uploader.confirmed(201,{'stored':True,**item},item))
        self.assertFalse(uploader.confirmed(503,{'stored':True,**item},item))

    def test_failed_upload_retains_queue_and_success_archives_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'pending'/'example';folder.mkdir(parents=True)
            data=b'\xff\xd8\xff\xd9';(folder/'upload.jpg').write_bytes(data)
            (folder/'original.jpg').write_bytes(data)
            item={'id':'example','sha256':hashlib.sha256(data).hexdigest(),'captured_at':'2026-09-29T00:00:00Z'}
            uploader.save_json(folder/'receipt.json',item)
            config={'token':'private-test-token','url':'https://example.com'}
            with patch.object(uploader.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'{}\n503')) as call:
                self.assertEqual(uploader.send(folder,config),503)
                self.assertTrue(folder.exists())
                self.assertNotIn(config['token'],' '.join(call.call_args.args[0]))
            response=json.dumps({'stored':True,**item}).encode()+b'\n201'
            with patch.object(uploader.subprocess,'run',return_value=subprocess.CompletedProcess([],0,response)):
                self.assertEqual(uploader.send(folder,config),201)
            self.assertFalse(folder.exists())
            self.assertEqual((root/'archive'/'example'/'original.jpg').read_bytes(),data)

if __name__=='__main__': unittest.main()
