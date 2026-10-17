"""Unit tests for agent/llm.py with a fake OpenAI client (no network).
Run: python -m pytest backend/tests/test_llm.py -q
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import openai
import pytest

from backend.app.agent import llm

REQ = httpx.Request("POST", "https://developer.amd.com.cn/radeon/api/v1/chat/completions")


def make_resp(content="", tool_calls=None, usage=(10, 5)):
    tcs = [
        SimpleNamespace(id=f"call_{i}", function=SimpleNamespace(name=name, arguments=args))
        for i, (name, args) in enumerate(tool_calls or [])
    ]
    msg = SimpleNamespace(content=content, tool_calls=tcs or None)
    u = SimpleNamespace(prompt_tokens=usage[0], completion_tokens=usage[1]) if usage else None
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)], usage=u)


class FakeClient:
    """Returns (or raises) the queued items in order and records every request."""

    def __init__(self, *items):
        self.items = list(items)
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.requests.append(dict(kwargs))
        item = self.items.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture(autouse=True)
def clean_state(monkeypatch, tmp_path):
    monkeypatch.setenv("RADEON_API_KEY", "sk-secret-test-key")
    monkeypatch.setenv("LLM_MOCK", "0")
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    monkeypatch.setattr(llm, "_json_mode_supported", True)
    monkeypatch.setattr(llm, "_counter", 0)
    monkeypatch.setattr(llm, "_recent", llm.deque(maxlen=200))
    monkeypatch.setattr(llm, "_totals", {k: 0 for k in llm._totals})
    yield tmp_path


def use(monkeypatch, client):
    monkeypatch.setattr(llm, "_client", client)
    return client


def test_mock_mode(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")
    assert llm.is_mock()
    with pytest.raises(llm.LlmError, match="mock mode"):
        llm.chat([{"role": "user", "content": "hi"}], purpose="check")
    monkeypatch.setenv("LLM_MOCK", "0")
    monkeypatch.setenv("RADEON_API_KEY", "")
    assert llm.is_mock()  # empty key also means mock


def test_think_stripped_and_call_logged(monkeypatch, clean_state):
    use(monkeypatch, FakeClient(make_resp("<think>long\nreasoning</think>\nOK", usage=(11, 2))))
    r = llm.chat([{"role": "user", "content": "Say OK"}], purpose="check")
    assert r.content == "OK"
    assert r.tool_calls == []
    assert r.raw_message == {"role": "assistant", "content": "<think>long\nreasoning</think>\nOK"}
    assert r.call.id == "llm-0001" and r.call.ok
    assert (r.call.prompt_tokens, r.call.completion_tokens) == (11, 2)
    assert r.call.endpoint == "developer.amd.com.cn"
    lines = (clean_state / "llm_calls.jsonl").read_text().splitlines()
    assert json.loads(lines[0])["id"] == "llm-0001"


def test_tool_calls_parsed(monkeypatch):
    use(monkeypatch, FakeClient(make_resp(
        "", tool_calls=[("get_sensor_summary", '{"machine_id": "P-101", "signal": "vibration_hf"}'),
                        ("search_manual", "{not json")])))
    r = llm.chat([{"role": "user", "content": "x"}], purpose="diagnosis", tools=[{"type": "function"}])
    assert r.content is None
    assert r.tool_calls[0] == {"id": "call_0", "name": "get_sensor_summary",
                               "arguments": {"machine_id": "P-101", "signal": "vibration_hf"}}
    assert r.tool_calls[1]["arguments"] == {} and "parse_error" in r.tool_calls[1]
    assert r.raw_message["tool_calls"][0] == {
        "id": "call_0", "type": "function",
        "function": {"name": "get_sensor_summary", "arguments": '{"machine_id": "P-101", "signal": "vibration_hf"}'}}


def test_retry_once_then_ok(monkeypatch):
    client = use(monkeypatch, FakeClient(openai.APIConnectionError(request=REQ), make_resp("OK")))
    r = llm.chat([{"role": "user", "content": "x"}], purpose="check")
    assert r.content == "OK" and len(client.requests) == 2
    assert llm.stats().calls == 1  # retries count inside the same record


def test_retry_fails_raises_without_key(monkeypatch):
    err = openai.APIConnectionError(message="boom sk-secret-test-key", request=REQ)
    use(monkeypatch, FakeClient(err, err))
    with pytest.raises(llm.LlmError) as exc:
        llm.chat([{"role": "user", "content": "x"}], purpose="check")
    assert "sk-secret-test-key" not in str(exc.value)
    s = llm.stats()
    assert (s.calls, s.errors) == (1, 1) and not s.recent[0].ok


def test_json_mode_rejected_is_dropped(monkeypatch):
    bad = openai.BadRequestError("response_format is not supported",
                                 response=httpx.Response(400, request=REQ), body=None)
    client = use(monkeypatch, FakeClient(bad, make_resp('{"ok": true}'), make_resp('{"ok": true}')))
    llm.chat([{"role": "user", "content": "x"}], purpose="check", json_mode=True)
    assert "response_format" in client.requests[0] and "response_format" not in client.requests[1]
    assert llm._json_mode_supported is False
    llm.chat([{"role": "user", "content": "x"}], purpose="check", json_mode=True)
    assert "response_format" not in client.requests[2]  # never sent again


def test_usage_missing_is_estimated(monkeypatch):
    use(monkeypatch, FakeClient(make_resp("x" * 40, usage=None)))
    r = llm.chat([{"role": "user", "content": "y" * 100}], purpose="check")
    assert r.call.completion_tokens == 10 + len("[]") // 4
    assert r.call.prompt_tokens > 0


def test_stats_average_ok_calls_only(monkeypatch):
    err = openai.InternalServerError("down", response=httpx.Response(500, request=REQ), body=None)
    use(monkeypatch, FakeClient(make_resp("a"), err, err, make_resp("b")))
    llm.chat([{"role": "user", "content": "x"}], purpose="check")
    with pytest.raises(llm.LlmError):
        llm.chat([{"role": "user", "content": "x"}], purpose="diagnosis")
    llm.chat([{"role": "user", "content": "x"}], purpose="eval")
    s = llm.stats()
    assert (s.calls, s.errors, s.total_prompt_tokens, s.total_completion_tokens) == (3, 1, 20, 10)
    assert s.provider == "AMD Radeon API" and not s.mock
    assert [c.id for c in s.recent] == ["llm-0003", "llm-0002", "llm-0001"]  # newest first
    assert s.avg_latency_ms >= 0


def test_response_without_choices_is_an_llm_error(monkeypatch):
    use(monkeypatch, FakeClient(SimpleNamespace(choices=[], usage=None)))
    with pytest.raises(llm.LlmError, match="bad API response"):
        llm.chat([{"role": "user", "content": "x"}], purpose="alert_message")
    s = llm.stats()
    assert (s.calls, s.errors) == (1, 1) and s.recent[0].ok is False


def test_usage_with_none_counts_is_estimated(monkeypatch):
    resp = make_resp("x" * 40)
    resp.usage = SimpleNamespace(prompt_tokens=None, completion_tokens=None)
    use(monkeypatch, FakeClient(resp))
    r = llm.chat([{"role": "user", "content": "y" * 100}], purpose="check")
    assert r.call.ok and r.call.prompt_tokens > 0 and r.call.completion_tokens == 10 + len("[]") // 4


def test_finish_reason_length_sets_truncated(monkeypatch):
    cut, done = make_resp('{"fault": "bear'), make_resp("{}")
    cut.choices[0].finish_reason = "length"
    done.choices[0].finish_reason = "stop"
    use(monkeypatch, FakeClient(cut, done))
    assert llm.chat([{"role": "user", "content": "x"}], purpose="check").truncated is True
    assert llm.chat([{"role": "user", "content": "x"}], purpose="check").truncated is False
