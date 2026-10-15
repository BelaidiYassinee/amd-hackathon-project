# 02: P2 brief: AI agent on AMD, evidence validation, repair vs. replace

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are my pair programmer for a 3-day hackathon. Read `00-project-and-contract.md` first. It is the shared spec, and its API contract (§7), engine interface (§8), LLM client interface (§8.1), and seed data (§10) are binding. Then read this brief: it is my part. Work only on the files listed under *You own*. Implement the tasks in order. After each task, run its acceptance check and show me the result before moving on. If something in the contract looks wrong or missing, tell me instead of changing it; I will coordinate with the team. Keep code simple and readable: this is a demo prototype, not production."

**Owner:** P2 (name: ____________)

**Your mission:** you own **the AI**, the part that runs on AMD and that judges will look at hardest. When the detector raises an anomaly, your agent investigates with tools on the **AMD Radeon API** and returns a diagnosis where every claim is backed by evidence that the backend **verifies**. You also own the second AI feature, repair vs. replace: a 5-year cost comparison with an AI-written justification whose numbers are machine-checked. P4 takes your diagnosis from there (routing, alerts, deployment).

**What judges must be able to see:**
1. what the AI did (the trace)
2. what data supports its conclusion (validated evidence)
3. that it ran on AMD (model, endpoint, latency, tokens)

---

## You own

```
backend/app/agent/__init__.py, llm.py, tools.py, prompts.py, validate.py, fallback.py, diagnose.py
backend/app/decide/__init__.py, decide/replace.py
backend/app/api/decide.py                 (P1 commits a stub in the skeleton; then it is yours)
backend/data/catalog.json                 (after P1's first commit)
backend/tests/fake_engine.py, test_llm.py, test_tools.py, test_validate.py, test_replace.py
scripts/check_radeon.py
eval/diagnosis_eval.py
```

You also delete `test.py` once `llm.py` works.

**Do not touch:** `sim/*`, `detect/*`, `alerts/*`, `data.py`, `api/plant.py`, `api/alerts.py`, `main.py`, `state.py`, `models.py`, `frontend/*`.

## You depend on

| From | What | When |
|---|---|---|
| P1 | Skeleton | Fri 10:00 |
| P1 | Real `Engine` | Fri 15:00. Until then use your `fake_engine.py` |
| P4 | `backend/app/data.py` loaders, real manual and maintenance log | Fri 12:00. Until then read P1's placeholder files directly |

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Team | Radeon API capability check results in chat | **Fri 11:00** |
| P4 | `llm.chat` / `llm.is_mock` / `llm.stats` (00 §8.1), for alert messages and `/api/amd/stats` | Fri 12:00 |
| P4 | `diagnose(engine, event, on_step=...)` returning `DiagnosisResult` (Task 5) | **Fri 15:00** |
| P3 | `/api/machines/{id}/replace-analysis` (shape as 00 §14.4) | Sat 11:00 |
| P1 | `eval/diagnosis_eval.evaluate(runs, workers)` and accuracy numbers | Sat 12:00 |

---

## Task 1: Radeon API capability check (Fri, first thing, post by 11:00)

Create `scripts/check_radeon.py` (run it with `python scripts/check_radeon.py` from the repo root). It loads `.env`, builds an `openai.OpenAI(base_url=LLM_BASE_URL, api_key=RADEON_API_KEY)`, and runs 5 checks. Print a summary table. **Never print the key.**

1. **`client.models.list()`:** print the model ids. Flag any id containing `gemma`; if one exists, tell the team, because it may matter for the Google prize.
2. **Plain chat:** "Reply with the single word OK." Print the latency, `usage`, and content.
3. **Tool calling:** define one tool `get_weather(city: str)` and ask "What is the weather in Rome? Use the tool." Check whether `message.tool_calls` comes back. Then send a fake tool result back and check whether the model answers in text.
4. **JSON mode:** `response_format={"type": "json_object"}`, asking for `{"ok": true}`. Does it parse? Does the API reject the parameter?
5. **Reasoning output:** does `message.content` contain `<think>` blocks? Does the message have a `reasoning_content` attribute?

**Decision:**
- If check 3 works reliably (run it 3 times), use `AGENT_MODE=tools`.
- Otherwise use `AGENT_MODE=prefetch`; the trace UI looks the same either way.
- Post the table and the decision in the team chat.

---

## Task 2: LLM client with AMD call log (`agent/llm.py`, Fri, by 12:00)

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

## Task 3: Fake engine for tests (`backend/tests/fake_engine.py`, Fri morning)

This keeps you unblocked until P1's engine lands at 15:00.

This is a small class with the **read** methods of the 00 §8 `Engine`:
- `sim_time`, `ewma_limit`, `machine_ids`, `machine_cfg`, `signal_specs`, `samples`, `baseline`, `contributions`, `is_failed`, and `threshold_alarm`
- no-op write methods, and the empty hook lists

