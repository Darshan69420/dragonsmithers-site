"""Build the self-hosted WOFF2 fonts in /fonts from the npm @fontsource packages.

Archivo is kept variable but clamped to the ranges the site uses (wght 400-800, wdth 100-125),
then subset to Latin plus the few symbols the pages use. Run: npm run fonts
Requires: pip install fonttools brotli
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
NM = ROOT / "node_modules"
OUT = ROOT / "fonts"
OUT.mkdir(exist_ok=True)

# Basic Latin, Latin-1 punctuation/letters, general punctuation, arrows, check marks, currency.
UNICODES = "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2122,U+2190-2193,U+2212,U+2713"

def build(src, dst, limits=None):
    font = TTFont(src)
    if limits:
        font = instancer.instantiateVariableFont(font, limits)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "tnum", "lnum", "case", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    font.flavor = "woff2"
    font.save(OUT / dst)
    print(f"{dst}: {(OUT / dst).stat().st_size / 1024:.1f} KiB")

build(NM / "@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2", "archivo-var.woff2",
      {"wght": (400, 800), "wdth": (100, 125)})
for w in (400, 600):
    build(NM / f"@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{w}-normal.woff2", f"plex-mono-{w}.woff2")
