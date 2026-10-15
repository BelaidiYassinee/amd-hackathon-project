# 02: P2 brief: AI agent on AMD, evidence validation, alerts and routing

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are my pair programmer for a 3-day hackathon. Read `00-project-and-contract.md` first. It is the shared spec, and its API contract (§7), engine interface (§8), LLM client interface (§8.1), and seed data (§10) are binding. Then read this brief: it is my part. Work only on the files listed under *You own*. Implement the tasks in order. After each task, run its acceptance check and show me the result before moving on. If something in the contract looks wrong or missing, tell me instead of changing it; I will coordinate with the team. Keep code simple and readable: this is a demo prototype, not production."

**Owner:** P2 (name: ____________)

**Your mission:** you own **the AI**, the part that runs on AMD and that judges will look at hardest. When the detector raises an anomaly, your agent investigates with tools on the **AMD Radeon API** and returns a diagnosis where every claim is backed by evidence that the backend **verifies**. Then you route the alert to the right on-shift person and manage the alert lifecycle (acknowledge, work order, escalation, resolve).

**What judges must be able to see:**
1. what the AI did (the trace)
2. what data supports its conclusion (validated evidence)
3. that it ran on AMD (model, endpoint, latency, tokens)

---

## You own

```
backend/app/data.py
backend/app/agent/__init__.py, llm.py, tools.py, prompts.py, validate.py, fallback.py, diagnose.py
backend/app/alerts/__init__.py, service.py, routing.py, notify.py
backend/app/api/alerts.py                 (P1 commits a stub Thursday; then it is yours)
backend/data/roster.json, spare_parts.json (after P1's first commit)
backend/tests/fake_engine.py, test_llm.py, test_tools.py, test_validate.py, test_routing.py
scripts/check_radeon.py
eval/diagnosis_eval.py
```

You also delete `test.py` once `llm.py` works.

**Do not touch:** `sim/*`, `detect/*`, `decide/*`, `api/plant.py`, `main.py`, `state.py`, `models.py`, `frontend/*`.

## You depend on

| From | What | When |
|---|---|---|
| P1 | Skeleton | Thu 21:00 |
| P1 | Real `Engine` | Fri 13:00. Until then use your `fake_engine.py` |
| P4 | Real manual and maintenance log | Fri 12:00. Until then use P1's placeholders |

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Team | Radeon API capability check results in chat | **Thu 23:00** |
| P1 | `llm.chat` / `llm.is_mock` (00 §8.1) | Thu night |
| P3 | `/api/alerts`, `/api/alerts/{id}/ack`, `/api/alerts/{id}/resolve`, `/api/people`, `/api/manual/{id}`, `/api/maintenance/{id}`, `/api/amd/stats` | Fri 18:00. Same shapes as 00 §14 |
| P1, P4 | `eval/diagnosis_eval.evaluate(runs, workers)` and accuracy numbers | Sat 12:00 |

---

## Task 1: Radeon API capability check (Thu, first thing, post by 23:00)

Create `scripts/check_radeon.py` (run it with `python scripts/check_radeon.py` from the repo root). It loads `.env`, builds an `openai.OpenAI(base_url=LLM_BASE_URL, api_key=RADEON_API_KEY)`, and runs 5 checks. Print a summary table. **Never print the key.**

1. **`client.models.list()`:** print the model ids. Flag any id containing `gemma`; if one exists, tell P4, because it may matter for the Google prize.
2. **Plain chat:** "Reply with the single word OK." Print the latency, `usage`, and content.
3. **Tool calling:** define one tool `get_weather(city: str)` and ask "What is the weather in Rome? Use the tool." Check whether `message.tool_calls` comes back. Then send a fake tool result back and check whether the model answers in text.
4. **JSON mode:** `response_format={"type": "json_object"}`, asking for `{"ok": true}`. Does it parse? Does the API reject the parameter?
5. **Reasoning output:** does `message.content` contain `<think>` blocks? Does the message have a `reasoning_content` attribute?

**Decision:**
- If check 3 works reliably (run it 3 times), use `AGENT_MODE=tools`.
- Otherwise use `AGENT_MODE=prefetch`; the trace UI looks the same either way.
- Post the table and the decision in the team chat.

---

## Task 2: LLM client with AMD call log (`agent/llm.py`, Thu night)

Implement exactly the interface in 00 §8.1.

