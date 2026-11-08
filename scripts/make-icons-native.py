#!/usr/bin/env python3
"""Create matching adaptive and legacy launcher icons from the Streamix wordmark."""
from pathlib import Path
from PIL import Image

base = Path('streamix-native/app/src/main/res')
logo = Image.open('www/logo-streamix-play.png').convert('RGBA')
# Crop transparent padding so the wordmark is legible in the launcher.
alpha = logo.getchannel('A')
mask = alpha.point(lambda a: 255 if a > 180 else 0)
bbox = mask.getbbox()
logo = logo.crop(bbox)

def logo_on(canvas_size, max_width, max_height, background):
    canvas = Image.new('RGBA', (canvas_size, canvas_size), background)
    mark = logo.copy()
    mark.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((canvas_size-mark.width)//2, (canvas_size-mark.height)//2))
    return canvas

# Android's adaptive foreground safe zone is 66/108 of the image.
out = base / 'drawable-nodpi'
out.mkdir(parents=True, exist_ok=True)
logo_on(432, 240, 128, (0,0,0,0)).save(out / 'ic_launcher_foreground.png')
# Discrete wordmark overlay is independent of third-party website DOM.
logo.thumbnail((500, 200), Image.Resampling.LANCZOS)
logo.save(out / 'streamix_wordmark.png')
for density, size in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    folder = base / ('mipmap-' + density)
    folder.mkdir(parents=True, exist_ok=True)
    img = logo_on(size, int(size*.74), int(size*.38), (10,10,10,255))
    for name in ('ic_launcher.png','ic_launcher_round.png'):
        img.save(folder / name)
