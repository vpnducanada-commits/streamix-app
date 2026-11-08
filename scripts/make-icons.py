#!/usr/bin/env python3
"""Generate Android launcher icons from logo-streamix-play.png."""
import os, sys
from PIL import Image

LOGO = "www/logo-streamix-play.png"
RES = "android/app/src/main/res"

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

def main():
    if not os.path.exists(LOGO):
        print(f"ERROR: {LOGO} not found")
        sys.exit(1)

    img = Image.open(LOGO).convert("RGBA")
    w, h = img.size
    print(f"Source logo: {w}x{h}")

    for folder, size in SIZES.items():
        folder_path = os.path.join(RES, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Créer un canvas carré blanc avec le logo centré
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        # Redimensionner le logo en gardant le ratio, contenu dans 80% du cadre
        margin = int(size * 0.10)
        target = size - 2 * margin
        ratio = min(target / w, target / h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        logo_resized = img.resize((new_w, new_h), Image.LANCZOS)
        x = (size - new_w) // 2
        y = (size - new_h) // 2
        canvas.paste(logo_resized, (x, y), logo_resized)

        out = os.path.join(folder_path, "ic_launcher.png")
        canvas.save(out, "PNG")
        print(f"  {out} ({size}x{size})")

        canvas.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")

    # Adaptive icon XML (Android 8+)
    adaptive_dir = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(adaptive_dir, exist_ok=True)
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="#FFFFFF"/>
    <foreground android:drawable="@mipmap/ic_launcher"/>
</adaptive-icon>
'''
    with open(os.path.join(adaptive_dir, "ic_launcher.xml"), "w") as f:
        f.write(xml)
    with open(os.path.join(adaptive_dir, "ic_launcher_round.xml"), "w") as f:
        f.write(xml)
    print(f"  {adaptive_dir}/ic_launcher.xml")
    print(f"  {adaptive_dir}/ic_launcher_round.xml")

    print("Icons generated ✓")

if __name__ == "__main__":
    main()
