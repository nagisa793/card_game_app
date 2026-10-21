"""Keep the original variable font and exact glyph outlines; remove unused glyphs."""
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
font_path = root / 'web/assets/NotoSansJP.ttf'
text = ''.join(p.read_text() for directory in ['web/src', 'app'] for p in (root / directory).rglob('*') if p.suffix in ['.js', '.css', '.html'])
text += (root / 'web/index.html').read_text()
# Include decoded JavaScript Unicode escapes as well as runtime numbers/punctuation.
import re
text += ''.join(chr(int(code, 16)) for code in re.findall(r'\\u([0-9a-fA-F]{4})', text))
font = TTFont(font_path)
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
font.flavor = 'woff2'
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'app/fonts/duel.woff2'
output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
print(f'Original font {font_path.stat().st_size:,} bytes → same glyphs {output.stat().st_size:,} bytes')
