"""Exercise the real localhost launcher, source or bundled, from a clean folder."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request


def check_launch(command, port):
    process = subprocess.Popen(command + ['--port', str(port), '--no-browser', '--no-update'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    base = f'http://localhost:{port}'
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError('Server exited before starting: ' + ''.join(process.communicate()))
            try:
                with urllib.request.urlopen(base + '/__duel__/status', timeout=1) as response:
                    status = json.load(response)
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Server did not start at localhost')
        assert status['service'] == 'duel-arena-local'
        with urllib.request.urlopen(base + '/', timeout=5) as response:
            html = response.read().decode()
            assert response.status == 200 and 'id="gameViewport"' in html and './game.html' in html
        with urllib.request.urlopen(base + '/game.html', timeout=5) as response:
            html = response.read().decode()
            assert response.status == 200 and 'class="duelApp"' in html
            assert './app/mobile.js' in html and 'vendor/three.module.js' in html
        for path in ('src/engine.js', 'app/landscape.css', 'app/mobile.js', 'assets/card-frames/character.webp'):
            with urllib.request.urlopen(base + '/' + path, timeout=5) as response:
                assert response.status == 200 and len(response.read()) > 0, path
        audio = urllib.request.Request(base + '/assets/audio/battle-user-loop.m4a', headers={'Range': 'bytes=0-1023'})
        with urllib.request.urlopen(audio, timeout=5) as response:
            assert response.status == 206 and len(response.read()) == 1024
        # Opening the launch file twice should reuse the running game.
        again = subprocess.run(command + ['--port', str(port), '--no-browser', '--no-update'], capture_output=True, text=True, timeout=10)
        assert again.returncode == 0 and '起動済み' in again.stdout, again.stderr
        print(f'PASS: localhost startup, original assets, BGM ranges, duplicate launch (WEB v{status["webVersion"]})')
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
        out, err = process.communicate(timeout=10)
        if err:
            raise RuntimeError(err)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    command = ['bash', str(args.bundle / 'Start_card_game.command')] if args.bundle else [sys.executable, str(root / 'local_web.py')]
    check_launch(command, args.port)
