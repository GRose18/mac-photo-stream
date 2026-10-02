import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('control', Path(__file__).parents[1] / 'sclshi_control.py')
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)

class ControlTests(unittest.TestCase):
    def test_stale_app_cannot_queue_capture(self):
        with tempfile.TemporaryDirectory() as d, patch.object(control, 'ROOT', Path(d)):
            (Path(d) / 'video-ready.json').write_text(json.dumps({'at': time.time()-60}))
            with self.assertRaisesRegex(RuntimeError, 'not responding'):
                control.main()
            self.assertFalse((Path(d) / 'video-request.json').exists())

    def test_existing_request_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d, patch.object(control, 'ROOT', Path(d)):
            root=Path(d)
            (root/'video-ready.json').write_text(json.dumps({'at':time.time()}))
            (root/'video-request.json').write_text('existing')
            with self.assertRaisesRegex(RuntimeError,'already pending'):
                control.main()
            self.assertEqual((root/'video-request.json').read_text(),'existing')

    def test_same_user_request_and_matching_result(self):
        with tempfile.TemporaryDirectory() as d, patch.object(control,'ROOT',Path(d)):
            root=Path(d)
            (root/'video-ready.json').write_text(json.dumps({'at':time.time()}))
            observed=[]
            def app():
                for _ in range(100):
                    if (root/'video-request.json').exists():
                        request=json.loads((root/'video-request.json').read_text())
                        observed.append(request)
                        temp=root/'result.tmp'
                        temp.write_text(json.dumps({'id':request['id'],'done':True,'ok':True,'message':'Video uploaded; local backup retained'}))
                        temp.replace(root/'video-result.json')
                        return
                    time.sleep(.02)
            thread=threading.Thread(target=app);thread.start()
            self.assertEqual(control.main(),0);thread.join()
            self.assertEqual(observed[0]['operation'],'record10')
            self.assertEqual((root/'video-request.json').stat().st_mode & 0o777,0o600)

if __name__=='__main__':unittest.main()
