import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock
from types import SimpleNamespace
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_web', ROOT / 'local_web.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalWebTest(unittest.TestCase):
    def test_local_build_preserves_all_original_assets_and_browser_interface(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            module.build(ROOT, output)
            expected = json.loads((ROOT / 'upstream.json').read_text())['files']
            for name, digest in expected.items():
                if name != 'index.html':
                    self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest, name)
            self.assertEqual(module.inventory(output), module.inventory(ROOT / 'www'))
            self.assertIn('landscape', (output / 'manifest.webmanifest').read_text())

    def test_local_http_serves_media_ranges_required_by_iphone(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'track.m4a').write_bytes(b'0123456789')
            server = module.http.server.ThreadingHTTPServer(('127.0.0.1', 0), module.LocalHandler)
            server.game_directory = root
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f'http://127.0.0.1:{server.server_port}/track.m4a'
                for requested, result in [('bytes=2-4', b'234'), ('bytes=-3', b'789'), ('bytes=6-', b'6789')]:
                    request = urllib.request.Request(url, headers={'Range': requested})
                    with urllib.request.urlopen(request) as response:
                        self.assertEqual(response.status, 206)
                        self.assertEqual(response.read(), result)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=99-'}))
                self.assertEqual(error.exception.code, 416)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def source_fixture(self, root, text='original'):
        (root / 'web').mkdir()
        (root / 'app').mkdir()
        (root / 'scripts').mkdir()
        (root / 'web/index.html').write_text('<html><head><meta name="viewport" content="width=device-width"></head><body>DUEL ARENA</body></html>')
        (root / 'web/track.m4a').write_bytes(b'original audio')
        (root / 'app/custom.css').write_text(text)
        (root / 'app/host.html').write_text((ROOT / 'app/host.html').read_text())
        (root / 'scripts/service-worker.template.js').write_text((ROOT / 'scripts/service-worker.template.js').read_text())
        (root / 'upstream.json').write_text(json.dumps(dict(commit='a' * 40, webVersion=102, files=module.inventory(root / 'web'))))
        (root / 'local_web.py').write_text('local server')

    def archive_fixture(self, source, extra=None):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            for path in source.rglob('*'):
                if path.is_file():
                    archive.write(path, 'card_game_app-' + 'b' * 40 + '/' + path.relative_to(source).as_posix())
            if extra:
                archive.writestr(extra, 'unexpected')
        return data.getvalue()

    def test_update_is_atomic_and_keeps_originals_and_latest_offline_on_restart(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as downloaded:
            root, source = Path(local), Path(downloaded)
            self.source_fixture(root)
            self.source_fixture(source, 'updated APP user edit')
            active = module.installed_game(root)
            before = module.inventory(root / 'web')
            commit = 'b' * 40
            # An invalid update must leave the currently playable release intact.
            (source / 'web/track.m4a').write_bytes(b'damaged audio')
            with self.assertRaises(ValueError):
                module.install_update(root, commit, self.archive_fixture(source))
            self.assertFalse((root / '.local/current.json').exists())
            self.assertEqual((active / 'track.m4a').read_bytes(), b'original audio')
            (source / 'web/track.m4a').write_bytes(b'original audio')
            result = module.install_update(root, commit, self.archive_fixture(source))
            self.assertEqual((result / 'app/custom.css').read_text(), 'updated APP user edit')
            self.assertEqual(module.installed_game(root), result)
            self.assertEqual(module.inventory(root / 'web'), before)
            self.assertEqual((root / 'app/custom.css').read_text(), 'original')

    def test_update_rejects_archive_traversal_without_touching_local_game(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as downloaded:
            root, source = Path(local), Path(downloaded)
            self.source_fixture(root)
            self.source_fixture(source)
            active = module.installed_game(root)
            with self.assertRaises(ValueError):
                module.install_update(root, 'c' * 40, self.archive_fixture(source, '../escape.txt'))
            self.assertEqual(module.installed_game(root), active)

    def test_update_checks_app_only_and_offline_failure_keeps_playable_release(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as downloaded:
            root, source = Path(local), Path(downloaded)
            self.source_fixture(root)
            self.source_fixture(source, 'new')
            server = SimpleNamespace(game_directory=module.installed_game(root))
            stop = Mock()
            stop.is_set.return_value = False
            stop.wait.return_value = True
            fetch = Mock(side_effect=[json.dumps(dict(sha='d' * 40)).encode(), self.archive_fixture(source)])
            module.updater(server, stop, root=root, fetch=fetch)
            self.assertEqual(server.update_status, 'current')
            self.assertEqual((server.game_directory / 'app/custom.css').read_text(), 'new')
            self.assertTrue(all('nagisa793/card_game_app/' in call.args[0] for call in fetch.call_args_list))
            previous = server.game_directory
            module.updater(server, stop, root=root, fetch=Mock(side_effect=OSError('offline')))
            self.assertEqual(server.update_status, 'offline')
            self.assertEqual(server.game_directory, previous)


if __name__ == '__main__':
    unittest.main()
