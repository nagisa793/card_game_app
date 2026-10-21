#!/usr/bin/env python3
"""Serve DUEL ARENA at localhost; no native game UI and no external assets."""
import argparse
import hashlib
import http.server
import io
import json
from pathlib import Path
import re
import shutil
import socket
import ssl
import sys
import tempfile
import threading
import urllib.request
import webbrowser
import zipfile

ROOT = Path(sys.executable).resolve().parents[2] if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
SERVICE = 'duel-arena-local'
PORT = 8766


def inventory(directory):
    files = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Unexpected symlink: {path.name}')
        if path.is_file():
            files[path.relative_to(directory).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build(source, output):
    metadata = json.loads((source / 'upstream.json').read_text(encoding='utf-8'))
    if inventory(source / 'web') != metadata['files']:
        raise ValueError('The original game files do not match upstream.json')
    html = (source / 'web/index.html').read_text(encoding='utf-8')
    if not all(part in html for part in ('<meta name="viewport"', '<body>', '</head>', '</body>')):
        raise ValueError('Review APP injection: the original entry point changed')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copytree(source / 'web', output, dirs_exist_ok=True)
    shutil.copytree(source / 'app', output / 'app')
    html = re.sub(r'(<meta name="viewport" content=")[^"]*(">)',
                  r'\1width=device-width, initial-scale=1.0, viewport-fit=cover\2', html)
    html = html.replace('<body>', '<body class="duelApp">')
    html = html.replace('./src/legacy.css', './app/runtime/legacy.css').replace('./src/interface.css', './app/runtime/interface.css')
    html = re.sub(r'<script src="\./src/engine\.js[^\"]*"></script>\s*<script type="module" src="\./src/boot\.js[^\"]*"></script>',
                  '<script type="module" src="./app/render-bootstrap.js"></script>', html)
    html = html.replace('<a class="brand" href="./index.html">', '<a class="brand" href="./index.html" target="_top">')
    html = html.replace('</head>', '<meta name="theme-color" content="#070f14">\n<link rel="manifest" href="./manifest.webmanifest">\n<link rel="apple-touch-icon" href="./app/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<link rel="stylesheet" href="./app/landscape.css">\n</head>')
    html = html.replace('</body>', '<script type="module" src="./app/mobile.js"></script>\n</body>')
    (output / 'game.html').write_text(html, encoding='utf-8')
    shutil.copyfile(source / 'app/host.html', output / 'index.html')
    manifest = dict(id='./', name='DUEL ARENA', short_name='DUEL ARENA', lang='ja', start_url='./',
                    scope='./', display='standalone', orientation='landscape',
                    background_color='#070f14', theme_color='#070f14',
                    icons=[dict(src=f'./app/icon-{size}.png', sizes=f'{size}x{size}', type='image/png', purpose='any') for size in (192, 512)])
    write_json(output / 'manifest.webmanifest', manifest)
    write_json(output / 'version.json', dict(commit=metadata['commit'], webVersion=metadata['webVersion']))
    built_files = inventory(output)
    revision = hashlib.sha256(json.dumps(built_files, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()[:16]
    worker = (source / 'scripts/service-worker.template.js').read_text(encoding='utf-8')
    worker = worker.replace('__VERSION__', metadata['commit'] + '-' + revision).replace('__FILES__', json.dumps(['./' + name for name in built_files if name != 'assets/NotoSansJP.ttf'], ensure_ascii=False, separators=(',', ':')))
    (output / 'sw.js').write_text(worker, encoding='utf-8')


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
        if self.path.split('?', 1)[0] == '/__duel__/status':
            version = json.loads((self.server.game_directory / 'version.json').read_text(encoding='utf-8'))
            data = json.dumps(dict(service=SERVICE, **version, update=getattr(self.server, 'update_status', 'idle'))).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return io.BytesIO(data)
        path = Path(self.translate_path(self.path))
        requested = self.headers.get('Range', '')
        if not requested or not path.is_file():
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
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


def request_bytes(url):
    try:
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={'User-Agent': 'DUEL-ARENA-local'})
    with urllib.request.urlopen(request, timeout=30, context=context) as response:
        return response.read()


def install_update(root, commit, archive_bytes):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Invalid APP commit')
    local = root / '.local'
    local.mkdir(exist_ok=True)
    output = local / 'releases' / commit
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive, tempfile.TemporaryDirectory(dir=local) as staging:
        for info in archive.infolist():
            name = Path(info.filename)
            mode = info.external_attr >> 16
            if name.is_absolute() or '..' in name.parts or '\\' in info.filename or (mode & 0o170000) == 0o120000:
                raise ValueError('Invalid source archive path')
        archive.extractall(staging)
        roots = list(Path(staging).iterdir())
        if len(roots) != 1 or not roots[0].is_dir():
            raise ValueError('Invalid APP source archive')
        if not (output / 'index.html').exists():
            with tempfile.TemporaryDirectory(dir=local) as compiled:
                built = Path(compiled) / 'game'
                build(roots[0], built)
                output.parent.mkdir(exist_ok=True)
                built.replace(output)
    marker = local / 'current.json.new'
    write_json(marker, dict(commit=commit))
    marker.replace(local / 'current.json')
    return output


def updater(server, stop, root=ROOT, interval=120, fetch=request_bytes):
    marker = root / '.local/current.json'
    try:
        current = json.loads(marker.read_text())['commit']
    except (OSError, ValueError, KeyError):
        current = ''
    if not current and (root / 'build-info.json').exists():
        current = json.loads((root / 'build-info.json').read_text())['appCommit']
    while not stop.is_set():
        try:
            server.update_status = 'checking'
            commit = json.loads(fetch('https://api.github.com/repos/nagisa793/card_game_app/commits/main'))['sha']
            if not re.fullmatch('[0-9a-f]{40}', commit):
                raise ValueError('Invalid APP commit')
            if commit != current:
                server.update_status = 'downloading'
                output = install_update(root, commit, fetch(f'https://github.com/nagisa793/card_game_app/archive/{commit}.zip'))
                server.game_directory = output
                current = commit
                print('更新を保存しました。対戦中の画面はそのままで、次に開くと最新版になります。', flush=True)
            server.update_status = 'current'
        except Exception:
            server.update_status = 'offline'
            # Keep serving the complete installed game; retry when the connection returns.
        if stop.wait(interval):
            break


def installed_game(root):
    local = root / '.local'
    local.mkdir(exist_ok=True)
    for marker in (local / 'current.json', local / 'current-commit'):
        try:
            commit = json.loads(marker.read_text())['commit'] if marker.suffix == '.json' else marker.read_text().strip()
            if re.fullmatch('[0-9a-f]{40}', commit):
                for output in (local / 'releases' / commit, local / commit):
                    if (output / 'index.html').exists():
                        return output
        except (OSError, ValueError, KeyError):
            pass
    source_files = {**inventory(root / 'web'), **{'app/' + key: value for key, value in inventory(root / 'app').items()}}
    for name in ('local_web.py', 'scripts/service-worker.template.js', 'upstream.json'):
        source_files[name] = hashlib.sha256((root / name).read_bytes()).hexdigest()
    revision = hashlib.sha256(json.dumps(source_files, sort_keys=True).encode()).hexdigest()[:20]
    output = local / 'releases' / ('local-' + revision)
    if not (output / 'index.html').exists():
        build(root, output)
    return output


def existing_server(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/__duel__/status', timeout=1) as response:
            return json.load(response).get('service') == SERVICE
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--no-update', action='store_true')
    options = parser.parse_args()
    root = options.root.resolve()
    url = f'http://localhost:{options.port}/'
    if existing_server(options.port):
        print(f'起動済みのDUEL ARENAを開きます：{url}', flush=True)
        if not options.no_browser:
            webbrowser.open(url)
        return
    output = installed_game(root)
    try:
        server = http.server.ThreadingHTTPServer((options.host, options.port), LocalHandler)
    except OSError as error:
        raise RuntimeError(f'ポート{options.port}を使用中です。他のサーバーを終了してから起動してください。') from error
    server.daemon_threads = True
    server.game_directory = output
    server.update_status = 'disabled' if options.no_update else 'checking'
    print(f'\nDUEL ARENA\n起動しました：{url}\nこのウィンドウを開いている間、ゲームを利用できます。\n', flush=True)
    if options.host == '0.0.0.0':
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(('192.0.2.1', 80))
                address = sock.getsockname()[0]
            print(f'同じWi-Fiのスマホで開くURL：http://{address}:{options.port}/', flush=True)
        except OSError:
            pass
    stop = threading.Event()
    if not options.no_update:
        threading.Thread(target=updater, args=(server, stop, root), daemon=True).start()
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
