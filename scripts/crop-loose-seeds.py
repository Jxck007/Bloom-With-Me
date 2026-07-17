#!/usr/bin/env python3
"""Remove the disconnected packet strip from Bloom loose-seed PNGs.

The generated seed files contain two independent alpha components: a torn
packet strip at the top and the loose seed below it. This script keeps only
the lower seed component, preserves soft alpha pixels around it, and skips
files that already contain one isolated component.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
import shutil

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SEED_ROOT = PROJECT_ROOT / "public" / "assets" / "seeds"
BACKUP_ROOT = PROJECT_ROOT / "public" / "assets" / "_source-backup" / "seeds"
SEED_FILES = (
    "rose-seed.png",
    "sunflower-seed.png",
    "lavender-seed.png",
)
ALPHA_THRESHOLD = 8
PADDING = 12


def connected_components(alpha: Image.Image) -> list[tuple[int, tuple[int, int, int, int], float]]:
    pixels = alpha.load()
    width, height = alpha.size
    seen: set[tuple[int, int]] = set()
    components: list[tuple[int, tuple[int, int, int, int], float]] = []

    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= ALPHA_THRESHOLD or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            count = 0
            left = right = x
            top = bottom = y
            y_total = 0
            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                y_total += current_y
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)
                for next_point in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    next_x, next_y = next_point
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if next_point in seen or pixels[next_x, next_y] <= ALPHA_THRESHOLD:
                        continue
                    seen.add(next_point)
                    queue.append(next_point)
            components.append((count, (left, top, right + 1, bottom + 1), y_total / count))

    return components


def seed_crop_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    components = connected_components(alpha)
    total_visible = sum(component[0] for component in components)
    substantial = [
        component
        for component in components
        if component[0] >= max(40, total_visible * 0.01)
    ]
    if len(substantial) <= 1:
        return None

    lower_components = [
        component
        for component in substantial
        if component[2] >= image.height * 0.42
    ]
    if not lower_components:
        raise ValueError("No lower loose-seed component was found")

    _, (left, top, right, bottom), _ = max(lower_components, key=lambda component: component[0])
    return (
        max(0, left - PADDING),
        max(0, top - PADDING),
        min(image.width, right + PADDING),
        min(image.height, bottom + PADDING),
    )


def process(path: Path, apply: bool) -> str:
    with Image.open(path) as source:
        image = source.convert("RGBA")
        crop_box = seed_crop_box(image)
        if crop_box is None:
            return f"ALREADY ISOLATED  {path.relative_to(PROJECT_ROOT)} {image.width}x{image.height}"
        cropped = image.crop(crop_box)
        report = (
            f"{'CROPPED' if apply else 'WOULD CROP':17} "
            f"{path.relative_to(PROJECT_ROOT)} "
            f"{image.width}x{image.height} -> {cropped.width}x{cropped.height} "
            f"box={crop_box}"
        )
        if not apply:
            return report

        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
        backup_path = BACKUP_ROOT / path.name
        if not backup_path.exists():
            shutil.copy2(path, backup_path)
        cropped.save(path, format="PNG", optimize=True, compress_level=9)
        return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Back up originals and write isolated seed PNGs.")
    args = parser.parse_args()
    print(f"[{'APPLY' if args.apply else 'DRY RUN'}] loose seed crop")
    for name in SEED_FILES:
        print(process(SEED_ROOT / name, args.apply))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
