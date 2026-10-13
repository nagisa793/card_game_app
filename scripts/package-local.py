"""Package the localhost WEB app with a tested Mac server runtime."""
import argparse
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from local_web import build, write_json


def package(output, runtime, architecture, commit):
    output.mkdir(parents=True, exist_ok=True)
    for name in ('web', 'app'):
        shutil.copytree(ROOT / name, output / name)
    for name in ('local_web.py', 'Start_card_game.command', 'upstream.json', 'README.md'):
        shutil.copy2(ROOT / name, output / name)
    (output / 'scripts').mkdir()
    shutil.copy2(ROOT / 'scripts/service-worker.template.js', output / 'scripts/service-worker.template.js')
    target = output / '_runtime' / architecture
    shutil.copytree(runtime, target, symlinks=True)
    (output / 'Start_card_game.command').chmod(0o755)
    (target / 'game-server').chmod(0o755)
    metadata = json.loads((ROOT / 'upstream.json').read_text())
    write_json(output / 'build-info.json', dict(appCommit=commit, webCommit=metadata['commit'], webVersion=metadata['webVersion']))
    # Validate the actual packaged input, not a development build.
    import tempfile
    with tempfile.TemporaryDirectory() as staging:
        build(output, Path(staging) / 'game')
    licenses = output / 'licenses'
    licenses.mkdir()
    python_license = Path(sys.base_prefix) / 'LICENSE.txt'
    if python_license.exists():
        shutil.copy2(python_license, licenses / 'PYTHON-LICENSE.txt')
    import importlib.metadata
    for distribution in ('pyinstaller', 'certifi'):
        for entry in importlib.metadata.files(distribution) or ():
            if entry.name.lower().startswith(('license', 'copying')):
                source = entry.locate()
                if source.is_file():
                    shutil.copy2(source, licenses / f'{distribution}-{entry.name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--architecture', required=True, choices=('macos-arm64', 'macos-x64'))
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    package(args.output, args.runtime, args.architecture, args.commit)
