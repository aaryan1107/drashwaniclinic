#!/usr/bin/env python3
"""Render the clinic's brand assets (app icons, splash screens, PWA icons) from one definition.

The mark is the two-tone rounded cross used in the app header (index.html .clinic-mark):
a teal tile with a horizontal bar (56% x 19%) under a vertical bar (19% x 56%), fully rounded.
Run from the repo root:  python3 scripts/build-brand-assets.py
Requires Pillow. Every output keeps the size of the file it replaces.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SS = 4  # supersampling factor for smooth edges

BRAND = {
    "teal": (0x17, 0x67, 0x63),   # clinic teal: tile and primary action
    "deep": (0x17, 0x2D, 0x2A),   # ink
    "mist": (0xF4, 0xF8, 0xF7),   # light canvas
    "bar_h": (0xE0, 0xF0, 0xEC),  # horizontal bar
    "bar_v": (0x9F, 0xDC, 0xC0),  # vertical bar (mint)
}


def cross(draw, cx, cy, size, h=BRAND["bar_h"], v=BRAND["bar_v"]):
    """Draw the two-tone cross centred at (cx, cy); size is the tile edge it belongs to."""
    long, short = size * 0.56, size * 0.19
    r = short / 2
    draw.rounded_rectangle([cx - long / 2, cy - short / 2, cx + long / 2, cy + short / 2], radius=r, fill=h)
    draw.rounded_rectangle([cx - short / 2, cy - long / 2, cx + short / 2, cy + long / 2], radius=r, fill=v)


def render(w, h, fn, mode="RGBA", bg=(0, 0, 0, 0)):
    big = Image.new(mode, (w * SS, h * SS), bg)
    fn(ImageDraw.Draw(big), w * SS, h * SS)
    return big.resize((w, h), Image.LANCZOS)


def tile(radius_ratio, cross_scale=1.0):
    """A filled tile with the cross. radius_ratio 0 = square (iOS masks it), 0.5 = circle."""
    def fn(d, w, h):
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius=w * radius_ratio, fill=BRAND["teal"])
        cross(d, w / 2, h / 2, w * cross_scale)
    return fn


def foreground(d, w, h):
    # Android adaptive foreground: 108dp canvas, keep the cross well inside the 66dp safe circle.
    cross(d, w / 2, h / 2, w * 0.62)


def splash(d, w, h):
    edge = min(w, h) * 0.28
    x0, y0 = (w - edge) / 2, (h - edge) / 2
    d.rounded_rectangle([x0, y0, x0 + edge, y0 + edge], radius=edge * 0.316, fill=BRAND["teal"])
    cross(d, w / 2, h / 2, edge)


def save(img, path, rgb=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert("RGB") if rgb else img).save(path, optimize=True)
    print("wrote", path.relative_to(ROOT), img.size)


def size_of(path):
    with Image.open(path) as im:
        return im.size


def main():
    res = ROOT / "android/app/src/main/res"
    for density, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        save(render(px, px, tile(0.22, 0.86)), res / f"mipmap-{density}/ic_launcher.png")
        save(render(px, px, tile(0.5, 0.80)), res / f"mipmap-{density}/ic_launcher_round.png")
        fg = round(px * 108 / 48)
        save(render(fg, fg, foreground), res / f"mipmap-{density}/ic_launcher_foreground.png")
    for p in sorted(res.glob("drawable*/splash.png")):
        w, h = size_of(p)
        save(render(w, h, splash, "RGB", BRAND["mist"]), p, rgb=True)

    ios = ROOT / "ios/App/App/Assets.xcassets"
    save(render(1024, 1024, tile(0, 0.86), "RGB", BRAND["teal"]), ios / "AppIcon.appiconset/AppIcon-512@2x.png", rgb=True)
    for p in sorted((ios / "Splash.imageset").glob("*.png")):
        w, h = size_of(p)
        save(render(w, h, splash, "RGB", BRAND["mist"]), p, rgb=True)

    pub = ROOT / "public"
    save(render(192, 192, tile(0.22, 0.86)), pub / "icon-192.png")
    save(render(512, 512, tile(0.22, 0.86)), pub / "icon-512.png")
    save(render(512, 512, tile(0, 0.62), "RGB", BRAND["teal"]), pub / "icon-maskable-512.png", rgb=True)
    save(render(180, 180, tile(0, 0.86), "RGB", BRAND["teal"]), pub / "apple-touch-icon.png", rgb=True)


if __name__ == "__main__":
    main()
