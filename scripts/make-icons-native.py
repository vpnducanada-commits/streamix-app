#!/usr/bin/env python3
"""Generate Android launcher icon PNGs for Streamix native project."""
import os
from PIL import Image, ImageDraw

LOGO_PATH = 'www/logo-streamix-play.png'
OUTPUT_BASE = 'streamix-native/app/src/main/res'

DENSITY_MAP = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}

def generate_icon(size, output_path):
    """Generate launcher icon PNG with white background + centered logo."""
    img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    logo = Image.open(LOGO_PATH).convert('RGBA')
    max_size = int(size * 0.62)
    ratio = min(max_size / logo.width, max_size / logo.height)
    new_w = int(logo.width * ratio)
    new_h = int(logo.height * ratio)
    logo = logo.resize((new_w, new_h), Image.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    img.paste(logo, (x, y), logo)
    img.save(output_path, 'PNG')

def main():
    if not os.path.exists(LOGO_PATH):
        print(f'Logo not found: {LOGO_PATH}')
        return
    for density, size in DENSITY_MAP.items():
        output_dir = os.path.join(OUTPUT_BASE, f'mipmap-{density}')
        os.makedirs(output_dir, exist_ok=True)
        generate_icon(size, os.path.join(output_dir, 'ic_launcher.png'))
        generate_icon(size, os.path.join(output_dir, 'ic_launcher_round.png'))
        print(f'Generated {density}: {size}x{size}')

if __name__ == '__main__':
    main()