Return data shaped like the 00 §14 examples for P-101: 48 h of samples with `vibration_hf` rising during the last 2 h, and the contributions list from §14.3. Switch your tests to the real engine once P1 merges it; keep the fake for fast unit tests.

**Data access:** read roster, maintenance, parts and manual through P4's `backend/app/data.py` (00 §4): `maintenance(id)`, `corrective_last_12m(id, now)`, `parts(id)`, `part(no)`, `manual_sections()`, `catalog()`. Until P4 pushes it (Fri 12:00), read P1's placeholder JSON and markdown directly behind a tiny local helper you delete later.

---

## Task 4: Agent tools (`agent/tools.py`, Fri, by 13:00)

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

## Task 5: The diagnosis agent (Fri, headless by 15:00)

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
1. Build a real `Engine(seed, only=["P-101"])` (or `fake_engine` before Fri 15:00).
2. Disable auto-pause, inject at the live start + 1 h, and step until the first event.
3. Run `diagnose`, then print the trace steps and the final JSON.

**Acceptance:**
- For each of the 4 faults the CLI returns `verified: true`, and the right fault at least 3 times out of 4.
- With `LLM_MOCK=1`, it returns the fallback instantly.

---

## Task 6: Repair vs. replace (`decide/replace.py` + `api/decide.py`, Fri evening, endpoint by Sat 11:00)

**Endpoint:** your router `api/decide.py` (`router = APIRouter()`; `main.py` includes it under `/api`) serves `POST /machines/{id}/replace-analysis`: `ReplaceRequest` → `ReplaceAnalysis`. Unknown machine → 404; machine without a `duty` → 400. Get the engine with `state.get_engine()`.

**Inputs:**
- `machines.yaml` via `engine.machine_cfg(id)`: `duty` and `installed`.
- `catalog.json`: `assumptions`, `repair_estimates[fault]`, and `candidates`.
- P4's `data.corrective_last_12m(machine_id, engine.sim_time)` and `data.catalog()`.
- The machine must have a `duty`, else return 400.
- The request's `fault` defaults to `"bearing_wear"` (00 §7.1 `ReplaceRequest`).

**Formulas:**

```
P_hyd_kW          = flow_m3h * head_m / 367.2
energy_year(eff)  = P_hyd_kW / (eff / 100) * hours_per_year * energy_eur_per_kwh
H                 = horizon_years;  C = corrective_repairs_last_12m;  D = downtime_eur_per_h

REPAIR  (option_id "repair", kind "repair", label "Repair current pump (<repair label>)")
  repair label: bearing_wear "bearing replacement", cavitation "suction-side fix",
                misalignment "realignment + coupling", motor_overheat "motor cooling repair", other "general repair"
  capex        = parts_eur + labor_eur
  energy_5y    = energy_year(efficiency_after_pct) * H
  maint_5y     = base_maintenance_eur_year * (1 + maintenance_factor_per_corrective * C) * H
  downtime_5y  = failures_per_corrective_repair * C * hours_per_failure * D * H  +  downtime_h * D
  efficiency   = efficiency_after_pct; lead_time_days = repair lead_time_days; fits_duty = True

REPLACE (each candidate)
  capex        = price_eur + install_eur
  energy_5y    = energy_year(efficiency_pct) * H
  maint_5y     = maintenance_eur_year * H
  downtime_5y  = failures_per_year_new * hours_per_failure * D * H  +  install_downtime_h * D
  fits_duty    = rated_flow_m3h >= duty.flow_m3h and rated_head_m >= duty.head_m

tco_5y      = capex + energy_5y + maint_5y + downtime_5y
score       = 0 if not fits_duty else 100 * min_tco_of_fitting_options / tco_5y   (1 decimal)
rank        = fitting options by tco ascending, then non-fitting by tco ascending
payback     = only if rank-1 is a replacement:
              annual_op(option) = (energy_5y + maint_5y + downtime_5y - one_off_downtime) / H
                 where one_off_downtime = downtime_h*D (repair) or install_downtime_h*D (replace)
              upfront(option)   = capex + one_off_downtime
              payback_months    = 12 * (upfront(best) - upfront(repair)) / (annual_op(repair) - annual_op(best))   (1 decimal)
```

**Rounding:** round EUR fields to whole euros at the end, computing totals from unrounded parts.

**`assumptions` in the response:** include every key from `catalog.json` plus `corrective_repairs_last_12m` (int) and `age_years` (1 decimal).

