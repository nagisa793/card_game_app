"""Verify the release contains both launch runtimes and unchanged WEB source."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_web import inventory

root = Path(sys.argv[1])
metadata = json.loads((root / 'upstream.json').read_text())
assert inventory(root / 'web') == metadata['files'], 'Original game assets changed in packaging'
assert (root / 'Start_card_game.command').stat().st_mode & 0o111, 'Launcher is not executable'
for arch in ('macos-arm64', 'macos-x64'):
    executable = root / '_runtime' / arch / 'game-server'
    assert executable.is_file() and executable.stat().st_mode & 0o111, arch
assert not (root / '.local').exists(), 'Personal runtime state must not be packaged'
assert json.loads((root / 'build-info.json').read_text())['webCommit'] == metadata['commit']
print('PASS: both Mac runtimes, launcher permissions and all original WEB files')
