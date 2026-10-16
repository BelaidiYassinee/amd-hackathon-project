from __future__ import annotations

from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "backend" / "data"


def load_config() -> dict:
    with open(DATA_DIR / "machines.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def sim_start(cfg: dict) -> datetime:
    return datetime.fromisoformat(cfg["sim"]["start"].replace("Z", "+00:00"))