- **Env:** `RADEON_API_KEY`, `LLM_BASE_URL` (default `https://developer.amd.com.cn/radeon/api/v1`), `LLM_MODEL` (default `DeepSeek-V4-Flash`), `LLM_TIMEOUT_S` (60), `LLM_MOCK` (0/1), `LOG_DIR` (`backend/logs`).
- **One module-level client**, created lazily. `is_mock()` is true when `LLM_MOCK=1` **or** the key is empty. If `chat()` is called in mock mode, raise `LlmError("mock mode")`.
- **Retry once** after 2 s on `APITimeoutError`, `APIConnectionError`, `RateLimitError`, or `InternalServerError`. After that, raise `LlmError(str(e))`.
- **JSON mode:** if the API rejects `response_format` (a `BadRequestError` mentioning it), set a module flag `_json_mode_supported = False` and retry without it.
- **Response processing:**
  - Strip `<think>...</think>` (regex, DOTALL) from `content`.
  - Parse `tool_calls` into `{"id", "name", "arguments": dict}`. Use `json.loads`, falling back to `{}` and recording the parse error in the trace.
  - Build `raw_message` as `{"role": "assistant", "content": <raw content or "">, "tool_calls": [...]}`, in OpenAI format, and only include `tool_calls` when present.
- **One `LlmCall` per `chat()` call** (count retries inside the same record):
  - `latency_ms` is the wall time.
  - Tokens come from `resp.usage`. If `usage` is missing, estimate `len(text) // 4`.
  - `tokens_per_s = completion_tokens / (latency_ms / 1000)`.
  - `endpoint` = the host of `LLM_BASE_URL`.
  - `id` = `llm-0001`, `llm-0002`, and so on.
- **Record keeping** (all under a `threading.Lock`):
  - running totals for `stats()` (all calls since start)
  - a `deque(maxlen=200)` of recent calls
  - one appended line per call in `LOG_DIR/llm_calls.jsonl` (create the dir; ignore write errors)
- **`stats()`** returns `AmdStats` with `provider="AMD Radeon API"`, `recent` = the newest 20, and the averages computed over **successful** calls only.

**Acceptance:**
- `python -c "from backend.app.agent.llm import chat; r = chat([{'role':'user','content':'Say OK'}], purpose='check'); print(r.content, r.call)"` prints a real answer and a filled `LlmCall`.
- With `LLM_MOCK=1`, `is_mock()` is True.

Then delete `test.py`.

---

## Task 3: Data loaders (`backend/app/data.py`, Thu night / Fri morning)

Use `functools.lru_cache`, `encoding="utf-8"`, and paths relative to `backend/data/`.

```python
def roster() -> list[Person]                       # on_shift False here; computed by routing
def maintenance(machine_id: str) -> list[MaintenanceRecord]   # newest first
def corrective_last_12m(machine_id: str, now: datetime) -> int # type == "corrective" and date > now.date() - 365 days
def parts(machine_id: str | None = None) -> list[dict]         # raw dicts from spare_parts.json, filtered by "fits"
def part(part_no: str) -> dict | None
def manual_sections() -> dict[str, ManualSection]              # parsed from manuals/pump_p101.md
def catalog() -> dict
```

**Manual parsing:** split on lines matching `^## \[([A-Z0-9-]+)\]\s+(.+)$`. The text is everything until the next such heading, stripped.

### `backend/tests/fake_engine.py` (so you're not blocked before Fri 13:00)

This is a small class with the **read** methods of the 00 §8 `Engine`:
- `sim_time`, `ewma_limit`, `machine_ids`, `machine_cfg`, `signal_specs`, `samples`, `baseline`, `contributions`, `is_failed`, and `threshold_alarm`
- no-op write methods, and the empty hook lists

Return data shaped like the 00 §14 examples for P-101: 48 h of samples with `vibration_hf` rising during the last 2 h, and the contributions list from §14.3. Switch your tests to the real engine once P1 merges it; keep the fake for fast unit tests.

**Acceptance:**
- `manual_sections()` has the 13 IDs from 00 §10.4.
- `corrective_last_12m("P-101", datetime(2026,10,15,tzinfo=timezone.utc)) == 3` once P4's log is in. P1's placeholder already has those records.

---

## Task 4: Agent tools (`agent/tools.py`, Fri morning)

### Tool definitions (OpenAI format, pass as `tools=TOOLS`)

