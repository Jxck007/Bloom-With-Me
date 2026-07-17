#!/usr/bin/env python3
"""Build lightweight WebP delivery copies for artwork referenced by asset-map.json."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterator

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ASSET_MAP = PUBLIC / "assets" / "asset-map.json"


def asset_paths(value: Any) -> Iterator[str]:
    if isinstance(value, str) and value.startswith("/assets/"):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from asset_paths(child)
    elif isinstance(value, list):
        for child in value:
            yield from asset_paths(child)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing files.")
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    mapping = json.loads(ASSET_MAP.read_text(encoding="utf-8"))
    sources = sorted({
        PUBLIC / path.lstrip("/")
        for path in asset_paths(mapping)
        if Path(path).suffix.lower() in {".png", ".jpg", ".jpeg"}
    })

    before = after = written = 0
    for source in sources:
        if not source.exists():
            print(f"MISSING  {source.relative_to(ROOT)}")
            continue

        target = source.with_suffix(".webp")
        before += source.stat().st_size
        needs_write = not target.exists() or target.stat().st_mtime_ns < source.stat().st_mtime_ns
        if needs_write and not args.dry_run:
            with Image.open(source) as image:
                image.save(
                    target,
                    "WEBP",
                    quality=args.quality,
                    method=6,
                    alpha_quality=90,
                )
            written += 1

        target_size = target.stat().st_size if target.exists() else 0
        after += target_size
        status = "WRITE" if needs_write else "READY"
        print(f"{status:5}  {source.relative_to(ROOT)} -> {target.name} ({target_size:,} bytes)")

    reduction = 100 * (1 - after / before) if before and after else 0
    print(f"\nRuntime artwork: {before:,} -> {after:,} bytes ({reduction:.1f}% smaller); wrote {written} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
