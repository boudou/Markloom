"""Assembles the frames from `node scripts/screenshots.mjs --demo` into docs/screenshots/demo[-dark].gif (needs Pillow)."""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000
FRAME_MS = 120

for theme, suffix in (("light", ""), ("dark", "-dark")):
    frames, durations = [], []

    for path in sorted((ROOT / "test-results" / "demo-frames" / theme).glob("*.png")):
        holds = int(path.stem.split("-")[1])
        image = Image.open(path).convert("RGB")
        image = image.resize((WIDTH, image.height * WIDTH // image.width), Image.LANCZOS)
        frames.append(image.quantize(colors=96, dither=Image.Dither.NONE))
        durations.append(FRAME_MS * holds)

    if not frames:
        sys.exit(f"No frames for {theme}: run scripts/screenshots.mjs --demo first")

    out = ROOT / "docs" / "screenshots" / f"demo{suffix}.gif"
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    print(out.name, f"{out.stat().st_size // 1024} KB, {len(frames)} frames")