```python
TOOLS = [
  {"type": "function", "function": {
    "name": "get_sensor_summary",
    "description": "Statistics and trend of one sensor signal of a machine over the last N hours, compared with its learned healthy baseline and its alarm limits.",
    "parameters": {"type": "object", "properties": {
        "machine_id": {"type": "string"},
        "signal": {"type": "string", "description": "Exact signal name, e.g. vibration_hf"},
        "hours": {"type": "number", "description": "Look-back window in hours, 1-48", "default": 24}},
      "required": ["machine_id", "signal"]}}},
  {"type": "function", "function": {
    "name": "get_maintenance_history",
    "description": "Machine facts (model, installation date, age) and its maintenance records newest first, plus the number of corrective repairs in the last 12 months.",
    "parameters": {"type": "object", "properties": {
        "machine_id": {"type": "string"},
        "limit": {"type": "integer", "default": 10}},
      "required": ["machine_id"]}}},
  {"type": "function", "function": {
    "name": "search_manual",
    "description": "Search the equipment manual (troubleshooting guides, procedures, safety rules). Returns the best matching sections with their section ids.",
    "parameters": {"type": "object", "properties": {
        "query": {"type": "string", "description": "Symptoms or keywords, e.g. 'high frequency vibration rising bearing temperature'"},
        "k": {"type": "integer", "default": 3}},
      "required": ["query"]}}},
  {"type": "function", "function": {
    "name": "check_spare_parts",
    "description": "Spare parts that fit this machine, with stock level, store location and lead time.",
    "parameters": {"type": "object", "properties": {
        "machine_id": {"type": "string"},
        "keyword": {"type": "string", "description": "Optional filter, e.g. 'bearing'"}},
      "required": ["machine_id"]}}},
]
```

### Implementations

Each tool is `fn(engine, **args) -> dict | list`. Round floats to 3 significant decimals. **Never raise.** Return `{"error": "..."}` with a helpful message (for example, the list of valid signal names) so the model can recover.

**`get_sensor_summary(engine, machine_id, signal, hours=24)`**

Clamp `hours` to 1–48. Use `engine.samples`, `engine.baseline(...)[signal]`, `engine.signal_specs`, and `engine.contributions`. Returns:

```json
{"machine_id": "P-101", "signal": "vibration_hf", "label": "HF vibration energy", "unit": "g",
 "baseline_typical": 0.3, "baseline_sigma": 0.03, "alarm_high": null, "alarm_low": null,
 "latest": 0.37, "mean": 0.33, "min": 0.27, "max": 0.38, "slope_per_h": 0.048,
 "z_latest": 3.9, "ewma_score": 1.62, "deviating_since": "2026-10-15T08:55:00Z",
 "projected_hours_to_alarm": null,
 "hourly_means": [{"t": "2026-10-14T10:00:00Z", "v": 0.301}]}
```

How the computed fields work:
- **`slope_per_h`** comes from the matching contribution.
- **`hourly_means`** has one point per hour of the window, so the model sees the trend.
- **`projected_hours_to_alarm`:**
  - `alarm_high` with slope > 0 → `(alarm_high - latest) / slope`
  - `alarm_low` with slope < 0 → `(latest - alarm_low) / -slope`
  - already beyond the limit → `0`
  - otherwise `null`
  - Round to 1 decimal.

**`get_maintenance_history(engine, machine_id, limit=10)`**

```json
{"machine": {"id": "P-101", "name": "Coolant pump P-101", "model": "AquaFlow CP-80", "area": "Cooling loop",
             "installed": "2017-03-14", "age_years": 9.6, "design_life_years": 15},
 "corrective_last_12m": 3,
 "records": [ {MaintenanceRecord as dict}, ... newest first, max limit ]}
```

Machine facts come from `engine.machine_cfg(machine_id)`. Age and the 12-month count are relative to `engine.sim_time`.

**`search_manual(engine, query, k=3)`**
- BM25 (`rank_bm25.BM25Okapi`) over `title + text` of every section. Build the index once.
- **Tokenizer:** lowercase, replace every character that isn't alphanumeric or `_` with a space, then split. For tokens containing `_`, also add the parts (`vibration_hf` → `vibration_hf`, `vibration`, `hf`). Drop a small stop-word list.
- Clamp `k` to 1–5.
- Returns `[{"section_id", "title", "text": text[:1200], "score"}]`.

**`check_spare_parts(engine, machine_id, keyword=None)`**
- Parts that fit the machine, as `{"part_no", "name", "in_stock", "location", "lead_time_days", "unit_cost_eur"}`.
- If `keyword` matches nothing, return all fitting parts plus a `"note"` saying the keyword matched nothing.

### Executor

```python
def run_tool(engine, name: str, args: dict, seen: set[str]) -> dict | list
```

