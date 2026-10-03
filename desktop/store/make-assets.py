"""Resize the existing HardEarner logo into required Microsoft Store assets."""
from pathlib import Path
import sys
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
destination.mkdir(parents=True, exist_ok=True)
with Image.open(source).convert('RGBA') as image:
    for name, size in [('Square44x44Logo', 44), ('Square150x150Logo', 150),
                       ('StoreLogo', 50), ('StoreListingLogo', 300)]:
        image.resize((size, size), Image.Resampling.LANCZOS).save(destination / (name + '.png'))
