"""LLM client for the AMD Radeon API (OpenAI-compatible), with a call log.

Interface: 00 §8.1. All AI reasoning in the app goes through chat().
chat() is synchronous and thread-safe; async callers wrap it in asyncio.to_thread.
Rule for callers: if is_mock() is true or LlmError is raised, use your deterministic fallback.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import openai
from dotenv import load_dotenv

from backend.app.models import AmdStats, LlmCall, LlmPurpose

load_dotenv()  # main.py loads it too; this makes CLI and scripts work on their own

DEFAULT_BASE_URL = "https://developer.amd.com.cn/radeon/api/v1"
DEFAULT_MODEL = "DeepSeek-V4-Flash"

_RETRYABLE = (
    openai.APITimeoutError,
    openai.APIConnectionError,
    openai.RateLimitError,
    openai.InternalServerError,
)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


class LlmError(Exception):
    """Raised after the retry also failed, or when chat() is called in mock mode."""


@dataclass
class ChatResult:
    content: str | None  # assistant text, <think>…</think> blocks stripped
    tool_calls: list[dict]  # [{"id": str, "name": str, "arguments": dict}] (+ "parse_error" if bad JSON)
    raw_message: dict  # assistant message, ready to append to the conversation
    call: LlmCall  # also recorded in the stats ring buffer + llm_calls.jsonl
    truncated: bool = False  # finish_reason == "length": the answer was cut at max_tokens


# ---------- module state (guarded by _lock) ----------
_lock = threading.Lock()
_client: openai.OpenAI | None = None
_json_mode_supported = True
_counter = 0
_recent: deque[LlmCall] = deque(maxlen=200)
_totals = {"calls": 0, "errors": 0, "prompt": 0, "completion": 0, "ok": 0, "ok_latency": 0, "ok_tps": 0.0}


# ---------- config ----------
def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _key() -> str:
    return _env("RADEON_API_KEY")


def _model() -> str:
    return _env("LLM_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL


def _base_url() -> str:
    return _env("LLM_BASE_URL", DEFAULT_BASE_URL) or DEFAULT_BASE_URL


def _endpoint() -> str:
    return urlparse(_base_url()).hostname or _base_url()


def is_mock() -> bool:
    """True when LLM_MOCK=1 or no key is set: no network calls, callers use their fallback."""
    return _env("LLM_MOCK", "0") == "1" or not _key()


def _get_client() -> openai.OpenAI:
    global _client
    with _lock:
        if _client is None:
            _client = openai.OpenAI(
                base_url=_base_url(),
                api_key=_key(),
                timeout=float(_env("LLM_TIMEOUT_S", "60") or 60),
                max_retries=0,  # we retry once ourselves
            )
        return _client


def _safe(err: Exception) -> str:
    """Error text without the key, on one line, trimmed."""
    text = f"{type(err).__name__}: {err}"
    if _key():
        text = text.replace(_key(), "***")
    text = re.sub(r"Bearer\s+\S+", "Bearer ***", text)
    return text.replace("\n", " ")[:300]


# ---------- API call with retry ----------
def _create(kwargs: dict):
    """One API call, retried once after 2 s on transient errors."""
    client = _get_client()
    try:
        return client.chat.completions.create(**kwargs)
    except _RETRYABLE:
        time.sleep(2)
        return client.chat.completions.create(**kwargs)


def _create_json_aware(kwargs: dict):
    """Like _create, but drops response_format for good if the API rejects it."""
    global _json_mode_supported
    try:
        return _create(kwargs)
    except openai.BadRequestError as e:
        if "response_format" not in kwargs or not re.search(r"response_format|json", str(e), re.I):
            raise
        _json_mode_supported = False
        kwargs.pop("response_format")
        return _create(kwargs)


# ---------- response processing ----------
def _strip_think(text: str) -> str:
    text = _THINK_RE.sub("", text)
    if "</think>" in text:  # opening tag missing: keep only what follows the reasoning
        text = text.split("</think>")[-1]
    return text.strip()


def _parse_tool_calls(msg) -> list[dict]:
    calls = []
    for tc in msg.tool_calls or []:
        entry = {"id": tc.id, "name": tc.function.name, "arguments": {}}
        try:
            args = json.loads(tc.function.arguments or "{}")
            if not isinstance(args, dict):
                raise ValueError("arguments is not a JSON object")
            entry["arguments"] = args
        except ValueError as e:  # json.JSONDecodeError is a ValueError
            entry["parse_error"] = f"bad arguments JSON: {e}"
        calls.append(entry)
    return calls


def _raw_message(msg, raw_content: str) -> dict:
    raw = {"role": "assistant", "content": raw_content}
    if msg.tool_calls:
        raw["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"},
            }
            for tc in msg.tool_calls
        ]
    return raw


# ---------- call log ----------
def _record(purpose: LlmPurpose, latency_ms: int, prompt_tokens: int, completion_tokens: int,
            ok: bool, error: str | None = None) -> LlmCall:
    global _counter
    tps = completion_tokens / (latency_ms / 1000) if ok and latency_ms > 0 else 0.0
    with _lock:
        _counter += 1
        call = LlmCall(
            id=f"llm-{_counter:04d}",
            at=datetime.now(timezone.utc).replace(microsecond=0),
            purpose=purpose,
            model=_model(),
            endpoint=_endpoint(),
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tokens_per_s=round(tps, 1),
            ok=ok,
            error=error,
        )
        _recent.append(call)
        _totals["calls"] += 1
        _totals["prompt"] += prompt_tokens
        _totals["completion"] += completion_tokens
        if ok:
            _totals["ok"] += 1
            _totals["ok_latency"] += latency_ms
            _totals["ok_tps"] += call.tokens_per_s
        else:
            _totals["errors"] += 1
        _append_log(call)
    return call


def _append_log(call: LlmCall) -> None:
    try:
        log_dir = Path(_env("LOG_DIR", "backend/logs") or "backend/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        with open(log_dir / "llm_calls.jsonl", "a", encoding="utf-8") as f:
            f.write(call.model_dump_json() + "\n")
    except OSError:
        pass  # logging must never break a diagnosis


# ---------- public API ----------
def chat(messages: list[dict], *, purpose: LlmPurpose, tools: list[dict] | None = None,
         json_mode: bool = False, temperature: float = 0.2, max_tokens: int = 1500) -> ChatResult:
    if is_mock():
        raise LlmError("mock mode")

    kwargs: dict = {"model": _model(), "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if tools:
        kwargs["tools"] = tools
    if json_mode and _json_mode_supported:
        kwargs["response_format"] = {"type": "json_object"}

    t0 = time.perf_counter()
    try:
        resp = _create_json_aware(kwargs)
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        call = _record(purpose, latency_ms, 0, 0, ok=False, error=_safe(e))
        raise LlmError(call.error) from None
    latency_ms = int((time.perf_counter() - t0) * 1000)

    try:  # a malformed response (no choices, odd usage) must still surface as LlmError
        choice = resp.choices[0]
        msg = choice.message
        raw_content = msg.content or ""
        tool_calls = _parse_tool_calls(msg)
        usage = getattr(resp, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None)
        completion_tokens = getattr(usage, "completion_tokens", None)
        if prompt_tokens is None:  # estimate: ~4 characters per token
            prompt_tokens = len(json.dumps(messages, default=str)) // 4
        if completion_tokens is None:
            completion_tokens = (len(raw_content) + len(json.dumps(tool_calls))) // 4
        content = _strip_think(raw_content) or None
        raw_message = _raw_message(msg, raw_content)
        truncated = getattr(choice, "finish_reason", None) == "length"
    except Exception as e:
        call = _record(purpose, latency_ms, 0, 0, ok=False, error="bad API response: " + _safe(e))
        raise LlmError(call.error) from None

    call = _record(purpose, latency_ms, int(prompt_tokens), int(completion_tokens), ok=True)
    return ChatResult(content=content, tool_calls=tool_calls, raw_message=raw_message, call=call,
                      truncated=truncated)


def stats() -> AmdStats:
    with _lock:
        ok = _totals["ok"]
        return AmdStats(
            provider="AMD Radeon API",
            model=_model(),
            endpoint=_endpoint(),
            mock=is_mock(),
            calls=_totals["calls"],
            errors=_totals["errors"],
            total_prompt_tokens=_totals["prompt"],
            total_completion_tokens=_totals["completion"],
            avg_latency_ms=round(_totals["ok_latency"] / ok, 1) if ok else 0.0,
            avg_tokens_per_s=round(_totals["ok_tps"] / ok, 1) if ok else 0.0,
            recent=list(reversed(_recent))[:20],
        )
