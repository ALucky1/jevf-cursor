#!/usr/bin/env python3
"""
Build the desktop cursor files from the source art.

  macOS   -> desktop/Jevf.cape   (Mousecape v2.0 document)
  Windows -> desktop/jevf.cur    (32/48/64 px, 32-bit BGRA)

The .cape format is not documented anywhere official; the key names, the
version numbers and the scale rule below were read out of Mousecape's own
source (mousecloak/MCDefs.m and src/models/MCCursor.m):

  * Representations is an array of image data, PNG in v2.0 documents.
  * A representation's scale is inferred, not declared: scale = pixelsWide
    / PointsWide. So the 1x entry must be exactly PointsWide x PointsHigh
    pixels and the 2x entry exactly double that.
  * Animation frames stack vertically, so a still cursor is FrameCount 1
    and a representation exactly PointsHigh * scale pixels tall.

Usage:  python3 tools/build_desktop.py path/to/transparent-source.png
"""

import os
import plistlib
import struct
import sys
from io import BytesIO

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "desktop")

# Logical cursor size in points. The stock macOS arrow is roughly 24pt tall;
# this is deliberately bigger, because the whole point is that you can see him.
POINTS_WIDE = 39
POINTS_HIGH = 28

# The tip of the left antenna, in the source image's own pixel coordinates,
# measured after the transparent trim below. This is what sits under the
# real pointer position.
TIP_RATIO_X = 336 / 1326.0
TIP_RATIO_Y = 1 / 941.0

CAPE_IDENTIFIER = "lol.emfh.jevf"
CAPE_NAME = "Jevf"
CAPE_AUTHOR = "ALucky1"
CAPE_VERSION = 1.0

# Only the arrow is replaced. Overriding the I-beam or the resize cursors
# makes a machine genuinely unpleasant to use, so they stay stock.
CURSOR_IDS = [
    "com.apple.coregraphics.Arrow",
    "com.apple.coregraphics.ArrowCtx",
]


def load_art(path):
    """Open the source and trim it to the visible subject."""
    im = Image.open(path).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(bbox)


def png_bytes(im):
    buf = BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build_cape(art):
    reps = []
    for scale in (1, 2):
        w, h = POINTS_WIDE * scale, POINTS_HIGH * scale
        reps.append(png_bytes(art.resize((w, h), Image.LANCZOS)))

    cursor = {
        "FrameCount": 1,
        "FrameDuration": 1.0,
        "HotSpotX": float(round(TIP_RATIO_X * POINTS_WIDE)),
        "HotSpotY": float(round(TIP_RATIO_Y * POINTS_HIGH)),
        "PointsWide": float(POINTS_WIDE),
        "PointsHigh": float(POINTS_HIGH),
        "Representations": reps,
    }

    cape = {
        "Author": CAPE_AUTHOR,
        "CapeName": CAPE_NAME,
        "CapeVersion": CAPE_VERSION,
        "Cloud": False,
        "HiDPI": True,
        "Identifier": CAPE_IDENTIFIER,
        "MinimumVersion": 2.0,
        "Version": 2.0,
        "Cursors": {cid: dict(cursor) for cid in CURSOR_IDS},
    }

    path = os.path.join(OUT, "Jevf.cape")
    with open(path, "wb") as fh:
        plistlib.dump(cape, fh, fmt=plistlib.FMT_XML)
    return path, cursor["HotSpotX"], cursor["HotSpotY"]


def cur_image_blob(im):
    """One BITMAPINFOHEADER + BGRA pixels + AND mask, as a .cur expects."""
    w, h = im.size
    px = im.load()

    # BITMAPINFOHEADER. biHeight is doubled because the AND mask counts too.
    header = struct.pack(
        "<IiiHHIIiiII",
        40, w, h * 2, 1, 32, 0, w * h * 4, 0, 0, 0, 0,
    )

    # XOR bitmap: BGRA, bottom-up.
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))

    # AND mask: 1 bit per pixel, rows padded to 4 bytes. Fully transparent
    # pixels are masked so ancient renderers do not draw black boxes.
    row_bytes = ((w + 31) // 32) * 4
    and_mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(row_bytes)
        for x in range(w):
            if px[x, y][3] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        and_mask += row

    return header + bytes(xor) + bytes(and_mask)


def build_cur(art):
    sizes = (32, 48, 64)
    blobs, entries = [], []

    for s in sizes:
        # Square canvas, art flush to the top so the antenna tip stays high.
        aw = s
        ah = max(1, round(s * art.height / art.width))
        canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        canvas.paste(art.resize((aw, ah), Image.LANCZOS), (0, 0))
        blobs.append(cur_image_blob(canvas))
        entries.append((s, round(TIP_RATIO_X * s), round(TIP_RATIO_Y * ah)))

    out = bytearray(struct.pack("<HHH", 0, 2, len(sizes)))  # ICONDIR, type 2 = cursor
    offset = 6 + 16 * len(sizes)
    for (s, hx, hy), blob in zip(entries, blobs):
        out += struct.pack(
            "<BBBBHHII",
            s if s < 256 else 0, s if s < 256 else 0, 0, 0,
            hx, hy, len(blob), offset,
        )
        offset += len(blob)
    for blob in blobs:
        out += blob

    path = os.path.join(OUT, "jevf.cur")
    with open(path, "wb") as fh:
        fh.write(bytes(out))
    return path, entries


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    os.makedirs(OUT, exist_ok=True)
    art = load_art(sys.argv[1])
    print("source art trimmed to %dx%d" % art.size)

    cape, hx, hy = build_cape(art)
    print("%-22s %6.0f KB   hotspot (%g, %g) in %dx%d points"
          % (os.path.relpath(cape, HERE), os.path.getsize(cape) / 1024,
             hx, hy, POINTS_WIDE, POINTS_HIGH))

    cur, entries = build_cur(art)
    print("%-22s %6.0f KB   %s"
          % (os.path.relpath(cur, HERE), os.path.getsize(cur) / 1024,
             ", ".join("%dpx hotspot (%d,%d)" % e for e in entries)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
