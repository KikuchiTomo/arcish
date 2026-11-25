#!/usr/bin/env python3
"""Generate the extension icons (no dependencies).

    python3 scripts/gen_icons.py

The mark is the product itself: a sidebar next to a page, on a flat tile.
Shapes are described in unit coordinates and supersampled, so every size is
drawn from the same geometry.
"""
import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)
SAMPLES = 6  # supersampling factor per axis
OUT = Path(__file__).resolve().parent.parent / "icons"

# Background: a superellipse tile in one flat colour (the icon is black and white).
TILE_EXPONENT = 5.0
TILE_INSET = 0.02
TILE_COLOR = (0x17, 0x16, 0x1B)

# Foreground: (left, top, right, bottom, corner radius, opacity)
SIDEBAR = (0.215, 0.235, 0.405, 0.765, 0.075, 1.0)
PAGE = (0.465, 0.235, 0.785, 0.765, 0.075, 0.42)
WHITE = (255, 255, 255)


def in_tile(x, y):
    half = 0.5 - TILE_INSET
    return abs((x - 0.5) / half) ** TILE_EXPONENT + abs((y - 0.5) / half) ** TILE_EXPONENT <= 1


def in_rounded_rect(x, y, rect):
    left, top, right, bottom, radius, _ = rect
    if not (left <= x <= right and top <= y <= bottom):
        return False
    dx = max(left + radius - x, 0, x - (right - radius))
    dy = max(top + radius - y, 0, y - (bottom - radius))
    return dx * dx + dy * dy <= radius * radius


def blend(under, over, opacity):
    return [u + (o - u) * opacity for u, o in zip(under, over)]


def sample(x, y):
    """Colour and coverage of one sub-pixel."""
    if not in_tile(x, y):
        return None
    color = list(TILE_COLOR)
    for shape in (PAGE, SIDEBAR):
        if in_rounded_rect(x, y, shape):
            color = blend(color, WHITE, shape[5])
    return color


def pixel(px, py, size):
    total = [0.0, 0.0, 0.0]
    hits = 0
    for sy in range(SAMPLES):
        for sx in range(SAMPLES):
            color = sample((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)
            if color is None:
                continue
            hits += 1
            for i in range(3):
                total[i] += color[i]
    if not hits:
        return (0, 0, 0, 0)
    return (*(round(c / hits) for c in total), round(255 * hits / SAMPLES**2))


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def png(size):
    rows = b"".join(b"\x00" + bytes(c for x in range(size) for c in pixel(x, y, size)) for y in range(size))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        (OUT / f"icon{size}.png").write_bytes(png(size))
        print(f"icons/icon{size}.png")
