#!/usr/bin/env python3
"""Generate Android launcher icons from logo-streamix-play.png."""
import os, sys, shutil
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

    # Calculer le padding pour adaptive icon
    # On veut que l'icône occupe 66% du cadre (standard Android)
    padding_ratio = 0.17  # 17% padding

    for folder, size in SIZES.items():
        folder_path = os.path.join(RES, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Redimensionner directement le logo
        resized = img.resize((size, size), Image.LANCZOS)
        out = os.path.join(folder_path, "ic_launcher.png")
        resized.save(out, "PNG")
        print(f"  {out} ({size}x{size})")

        # Round version (same image)
        resized.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")

    # Adaptive icon XML (Android 8+)
    adaptive_dir = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(adaptive_dir, exist_ok=True)
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/white"/>
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