- **Dispatch** by name. An unknown tool returns `{"error": "unknown tool"}`.
- **Fill `seen`** with every ref the model was shown: the signal names asked about, the maintenance record ids returned, the manual section ids returned, and the part numbers returned.
- **Truncate** the JSON you send back to the model to 3,000 characters.

**Acceptance (`test_tools.py`, with the real engine or `fake_engine`):**
- An unknown signal returns an error that lists the valid names.
- `projected_hours_to_alarm` is correct on a synthetic rising series.
- After P4's manual lands, `search_manual("high frequency vibration rising bearing temperature")` returns `P101-TS-01` first, and `search_manual("discharge pressure dropping flow falling noise")` returns `P101-TS-02` first.

---

## Task 5: The diagnosis agent (Fri morning, headless by 13:00)

### `agent/prompts.py`: system prompt (use this text, then tune it)

```
You are a reliability engineer assisting the maintenance team of a manufacturing plant.
An anomaly detector has flagged a machine. Find the most likely fault, back every claim with
evidence from the tools, and tell the technician exactly what to do.

How to work:
1. Use the tools before answering:
   - get_sensor_summary for every signal with score >= {half_limit} (at least the top 3 signals),
   - get_maintenance_history for the machine,
   - search_manual with a description of the symptom pattern (you may search more than once),
   - check_spare_parts before you list any part.
2. Compare the pattern (which signals moved, in which direction, in which order) with the
   troubleshooting sections of the manual. Consider at least two candidate faults.
3. Only cite evidence you saw in tool results. Evidence "ref" must be exact:
   a signal name (e.g. vibration_rms), a maintenance record id (e.g. WO-2025-0871),
   a manual section id (e.g. P101-TS-03) or a part number (e.g. CPL-ELEM-80). Never cite load_pct.
   Give at least 3 evidence items, including at least one sensor and one manual section.

Rules for the answer:
- fault is one of: bearing_wear, cavitation, misalignment, motor_overheat, other.
- est_time_to_failure_h: take the typical progression time the manual gives for that fault and
  subtract the hours since first deviation; if a sensor's projected_hours_to_alarm is smaller, use that.
- severity: critical if the machine is down, any signal is already beyond an alarm limit, or
  est_time_to_failure_h < 8; high if < 24; medium if < 72; otherwise low.
- action: critical -> stop_now; high or medium -> schedule_repair; low -> monitor.
  Exception: if the machine had 3 or more corrective repairs in the last 12 months and severity is
  medium or high, use consider_replacement.
- category: mechanical (bearings, alignment, coupling, impeller, seal), electrical (motor windings,
  cooling fan, supply), process (suction conditions, cavitation, flow).
- confidence: above 0.8 only if at least two signals AND a manual signature agree; lower otherwise.
- fix_steps: at most 8 concrete, ordered steps for a technician, taken from the manual sections you
  retrieved. Put section ids in parentheses. Start hands-on work with lockout/tagout.
- Write short, plain sentences. No jargon without a short explanation.

Final answer: ONLY a JSON object, no markdown fences, no text before or after:
{
  "fault": "bearing_wear | cavitation | misalignment | motor_overheat | other",
  "fault_label": "short human-readable label",
  "confidence": 0.0,
  "summary": "two sentences: what is happening and why you think so",
  "alternatives": [{"fault": "...", "why_less_likely": "..."}],
  "evidence": [{"kind": "sensor | history | manual | parts", "ref": "exact id", "detail": "one sentence"}],
  "severity": "low | medium | high | critical",
  "est_time_to_failure_h": 0.0,
  "action": "monitor | schedule_repair | stop_now | consider_replacement",
  "category": "mechanical | electrical | process",
  "fix_steps": ["..."],
  "parts": [{"part_no": "exact part number from check_spare_parts", "name": "...", "qty": 1}],
  "safety": ["..."]
}
```

`{half_limit}` = `0.5 * engine.ewma_limit`. Do **not** put a filled-in example diagnosis in the prompt: it biases the model toward that fault.

### User message (built from the event)

```
Machine: P-101, Coolant pump P-101 (AquaFlow CP-80), area "Cooling loop", type centrifugal_pump.
Plant time now: 2026-10-15T09:40:00Z. Machine status: running.
Anomaly event EVT-0001: detected 2026-10-15T09:40:00Z, first deviation 2026-10-15T08:55:00Z
(0.8 h ago), overall score 1.62 (alarm limit 1.5).
Signal contributions (score = |EWMA of standardized residual|, z = latest standardized residual,
slope in signal units per hour over the last 3 h):
- vibration_hf: score 1.62, z 3.9, slope +0.048 g/h, up, deviating since 08:55
- vibration_rms: score 0.41, z 1.1, slope +0.021 mm/s/h, up
- ...
Diagnose this anomaly.
```

