from __future__ import annotations

from typing import Callable

engine = None
RESET_HOOKS: list[Callable] = []


def get_engine():
    assert engine is not None
    return engine


def reset(seed: int = 7):
    return None


async def run_loop() -> None:
    return None
