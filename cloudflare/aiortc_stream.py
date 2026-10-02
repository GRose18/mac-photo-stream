#!/usr/bin/env python3
"""Sclshi WebRTC transport test. Generates video; never captures a display or camera."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import signal
import ssl
from urllib.parse import urlsplit, urlunsplit

import aiohttp
import certifi
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame


class TestPattern(VideoStreamTrack):
    async def recv(self):
        pts, time_base = await self.next_timestamp()
        frame = VideoFrame(640, 360, 'yuv420p')
        # Moving bright band makes it easy to distinguish live video from a frozen image.
        offset = (pts // 3000 * 4) % 640
        for index, plane in enumerate(frame.planes):
            if index == 0:
                row = bytes(220 if offset <= x < offset + 40 else 50 + (x // 80) * 20
                            for x in range(plane.line_size))
                plane.update(row * plane.height)
            else:
                plane.update(bytes([90 if index == 1 else 170]) * plane.buffer_size)
        frame.pts, frame.time_base = pts, time_base
        return frame


def configuration(root):
    data = json.loads((root / 'config.json').read_text())
    url = urlsplit(data['url'])
    token = data['token']
    if url.scheme != 'https' or not url.hostname or url.username or url.password or not isinstance(token, str) or not token:
        raise ValueError('Invalid saved configuration')
    return urlunsplit(('wss', url.netloc, '/api/live/source', 'mode=aiortc-test', '')), token


class Sender:
    def __init__(self):
        self.peer = None
        self.track = None

    async def close(self):
        peer, self.peer = self.peer, None
        if self.track:
            self.track.stop()
            self.track = None
        if peer:
            await peer.close()

    async def handle(self, message, socket):
        kind = message.get('type')
        if kind == 'peer-left':
            await self.close()
        elif kind == 'peer-ready':
            await self.close()
            self.peer = peer = RTCPeerConnection(RTCConfiguration(iceServers=[]))
            self.track = TestPattern()
            peer.addTransceiver(self.track, direction='sendonly')
            await asyncio.wait_for(peer.setLocalDescription(await peer.createOffer()), 20)
            if len(peer.localDescription.sdp) > 18000:
                raise ValueError('Offer exceeds signaling limit')
            await socket.send_json({'type': 'offer', 'sdp': peer.localDescription.sdp})
            print('Test video offered to viewer.', flush=True)
        elif kind == 'answer' and self.peer:
            sdp = message.get('sdp')
            if not isinstance(sdp, str) or len(sdp) > 18000:
                raise ValueError('Invalid answer')
            await self.peer.setRemoteDescription(RTCSessionDescription(sdp=sdp, type='answer'))


async def serve(root):
    endpoint, token = configuration(root)
    sender = Sender()
    delay = 60
    timeout = aiohttp.ClientTimeout(total=None, sock_connect=15)
    connector = aiohttp.TCPConnector(ssl=ssl.create_default_context(cafile=certifi.where()))
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        try:
            while True:
                try:
                    async with session.ws_connect(endpoint, headers={'Authorization': 'Bearer ' + token},
                                                  heartbeat=30, max_msg_size=20000) as socket:
                        print('aiortc ready · synthetic test video only.', flush=True)
                        async for message in socket:
                            if message.type == aiohttp.WSMsgType.TEXT:
                                value = json.loads(message.data)
                                if not isinstance(value, dict):
                                    raise ValueError('Invalid signal')
                                await sender.handle(value, socket)
                                if value.get('type') == 'answer':
                                    delay = 60
                            elif message.type == aiohttp.WSMsgType.ERROR:
                                break
                        if socket.close_code == 1008:
                            print('Signaling rejected; stopping. Check configuration.', flush=True)
                            return
                except aiohttp.ClientConnectorCertificateError:
                    print("TLS certificate verification failed; update the aiortc runtime certificate bundle.", flush=True)
                    return
                except aiohttp.WSServerHandshakeError as exc:
                    if exc.status in (401, 403):
                        print('Authorization failed; check saved configuration.', flush=True)
                        return
                    print(f'Signaling unavailable (HTTP {exc.status}); retrying.', flush=True)
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, OSError) as exc:
                    # Log the exception class only; messages may contain credentials or SDP.
                    print(f"Connection interrupted ({type(exc).__name__}); retrying.", flush=True)
                finally:
                    await sender.close()
                await asyncio.sleep(delay)
                delay = min(delay * 2, 300)
        finally:
            await sender.close()


async def run(root, parent_pid):
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    async def watch_parent():
        while not stop.is_set():
            if parent_pid and os.getppid() != parent_pid:
                stop.set()
                return
            await asyncio.sleep(1)

    service = asyncio.create_task(serve(root))
    watcher = asyncio.create_task(watch_parent())
    stopped = asyncio.create_task(stop.wait())
    try:
        await asyncio.wait([service, stopped], return_when=asyncio.FIRST_COMPLETED)
        if service.done():
            await service
    finally:
        for task in (service, watcher, stopped):
            task.cancel()
        await asyncio.gather(service, watcher, stopped, return_exceptions=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / 'Pictures/PhotoStream')
    parser.add_argument('--parent-pid', type=int, default=0)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        asyncio.run(run(args.root, args.parent_pid))
    except (OSError, ValueError, KeyError):
        print('Unable to start aiortc; check saved Sclshi configuration.', flush=True)
        raise SystemExit(2)
