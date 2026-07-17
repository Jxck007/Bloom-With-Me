#!/usr/bin/env python3
"""Remove baked checkerboards from generated Bloom PNG artwork.

The script only removes near-white/light-gray neutral pixels that are connected
to an image edge. It skips PNGs that already have a transparent edge so a
second run cannot progressively erode cleaned artwork.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "public" / "assets"
DEFAULT_PATHS = (
    "weather/cloud-normal.png",
    "weather/cloud-rain.png",
    "weather/droplets/drop-small.png",
    "weather/droplets/drop-medium.png",
    "weather/droplets/drop-large.png",
    "garden/planting-grid.png",
)
PADDING = 12


def image_data(image: Image.Image) -> list[int]:
    getter = getattr(image, "get_flattened_data", image.getdata)
    return list(getter())


def is_neutral_edge_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha >= 245
        and min(red, green, blue) >= 218
        and max(red, green, blue) - min(red, green, blue) <= 14
    )


def edge_points(width: int, height: int) -> Iterable[tuple[int, int]]:
    for x in range(width):
        yield x, 0
        if height > 1:
            yield x, height - 1
    for y in range(1, height - 1):
        yield 0, y
        if width > 1:
            yield width - 1, y


def connected_background_mask(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    mask = Image.new("L", rgba.size, 0)
    mask_pixels = mask.load()
    queue: deque[tuple[int, int]] = deque()

    for x, y in edge_points(width, height):
        if mask_pixels[x, y] == 0 and is_neutral_edge_background(pixels[x, y]):
            mask_pixels[x, y] = 255
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            if mask_pixels[next_x, next_y] != 0:
                continue
            if not is_neutral_edge_background(pixels[next_x, next_y]):
                continue
            mask_pixels[next_x, next_y] = 255
            queue.append((next_x, next_y))

    return mask


def has_transparent_edge(image: Image.Image) -> bool:
    alpha = image.convert("RGBA").getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    points = list(edge_points(width, height))
    return bool(points) and sum(pixels[x, y] <= 8 for x, y in points) / len(points) >= 0.95


def crop_with_padding(image: Image.Image, padding: int = PADDING) -> Image.Image:
    alpha = image.getchannel("A")
    # Ignore nearly invisible blur remnants while locating the artwork bounds.
    crop_mask = alpha.point(lambda value: 255 if value >= 4 else 0)
    bounds = crop_mask.getbbox()
    if bounds is None:
        return image
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    cropped = image.crop((left, top, right, bottom))
    canvas = Image.new("RGBA", (cropped.width + padding * 2, cropped.height + padding * 2))
    canvas.alpha_composite(cropped, (padding, padding))
    return canvas


def inspect(path: Path) -> tuple[bool, int, int]:
    with Image.open(path) as source:
        rgba = source.convert("RGBA")
        mask = connected_background_mask(rgba)
        removed = sum(1 for value in image_data(mask) if value)
        total = rgba.width * rgba.height
        baked = not has_transparent_edge(rgba) and removed / total >= 0.08
        return baked, removed, total


def clean(path: Path) -> tuple[str, tuple[int, int], tuple[int, int], int]:
    with Image.open(path) as source:
        rgba = source.convert("RGBA")
        original_size = rgba.size
        if has_transparent_edge(rgba):
            return "already-clean", original_size, original_size, 0

        mask = connected_background_mask(rgba)
        removed = sum(1 for value in image_data(mask) if value)
        if removed / (rgba.width * rgba.height) < 0.08:
            return "no-baked-background-detected", original_size, original_size, removed

        # A small blur produces a soft watercolor alpha boundary without
        # selecting pale artwork that is enclosed by colored contour pixels.
        softened = mask.filter(ImageFilter.GaussianBlur(radius=0.75))
        original_alpha = rgba.getchannel("A")
        new_alpha = Image.new("L", rgba.size)
        new_alpha.putdata([
            min(existing, 255 - background)
            for existing, background in zip(image_data(original_alpha), image_data(softened))
        ])
        rgba.putalpha(new_alpha)
        output = crop_with_padding(rgba)
        output.save(path, format="PNG", optimize=True, compress_level=9)
        return "cleaned", original_size, output.size, removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="Paths relative to public/assets (defaults to known generated PNGs).")
    parser.add_argument("--apply", action="store_true", help="Write cleaned, cropped true-alpha PNGs. Default is dry-run.")
    args = parser.parse_args()

    targets = [ASSET_ROOT / relative for relative in (args.paths or DEFAULT_PATHS)]
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"[{mode}] generated asset cleanup")
    failures = 0
    for path in targets:
        if not path.is_file():
            print(f"MISSING  {path.relative_to(PROJECT_ROOT)}")
            failures += 1
            continue
        if args.apply:
            status, before, after, removed = clean(path)
            print(f"{status.upper():31} {path.relative_to(PROJECT_ROOT)} {before[0]}x{before[1]} -> {after[0]}x{after[1]} edge pixels={removed}")
        else:
            baked, removed, total = inspect(path)
            status = "would-clean" if baked else "skip"
            print(f"{status.upper():31} {path.relative_to(PROJECT_ROOT)} edge pixels={removed}/{total}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