### `agent/diagnose.py`

```python
@dataclass
class DiagnosisResult:
    diagnosis: Diagnosis
    trace: list[TraceStep]
    calls: list[LlmCall]
    used_fallback: bool
    error: str | None

def diagnose(engine, event: AnomalyEvent, *, purpose: LlmPurpose = "diagnosis",
             on_step: Callable[[TraceStep], None] | None = None) -> DiagnosisResult: ...
```

**Mode `tools`** (default):
1. `messages = [system, user]`. Initialize `seen` with the machine's signal names.
2. Loop up to **8** LLM turns: `llm.chat(messages, purpose=purpose, tools=TOOLS, temperature=0.2, max_tokens=1500)`.
   - Record a trace step (`kind="llm"`). For `output`, use a short summary such as "tool_calls: …" or "final JSON".
   - **If there are tool calls:** append `raw_message`. Then, for each call, run `run_tool`, record a `tool` step, and append `{"role": "tool", "tool_call_id": id, "content": json.dumps(result)}`. Continue.
   - **Otherwise:** parse and validate (below).
     - Valid → done.
     - Invalid on the first try → append `raw_message` and `{"role": "user", "content": "Fix these problems and answer again with only the JSON object: <errors>"}`, then continue.
     - Invalid on the second try → keep the result with `verified=False`.
3. If 8 turns pass with no final answer, call once more with `tools=None` and the message "Stop calling tools. Give your final JSON answer now."

