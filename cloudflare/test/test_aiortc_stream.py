import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aiortc_stream import Sender, TestPattern, configuration
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription


class ConfigurationTests(unittest.TestCase):
    def test_requires_https_and_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for url in ('http://example.test', 'https://user:pass@example.test'):
                (root / 'config.json').write_text(json.dumps({'url': url, 'token': 'test'}))
                with self.assertRaises(ValueError):
                    configuration(root)
            (root / 'config.json').write_text(json.dumps({'url': 'https://example.test', 'token': 'test'}))
            self.assertEqual(configuration(root), ('wss://example.test/api/live/source?mode=aiortc-test', 'test'))


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_pattern_is_live_video(self):
        track = TestPattern()
        try:
            a, b = await track.recv(), await track.recv()
            self.assertEqual((a.width, a.height), (640, 360))
            self.assertGreater(b.pts, a.pts)
            self.assertNotEqual(bytes(a.planes[0]), bytes(b.planes[0]))
        finally:
            track.stop()

    @patch("aioice.ice.get_host_addresses", return_value=["127.0.0.1"])
    async def test_real_peer_receives_video_and_sender_cleans_up(self, _addresses):
        sender = Sender()
        receiver = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        incoming = asyncio.get_running_loop().create_future()
        messages = []

        class Socket:
            async def send_json(self, value):
                messages.append(value)

        @receiver.on('track')
        def track_received(track):
            if not incoming.done():
                incoming.set_result(track)

        try:
            await sender.handle({'type': 'peer-ready'}, Socket())
            offer = messages[-1]
            self.assertNotIn('m=audio', offer['sdp'])
            await receiver.setRemoteDescription(RTCSessionDescription(**offer))
            await receiver.setLocalDescription(await receiver.createAnswer())
            await sender.handle({'type': 'answer', 'sdp': receiver.localDescription.sdp}, Socket())
            track = await asyncio.wait_for(incoming, 10)
            frame = await asyncio.wait_for(track.recv(), 15)
            self.assertEqual((frame.width, frame.height), (640, 360))
            source_track = sender.track
            old_peer = sender.peer
            await sender.handle({'type': 'peer-left'}, Socket())
            self.assertIsNone(sender.peer)
            self.assertEqual(source_track.readyState, 'ended')
            self.assertEqual(old_peer.connectionState, 'closed')
            await sender.handle({'type': 'peer-ready'}, Socket())
            self.assertIsNot(sender.peer, old_peer)
        finally:
            await sender.close()
            await receiver.close()


if __name__ == '__main__':
    unittest.main()
