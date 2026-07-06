from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol


class OverlayPointLike(Protocol):
    @property
    def x(self) -> float:
        ...

    @property
    def y(self) -> float:
        ...


def bounding_box_from_points(points: Sequence[OverlayPointLike]) -> dict[str, float]:
    if len(points) < 2:
        raise ValueError("overlay bounding box requires at least two points")
    xs = [point.x for point in points]
    ys = [point.y for point in points]
    min_x = min(xs)
    min_y = min(ys)
    max_x = max(xs)
    max_y = max(ys)
    width = max_x - min_x
    height = max_y - min_y
    if min_x < 0 or min_y < 0 or max_x > 1 or max_y > 1 or width <= 0 or height <= 0:
        raise ValueError("overlay points must form a normalized non-empty frame bbox")
    return {
        "x": round(min_x, 6),
        "y": round(min_y, 6),
        "width": round(width, 6),
        "height": round(height, 6),
    }
