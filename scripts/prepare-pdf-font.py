"""Development-only font preparation. Requires fonttools 4.66.1.

Input: Noto Sans KR variable TTF (Google Fonts, SIL OFL 1.1).
Usage: python scripts/prepare-pdf-font.py source.ttf public/pdf-font.ttf
Preserve public/pdf-font-LICENSE.txt when distributing the resulting font.
This is not executed on end-user machines.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 400}, inplace=False)
# pdf-lib/fontkit's shaping and subsetting disagree for this font. Keep a
# static font with direct glyph mapping, then embed the full font in PDFs.
if "GSUB" in font:
    del font["GSUB"]
for record in font["name"].names:
    if record.nameID in (1, 4, 16):
        record.string = "LOXT PDF Sans".encode(record.getEncoding())
    elif record.nameID in (2, 17):
        record.string = "Regular".encode(record.getEncoding())
    elif record.nameID == 6:
        record.string = "LOXTPDFSans-Regular".encode(record.getEncoding())
font.save(sys.argv[2])
