"""Keep the original variable font and exact glyph outlines; remove unused glyphs."""
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

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
original = TTFont(font_path)
prepared = TTFont(output)
for weight in (400, 700):
    glyph_sets = [item.getGlyphSet(location={'wght': weight}) for item in (original, prepared)]
    for code in prepared.getBestCmap():
        outlines = []
        for item, glyphs in zip((original, prepared), glyph_sets):
            pen = DecomposingRecordingPen(glyphs)
            glyphs[item.getBestCmap()[code]].draw(pen)
            outlines.append(pen.value)
        if outlines[0] != outlines[1]:
            raise ValueError(f'Font outline changed: U+{code:04X}, weight {weight}')
print(f'Verified {len(prepared.getBestCmap()) * 2} original regular/bold glyph outlines')
print(f'Original font {font_path.stat().st_size:,} bytes → same glyphs {output.stat().st_size:,} bytes')
