"""Tile stills into one numbered contact sheet: python scripts/sheet.py out.jpg cols img1 img2 ..."""
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = 270, 480
rows = (len(ims) + cols - 1) // cols
S = Image.new("RGB", (cols * w, rows * h), "black")
d = ImageDraw.Draw(S)
for i, im in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * h
    S.paste(im.resize((w, h)), (x, y))
    d.rectangle([x, y, x + 34, y + 22], fill="black"); d.text((x + 5, y + 5), str(i + 1), fill="white")
S.save(out, quality=88)
