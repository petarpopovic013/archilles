"""Reproduce the three text captures using only Python's standard library.

Run from any directory: python3 fixtures/regulations/extract-official-html.py --check
Without --check, regenerates text from the captured local HTML; no network calls.
This extracts readable paragraphs, not a layout-faithful table/annex representation.
"""

from html.parser import HTMLParser
from pathlib import Path
import sys


class LegalTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skipped = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skipped += 1
        if tag in ("p", "div", "br", "tr", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.skipped -= 1

    def handle_data(self, data):
        if not self.skipped:
            self.parts.append(data)


root = Path(__file__).resolve().parent
for stem in ("fire-current", "accessibility-current", "accessibility-amendment-10-2026"):
    parser = LegalTextParser()
    parser.feed((root / "originals" / (stem + ".html")).read_text(encoding="utf-8"))
    text = "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())
    output = root / (stem + ".txt")
    if "--check" in sys.argv:
        if output.read_text(encoding="utf-8") != text:
            raise SystemExit("EXTRACTION_MISMATCH: " + stem)
        print("OK " + stem)
    else:
        output.write_text(text, encoding="utf-8")