**Mode `prefetch`** (if tool calling doesn't work on the Radeon API):
1. Run the tools yourself:
   - `get_sensor_summary` for the top 4 contributing signals
   - `get_maintenance_history`
   - `search_manual`, with a query built from the contributions using a signal → phrase map (for example `vibration_hf` up → "high frequency vibration energy rising")
   - `check_spare_parts`
2. Record each as a `tool` step.
3. Send one user message containing `Tool results:` plus the JSON. Make one `chat(..., json_mode=True)` call, then validate, allowing one retry as above.

**Parsing:**
1. Strip `<think>` blocks and code fences.
2. Take the text from the first `{` to the last `}` and `json.loads` it.
3. `Diagnosis.model_validate(...)`. Turn any `ValidationError` into readable error strings.

**On `LlmError` or `llm.is_mock()`:** return `fallback.rule_based(engine, event)` with `used_fallback=True` and `error="AMD API unavailable: <msg>. Rule-based fallback used."` (or "Mock mode…").

**`on_step`** is called for every trace step as it happens, so the UI can show the trace live while the alert is `diagnosing`.

### `agent/validate.py`

```python
def check(d: Diagnosis, engine, machine_id: str, seen: set[str]) -> list[str]
```

**Rules** (return human-readable error strings):

| Evidence kind | Its `ref` must be |
|---|---|
| `sensor` | A signal of this machine (not `load_pct`) |
| `history` | A maintenance record id for this machine **and** in `seen` |
| `manual` | An existing section id **and** in `seen` (the agent actually retrieved it) |
| `parts` | An existing part number that fits this machine |

Also:
- The evidence needs ≥ 3 items, ≥ 1 `sensor`, and ≥ 1 `manual`.
- Every `parts[].part_no` exists and fits the machine.
- **Normalize first:** strip and uppercase ids before checking.

**After checking:**
- **Overwrite** `parts[].name`, `in_stock`, and `lead_time_days` from `spare_parts.json`. The model must never be the source of stock numbers.
- Set `verified = not errors` and `validation_errors = errors`.
- Record a `validation` trace step, e.g. "6 evidence refs, 2 parts → ok" or the error list.

### `agent/fallback.py`: rule-based diagnosis (mock mode and API outages)

Use `contributions` (sorted) and `L = engine.ewma_limit`. The first matching rule wins:

1. `vibration_hf` is top-1 and up → `bearing_wear`
2. `discharge_pressure` or `flow` is in the top 2 and down → `cavitation`
3. `motor_temp` is top-1 and `vibration_rms` score < 0.5·L → `motor_overheat`
4. `vibration_rms` is in the top 2 and up → `misalignment`
5. Otherwise → `other`

**What the fallback diagnosis contains:**
- **Manual section:** bearing_wear → `P101-TS-01`, cavitation → `P101-TS-02`, misalignment → `P101-TS-03`, motor_overheat → `P101-TS-04`.
- **Evidence:** the top 2 sensors (detail templated with z and slope), the manual section, and the newest corrective record if there is one.
- **Fix steps:** the bullet or numbered lines of that manual section (first 6), or generic steps if there are none.
- **Parts:** a static map, e.g. bearing_wear → `BRG-6309-C3`, `GREASE-EP2`; misalignment → `CPL-ELEM-80`, `SHIM-KIT-80`; cavitation → `STR-DN125`; motor_overheat → `FAN-MTR-30`. Then overwrite the stock.
- **Fixed fields:** `confidence` 0.5, severity `medium`, action `schedule_repair` (or `consider_replacement` if ≥ 3 corrective repairs), and category by fault.
- **Label and trace:** `fault_label` = label + " (rule-based fallback)". The trace has one step `{"kind": "validation", "name": "fallback", ...}`.

### Headless CLI

`python -m backend.app.agent.diagnose --fault bearing_wear [--seed 7]`:
1. Build a real `Engine(seed, only=["P-101"])` (or `fake_engine` before Fri 13:00).
2. Disable auto-pause, inject at the live start + 1 h, and step until the first event.
3. Run `diagnose`, then print the trace steps and the final JSON.

**Acceptance:**
- For each of the 4 faults the CLI returns `verified: true`, and the right fault at least 3 times out of 4.
- With `LLM_MOCK=1`, it returns the fallback instantly.

---

## Task 6: Alerts, routing, and notifications (Fri afternoon, integrate by 18:00)

### `alerts/service.py`

```python
ESCALATE_AFTER_MIN = 120          # sim minutes without acknowledgement
WO_START = 412                    # first work order WO-2026-0412

def attach(engine) -> None        # clear the store, remember engine, register on_anomaly/on_threshold/on_tick
state.RESET_HOOKS.append(attach)  # at import time (main.py imports api.alerts -> imports this)

def on_anomaly(event) -> None
def on_threshold(machine_id, t, signal) -> None
def on_tick(now) -> None
def list_alerts() -> list[Alert]; def get_alert(alert_id) -> Alert
def ack(alert_id, req: AckRequest) -> Alert
def resolve(alert_id, req: ResolveRequest) -> Alert
```

**Store:** a dict plus an order list, protected by a `threading.Lock`. A `generation` counter increases on every `attach`, so a diagnosis thread started before a reset can't write into the new store. Return deep copies (`model_copy(deep=True)`) from the getters.

**`on_anomaly(event)`** (runs inside `engine.step`, so return fast):
1. Create `Alert(id="ALT-000n", state="diagnosing", created_at=event.detected_at, event=event, machine_name=...)`.
2. Call `engine.set_active_alert(machine_id, alert.id)`.
3. Schedule the pipeline:

```python
try:
    loop = asyncio.get_running_loop()
    loop.create_task(asyncio.to_thread(_pipeline, alert.id, generation))
except RuntimeError:            # no event loop (tests/eval): run inline
    _pipeline(alert.id, generation)
```

**`_pipeline(alert_id, gen)`** (runs in a worker thread):
1. Call `diagnose(engine, event, on_step=append_to_alert_trace)` and store the diagnosis, trace, and error.
2. Route with `routing.pick(...)` → primary and cc list. Set `assignee`.
3. Notify: `notify.compose(...)` then `notify.send(...)` for the primary (`reason="primary"`) and each cc (`reason="cc"`). Append the Notifications.
4. Set `state="open"`, but only if `gen` is still current.

**`on_threshold`:**
- Find the newest alert for that machine whose state is not `rejected`.
- Set `threshold_alarm_at`, `threshold_signal`, and `lead_time_h = round((t - event.detected_at).total_seconds() / 3600, 1)`.

**`on_tick(now)`:**
- For each alert in `open` where `now - created_at ≥ ESCALATE_AFTER_MIN`: set `state="escalated"`.
- Notify the on-shift supervisor with `reason="escalation"`, using the template message.
- The auto-pause stops sim time while diagnosing, so `created_at` is the right reference.

**`ack`:**
- **Rejected with 409** if the state is not `open`/`escalated` or the diagnosis is `None`.
- **Accepted:**
  - Set `state="acknowledged"`, `ack=Ack(...)` with `at=engine.sim_time`.
  - Create `work_order=WorkOrder(id=f"WO-2026-{n:04d}", priority={"critical":"P1","high":"P1","medium":"P2","low":"P3"}[severity], title=f"{fault_label} - {machine_name}", steps=fix_steps, parts=parts, assignee_id=person_id, status="open")`.
  - Call `engine.add_marker(machine, "acknowledged", now, f"Acknowledged by {name}")`.
- **Rejected:**
  - Set `state="rejected"`.
  - Call `engine.suppress(machine, 12)` and `engine.set_active_alert(machine, None)`.
  - Add marker `"acknowledged"` with label `"Rejected as false alarm by {name}"`.

**`resolve`:**
- Allowed from `open`, `acknowledged`, or `escalated`; otherwise 409.
- Set `state="resolved"` and `resolution=Resolution(at=now, actual_fault, diagnosis_correct=(diagnosis.fault == actual_fault))`. Set the work order status to `done`.
- Call `engine.clear_fault(machine)` and `engine.set_active_alert(machine, None)`. Add marker `"resolved"`.
- Append `{alert_id, machine_id, predicted, actual, correct, at}` to `LOG_DIR/feedback.jsonl`. This is the "learning loop" we mention in the pitch.

### `alerts/routing.py`

```python
ROLE_FOR_CATEGORY = {"mechanical": "mechanical_technician", "electrical": "electrical_technician",
                     "process": "process_engineer"}
def shift_at(t) -> str:                       # A 06-14, B 14-22, C 22-06 (sim time hour)
def on_shift(person, t) -> bool
def people_now(t) -> list[Person]             # roster with on_shift computed (for GET /api/people)
def pick(machine_area, diagnosis, t) -> tuple[Person, list[Person]]
```

**Rules for `pick`:**
- **Primary:** the first on-shift person with the category's role whose `areas` contain the machine's area or `"all"`. If there is none, use the on-shift supervisor.
- **cc:** the on-shift supervisor, when `severity == "critical"` or `action in ("stop_now", "consider_replacement")`, and only if they are not the primary.

**Acceptance (`test_routing.py`):**

| Input | Expected |
|---|---|
| 09:40, P-101, mechanical | Sara Benali (`tech-a1`) |
| Same, with action `consider_replacement` | cc Karim Ouali (`sup-a1`) |
| 23:00, process | Giulia Romano (`sup-c1`); shift C has no process engineer |
| 15:00, electrical | Elena Conti (`tech-b2`) |

### `alerts/notify.py`

**`compose(person, alert, reason) -> str`:**
- **`primary`:** one LLM call with `purpose="alert_message"`, `max_tokens=150`. Prompt:

  "Write a phone notification for {name} ({role}). Max 300 characters, plain text, no markdown. Include the machine id and name, the fault in plain words, the severity, the estimated time to failure if known, and the first action. End with 'Open the dashboard to acknowledge.' Use only facts from this JSON: {fault_label, severity, est_time_to_failure_h, fix_steps[0], machine}."

  Truncate to 300 characters. On mock mode or error, use the template.
- **Templates:**
  - primary: `f"{mid} {mname}: {fault_label} ({severity}{', ~%d h to failure' % ttf if ttf else ''}). First step: {fix_steps[0]} Open the dashboard to acknowledge."`
  - cc: `f"FYI {mid}: {fault_label} ({severity}). Assigned to {primary_name}."`, plus `" Repair-vs-replace review suggested."` when the action is `consider_replacement`
  - escalation: `f"ESCALATION {mid}: {fault_label} not acknowledged for {mins} min by {primary_name}. Please take over."`

**`send(person, message, reason, now) -> list[Notification]`:**
- Always return an `in_app` Notification with `delivered=True`.
- **Telegram (stretch):** if `TELEGRAM_BOT_TOKEN` is set and `TELEGRAM_CHAT_IDS` maps this person id, call `httpx.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": cid, "text": message}, timeout=5)` and add a `telegram` Notification. `delivered` is whether the call returned HTTP 200. **Never raise.**
- Chat ids live **only** in env vars, never in the repo.

### `api/alerts.py`

These are the endpoints from 00 §7.3. Use `state.get_engine()` for `sim_time`.

| Endpoint | Behaviour |
|---|---|
| `GET /alerts` | `list_alerts()`, newest first |
| `GET /alerts/{id}` | The alert, or 404 |
| `POST /alerts/{id}/ack` | `ack(...)`; 404 or 409 |
| `POST /alerts/{id}/resolve` | `resolve(...)`; 404 or 409 |
| `GET /people` | `routing.people_now(engine.sim_time)` |
| `GET /manual/{section_id}` | `ManualSection`, or 404 |
| `GET /maintenance/{machine_id}` | Records newest first (empty list if none, 404 if the machine is unknown) |
| `GET /amd/stats` | `llm.stats()` |

**Acceptance (with P1's engine, Fri 18:00):**
1. `POST /api/demo/inject` P-101 bearing_wear.
2. `/api/alerts` shows `ALT-0001` `diagnosing` with the trace growing, then `open`, verified, assigned to `tech-a1`, cc `sup-a1`.
3. Acknowledge → `WO-2026-0412`.
4. Resume (`POST /api/demo/control {"paused": false, "speed": 30}`) → `lead_time_h` is filled later.
5. Resolve → P-101 is `ok` again.
6. Repeat without acknowledging → `escalated` after 120 sim-minutes.

---

## Task 7: Deployment check with P3 (Fri evening)

- Make sure `RADEON_API_KEY` is set as a **secret** in the Hugging Face Space, and that `LOG_DIR=/tmp/logs` is set in the Dockerfile.
- Check the latency from the Space to `developer.amd.com.cn`, using `/api/amd/stats` after one diagnosis. If calls time out from the Space, raise `LLM_TIMEOUT_S` and tell the team immediately. That's a demo risk.

---

## Task 8: Diagnosis eval and prompt tuning (Sat morning, numbers by 12:00)

### `eval/diagnosis_eval.py`

```python
def evaluate(runs: list[ScenarioRun], workers: int = 4) -> dict
```

- Use `ThreadPoolExecutor(workers)`. For each run with an `event`, call `diagnose(run.engine_at_event, run.event, purpose="eval")`.
- **Returns:**
  - `n`
  - `accuracy` (top-1 `fault` vs `scenario.fault`)
  - per-fault accuracy
  - a confusion matrix (rows actual, columns predicted including `other`)
  - `verified_rate`
  - `fallback_count`
  - average and median **diagnosis latency** (sum of LLM `latency_ms` in the trace)
  - average LLM calls per diagnosis
  - average prompt and completion tokens per diagnosis
  - average tokens/s
  - a list of misdiagnosed scenarios (`id`, predicted, confidence, summary)

P1's `run_eval.py` calls this and writes the report.

**Target:** accuracy ≥ 80% and verified_rate ≥ 95%.

**Tuning loop** (keep it honest):
- Read the misdiagnosed summaries first.
- Fix the prompt's reasoning instructions, for example "compare the order in which signals deviated".
- Improve the tool outputs, for example by adding `deviating_since` to every summary.
- Ask P4 to make a manual signature clearer.
- **Never** put the scenario's answer or simulator internals in the prompt.
- Run `python -m eval.run_eval --limit 8` for quick iterations, and the full run once at the end. It costs about 40 diagnoses × 3–6 calls.

---

## Task 9 (stretch, only if done before Sat 14:00): Telegram

1. Create a bot with @BotFather and get the token.
2. The presenter sends any message to the bot.
3. `https://api.telegram.org/bot<token>/getUpdates` shows their `chat.id`.
4. Set `TELEGRAM_CHAT_IDS=tech-a1:<chat_id>` locally and in the Space secrets.

In the video, the phone buzzes when the alert goes out. Don't commit tokens or chat ids.

---

## Your schedule

| When | Do |
|---|---|
| Thu → 23:00 | Task 1 (post results), Task 2 `llm.py`, Task 3 `data.py`, `fake_engine.py` |
| Fri → 13:00 | Tasks 4–5: tools, prompts, validate, fallback, diagnose; headless CLI works |
| Fri → 18:00 | Task 6: alerts service, routing, notify, API; integration with P1 and P3 |
| Fri evening | Task 7 deployment check |
| Sat → 12:00 | Task 8 eval and tuning, numbers to P4 |
| Sat → 14:00 | Task 9 stretch, then feature freeze |

## Pitfalls

- **Don't call the LLM inside `engine.step` or any hook.** Always use the worker thread.
- **Mutate alerts only under the lock.** The API reads them from another thread.
- **Watch the context size.** Truncate tool results, and don't send the full 48 h series, only hourly means.
- **The model invents ids.** That is exactly what validation is for. Never "fix" an invalid ref silently; report it in `validation_errors` and let the retry correct it.
- **Keep the API key out of logs, traces, and error messages** (`str(e)` from the SDK may include headers; trim it).
- **Watch the reasoning-model output.** If `DeepSeek-V4-Flash` returns long reasoning, set `max_tokens` high enough for the final JSON (≥ 1500) and strip reasoning before parsing.
