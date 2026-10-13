import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

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
            self.assertEqual((output / 'index.html').read_text(), (ROOT / 'www/index.html').read_text())
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


if __name__ == '__main__':
    unittest.main()