**`fit_notes` templates:**
- Fitting: `"Meets {flow} m3/h at {head} m (rated {rf} m3/h at {rh} m)"`, plus `"; same footprint."` or `"; {notes}"` if not footprint-compatible.
- Not fitting: `"Rated {rf} m3/h at {rh} m: below the {flow} m3/h at {head} m duty."`
- Repair: `"Keeps the {age:.0f}-year-old pump; {C} corrective repairs in the last 12 months."`

**Test oracle (`test_replace.py`).** For P-101, fault `bearing_wear`, sim date 2026-10-15, and the 00 §10 seed data, results must match **00 §14.4** to ±1 €:

| option | capex | energy_5y | maint_5y | downtime_5y | tco_5y | score | rank |
|---|---|---|---|---|---|---|---|
| AF-CP80-G2 | 16,300 | 100,159 | 4,500 | 21,600 | 142,559 | 100.0 | 1 |
| HX-NB100 | 15,400 | 108,997 | 5,500 | 36,000 | 165,897 | 85.9 | 2 |
| repair | 1,400 | 123,529 | 13,125 | 63,600 | 201,654 | 70.7 | 3 |
| VT-ECO75 | 9,900 | 121,504 | 6,000 | 21,600 | 159,004 | 0.0 | 4 |

The test also checks `payback_months == 15.0` and `recommendation == "AF-CP80-G2"`.

### Justification (one LLM call on AMD)

**Messages:**

```
system: You explain a maintenance investment decision to a plant maintenance supervisor.
        Write exactly 3 sentences of plain text, no markdown, no lists.
        Use ONLY numbers that appear in the JSON you are given. Do not invent or estimate new numbers.
        Mention the recommended option, its 5-year cost versus repairing, the main reason (energy, downtime
        or reliability), the payback if given, and any cheaper option that does not fit the duty point.
user:   <the ReplaceAnalysis options, duty, assumptions and payback as compact JSON, numbers rounded>
```

Call `llm.chat(messages, purpose="replace_justification", temperature=0.2, max_tokens=300)`.

**Verify the numbers:**
1. Extract every number in the text with regex `\d[\d,]*(?:\.\d+)?`. Strip commas.
2. The allowed set contains:
   - every numeric field of every option
   - all `duty` and `assumptions` values
   - `payback_months` and its rounded integer
   - `12` and `5`
   - pairwise differences of `tco_5y_eur` and of `capex_eur`
3. A number passes if it is within 1% (or ±0.5) of an allowed value, or of an allowed value divided by 1000 (for "€142.6k").

If anything fails, retry once and tell the model which numbers were not allowed. If it fails again, or `llm.is_mock()`, or `LlmError` → use a **template**:

```
"{best.label} has the lowest 5-year cost at €{best.tco:,.0f}, against €{repair.tco:,.0f} to repair the current pump."
+ " It pays back the extra upfront cost in about {payback:.0f} months." (if payback)
+ " {unfit.label} is cheaper to buy but cannot meet the {flow:.0f} m3/h at {head:.0f} m duty." (first non-fitting, if any)
```

(If repair is rank 1: "Repairing is the cheapest option over 5 years at €X; the best replacement, Y, would cost €Z.")

`justification_verified` is true for the template, and true for LLM text that passed the check.

**Acceptance:** `test_replace.py` passes, and `POST /api/machines/P-101/replace-analysis {}` returns the numbers above with a verified justification. Tell P3 it's live.

---

## Task 7: Diagnosis eval and prompt tuning (Sat morning, numbers by 12:00)

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

## Your schedule

| When | Do |
|---|---|
| Fri → 11:00 | Task 1 (post results in chat) |
| Fri → 12:00 | Task 2 `llm.py`, delete `test.py`; Task 3 `fake_engine.py` |
| Fri → 15:00 | Tasks 4–5: tools, prompts, validate, fallback, diagnose; headless CLI works; tell P4 `diagnose()` is ready |
| Fri → 19:00 | Integration with P1, P3 and P4; fix what the live loop shows |
| Fri evening | Task 6 repair vs. replace (math + oracle test first, then the justification) |
| Sat → 11:00 | Task 6 endpoint live, tell P3 |
| Sat → 12:00 | Task 7 eval and tuning, numbers in chat |
| Sat 14:00 | Feature freeze, then bug fixes only |

## Pitfalls

- **`diagnose()` runs in P4's worker thread.** Keep it synchronous and thread-safe; never call it from `engine.step` or a hook.
- **Watch the context size.** Truncate tool results, and don't send the full 48 h series, only hourly means.
- **The model invents ids.** That is exactly what validation is for. Never "fix" an invalid ref silently; report it in `validation_errors` and let the retry correct it.
- **Keep the API key out of logs, traces, and error messages** (`str(e)` from the SDK may include headers; trim it).
- **Watch the reasoning-model output.** If `DeepSeek-V4-Flash` returns long reasoning, set `max_tokens` high enough for the final JSON (≥ 1500) and strip reasoning before parsing.
