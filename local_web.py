#!/usr/bin/env python3
"""Run the original game as a local WEB app. Python standard library only."""
import argparse
import hashlib
import http.server
import io
import json
from pathlib import Path
import re
import shutil
import socket
import tempfile
import threading
import urllib.request
import webbrowser
import zipfile

ROOT = Path(__file__).resolve().parent


def build(source, output):
    metadata = json.loads((source / 'upstream.json').read_text())
    actual = {p.relative_to(source / 'web').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (source / 'web').rglob('*') if p.is_file()}
    if actual != metadata['files']:
        raise ValueError('The original game files do not match upstream.json')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copytree(source / 'web', output, dirs_exist_ok=True)
    shutil.copytree(source / 'app', output / 'app', dirs_exist_ok=True)
    html = (output / 'index.html').read_text()
    html = re.sub(r'(<meta name="viewport" content=")[^"]*(">)',
                  r'\1width=device-width, initial-scale=1.0, viewport-fit=cover\2', html)
    html = html.replace('<body>', '<body class="duelApp">')
    html = html.replace('</head>', '<meta name="theme-color" content="#070f14">\n<link rel="manifest" href="./manifest.webmanifest">\n<link rel="apple-touch-icon" href="./app/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<link rel="stylesheet" href="./app/landscape.css">\n</head>')
    html = html.replace('</body>', '<script type="module" src="./app/mobile.js"></script>\n</body>')
    (output / 'index.html').write_text(html)
    manifest = dict(id='./', name='DUEL ARENA', short_name='DUEL ARENA', lang='ja', start_url='./',
                    scope='./', display='standalone', orientation='landscape',
                    background_color='#070f14', theme_color='#070f14',
                    icons=[dict(src=f'./app/icon-{size}.png', sizes=f'{size}x{size}', type='image/png', purpose='any') for size in (192, 512)])
    (output / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (output / 'version.json').write_text(json.dumps(dict(commit=metadata['commit'], webVersion=metadata['webVersion'])))
    files = sorted(p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file() and p.name != 'sw.js')
    revision = hashlib.sha256(''.join(hashlib.sha256((output / name).read_bytes()).hexdigest() for name in files).encode()).hexdigest()[:16]
    worker = (source / 'scripts/service-worker.template.js').read_text()
    worker = worker.replace('__VERSION__', metadata['commit'] + '-' + revision).replace('__FILES__', json.dumps(['./' + name for name in files]))
    (output / 'sw.js').write_text(worker)


class LocalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server, **kwargs):
        super().__init__(request, client_address, server, directory=str(server.game_directory), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def log_message(self, *args):
        pass

    def send_head(self):
        self.byte_range = None
        path = Path(self.translate_path(self.path))
        request = self.headers.get('Range', '')
        if not request or not path.is_file():
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', request)
        size = path.stat().st_size
        if not match or not any(match.groups()):
            return super().send_head()
        a, b = match.groups()
        start = int(a) if a else max(0, size - int(b))
        end = min(int(b), size - 1) if a and b else size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        file = path.open('rb')
        file.seek(start)
        self.byte_range = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.byte_range))
        self.end_headers()
        return file

    def copyfile(self, source, output):
        if self.byte_range is None:
            return super().copyfile(source, output)
        remaining = self.byte_range
        while remaining:
            data = source.read(min(65536, remaining))
            if not data:
                break
            output.write(data)
            remaining -= len(data)


def updater(server, stop):
    current = (ROOT / '.local/current-commit').read_text().strip() if (ROOT / '.local/current-commit').exists() else ''
    while not stop.wait(120):
        try:
            request = urllib.request.Request('https://api.github.com/repos/nagisa793/card_game_app/commits/main', headers={'User-Agent': 'DUEL-ARENA-local'})
            with urllib.request.urlopen(request, timeout=10) as response:
                commit = json.load(response)['sha']
            if commit == current:
                continue
            with urllib.request.urlopen(f'https://github.com/nagisa793/card_game_app/archive/{commit}.zip', timeout=60) as response:
                archive = zipfile.ZipFile(io.BytesIO(response.read()))
            with tempfile.TemporaryDirectory(dir=ROOT / '.local') as staging:
                for name in archive.namelist():
                    if Path(name).is_absolute() or '..' in Path(name).parts:
                        raise ValueError('Invalid source archive path')
                archive.extractall(staging)
                source = next(Path(staging).iterdir())
                output = ROOT / '.local' / commit
                build(source, output)
                server.game_directory = output
                (ROOT / '.local/current-commit').write_text(commit)
                current = commit
                print('更新を取り込みました。次にページを開くと最新版で遊べます。', flush=True)
        except Exception:
            # The locally stored game remains playable without network access.
            pass


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--port', type=int, default=8766)
    args.add_argument('--host', default='0.0.0.0')
    args.add_argument('--no-browser', action='store_true')
    args.add_argument('--no-update', action='store_true')
    options = args.parse_args()
    local = ROOT / '.local'
    local.mkdir(exist_ok=True)
    output = local / 'initial'
    build(ROOT, output)
    previous = local / 'current-commit'
    if previous.exists() and (local / previous.read_text().strip() / 'index.html').exists():
        output = local / previous.read_text().strip()
    server = http.server.ThreadingHTTPServer((options.host, options.port), LocalHandler)
    server.game_directory = output
    url = f'http://localhost:{options.port}/'
    print(f'\nDUEL ARENA ローカルWEBアプリ\nMacで開くURL：{url}', flush=True)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('192.0.2.1', 80))
            address = sock.getsockname()[0]
        print(f'iPhoneで開くURL：http://{address}:{options.port}/\n同じWi-Fiに接続してスマホを横向きにしてください。', flush=True)
    except OSError:
        print('iPhoneの接続にはMacと同じWi-Fiが必要です。', flush=True)
    print('このウィンドウを閉じるとローカルサーバーは停止します。\n', flush=True)
    stop = threading.Event()
    if not options.no_update:
        threading.Thread(target=updater, args=(server, stop), daemon=True).start()
    if not options.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
