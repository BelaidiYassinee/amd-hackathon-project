"""Radeon API capability check (P2, Task 1).

Run from the repo root:  python scripts/check_radeon.py
Prints a summary table and the AGENT_MODE decision. Never prints the API key.
"""
from __future__ import annotations

import json
import os
import time

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BASE_URL = os.getenv("LLM_BASE_URL", "https://developer.amd.com.cn/radeon/api/v1")
MODEL = os.getenv("LLM_MODEL", "DeepSeek-V4-Flash")
KEY = os.getenv("RADEON_API_KEY", "")
TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "60"))

WEATHER_TOOL = {
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Current weather for a city.",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}


def safe(err: Exception) -> str:
    """Error text without the key, trimmed to one line."""
    text = f"{type(err).__name__}: {err}"
    if KEY:
        text = text.replace(KEY, "***")
    return text.replace("\n", " ")[:200]


def usage_str(resp) -> str:
    u = resp.usage
    if u is None:
        return "usage=None"
    return f"prompt={u.prompt_tokens} completion={u.completion_tokens}"


def check_models(client: OpenAI) -> tuple[bool, str]:
    ids = [m.id for m in client.models.list().data]
    gemma = [i for i in ids if "gemma" in i.lower()]
    print("  model ids:", ", ".join(ids) or "(none)")
    detail = f"{len(ids)} models; {MODEL} listed: {MODEL in ids}"
    if gemma:
        detail += f"; GEMMA FOUND: {gemma} (tell the team)"
    return True, detail


def check_plain(client: OpenAI) -> tuple[bool, str]:
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "Reply with the single word OK."}],
        max_tokens=1500,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    content = resp.choices[0].message.content or ""
    print(f"  content: {content.strip()[:200]!r}")
    return "OK" in content.upper(), f"{ms} ms, {usage_str(resp)}, content={content.strip()[-40:]!r}"


def tool_roundtrip(client: OpenAI) -> tuple[bool, str]:
    """Ask for a tool call, send a fake result back, expect a text answer."""
    messages = [{"role": "user", "content": "What is the weather in Rome? Use the tool."}]
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=MODEL, messages=messages, tools=[WEATHER_TOOL], max_tokens=1500
    )
    msg = resp.choices[0].message
    if not msg.tool_calls:
        return False, f"no tool_calls (content={(msg.content or '')[:60]!r})"
    call = msg.tool_calls[0]
    args = json.loads(call.function.arguments or "{}")
    messages.append(
        {
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.function.name, "arguments": call.function.arguments},
                }
            ],
        }
    )
    messages.append(
        {
            "role": "tool",
            "tool_call_id": call.id,
            "content": json.dumps({"city": "Rome", "temp_c": 21, "sky": "sunny"}),
        }
    )
    resp2 = client.chat.completions.create(
        model=MODEL, messages=messages, tools=[WEATHER_TOOL], max_tokens=1500
    )
    ms = int((time.perf_counter() - t0) * 1000)
    answer = resp2.choices[0].message.content or ""
    ok = bool(answer.strip()) and not resp2.choices[0].message.tool_calls
    return ok, f"{ms} ms, call={call.function.name}({args}), answer={answer.strip()[:60]!r}"


def check_json_mode(client: OpenAI) -> tuple[bool, str]:
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": 'Return the JSON object {"ok": true} and nothing else.'}],
        response_format={"type": "json_object"},
        max_tokens=1500,
    )
    content = resp.choices[0].message.content or ""
    try:
        parsed = json.loads(content)
        return parsed.get("ok") is True, f"parsed: {parsed}"
    except json.JSONDecodeError:
        return False, f"accepted but not parseable: {content[:60]!r}"


def check_reasoning(client: OpenAI) -> tuple[bool, str]:
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "What is 17 * 23? Answer with the number only."}],
        max_tokens=1500,
    )
    msg = resp.choices[0].message
    content = msg.content or ""
    has_think = "<think>" in content
    extra = msg.model_extra or {}
    reasoning = getattr(msg, "reasoning_content", None) or extra.get("reasoning_content")
    detail = (
        f"<think> in content: {has_think}; reasoning_content attr: {reasoning is not None}"
        f" ({len(reasoning or '')} chars); {usage_str(resp)}; answer={content.strip()[-20:]!r}"
    )
    return True, detail


def run(name: str, fn, client: OpenAI) -> tuple[str, bool, str]:
    print(f"\n[{name}]")
    try:
        ok, detail = fn(client)
    except Exception as e:  # report, keep going
        ok, detail = False, safe(e)
    print(f"  -> {'PASS' if ok else 'FAIL'}: {detail}")
    return name, ok, detail


def main() -> None:
    if not KEY:
        print("RADEON_API_KEY is empty. Put it in .env first.")
        return
    print(f"Endpoint: {BASE_URL}\nModel:    {MODEL}\nKey:      set ({len(KEY)} chars, not shown)")
    client = OpenAI(base_url=BASE_URL, api_key=KEY, timeout=TIMEOUT_S)

    rows = [
        run("1 models.list", check_models, client),
        run("2 plain chat", check_plain, client),
    ]
    if "AuthenticationError" in rows[-1][2]:
        print("\nKey rejected (401). Generate a new key on the LLMGateway 'API Keys' page,")
        print("put it in .env as RADEON_API_KEY, and run again. No AGENT_MODE decision.")
        return
    tool_rows = [run(f"3 tool calling #{i}", tool_roundtrip, client) for i in (1, 2, 3)]
    rows += tool_rows
    rows += [
        run("4 JSON mode", check_json_mode, client),
        run("5 reasoning output", check_reasoning, client),
    ]

    print("\n" + "=" * 100)
    print(f"{'check':<22} {'result':<7} detail")
    print("-" * 100)
    for name, ok, detail in rows:
        print(f"{name:<22} {'PASS' if ok else 'FAIL':<7} {detail}")
    print("=" * 100)

    tools_ok = all(ok for _, ok, _ in tool_rows)
    mode = "tools" if tools_ok else "prefetch"
    passed = sum(ok for _, ok, _ in tool_rows)
    print(f"Decision: AGENT_MODE={mode}  (tool round trip {passed}/3)")


if __name__ == "__main__":
    main()
