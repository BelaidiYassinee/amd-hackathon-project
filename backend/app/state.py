from __future__ import annotations

import asyncio
import traceback
from typing import Callable

from backend.app.sim.engine import Engine

engine: Engine | None = None
RESET_HOOKS: list[Callable[[Engine], None]] = []   # P4's alert code registers itself here


def get_engine() -> Engine:
    assert engine is not None
    return engine


def reset(seed: int = 7) -> Engine:
    global engine
    engine = Engine(seed=seed)
    for hook in RESET_HOOKS:                       # let other modules re-attach to the new engine
        hook(engine)
    return engine


async def run_loop() -> None:
    acc = 0.0                                      # fractional samples carried between ticks
    while True:
        await asyncio.sleep(0.1)
        eng = engine                               # read the global every tick, so reset() works
        if eng is None or eng.paused:
            continue
        acc += eng.speed * 0.1
        n = int(acc)
        if n:
            acc -= n
            try:
                eng.step(n)
            except Exception:                      # keep the clock alive; the error shows in the console
                traceback.print_exc()