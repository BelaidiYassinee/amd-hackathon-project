# 04: P4 brief: plant knowledge, alerts and routing, deployment

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are my pair programmer for a 3-day hackathon. Read `00-project-and-contract.md` first. It is the shared spec, and its API contract (§7), engine interface (§8), LLM client interface (§8.1), and seed data (§10) are binding. Then read this brief: it is my part. Work only on the files listed under *You own*. Implement the tasks in order. After each task, run its acceptance check and show me the result before moving on. When you write manual or maintenance content, follow the exact IDs, signal names and fault fingerprints given here, because the software depends on them; write original text and keep all brands and people fictional. If something in the contract looks wrong or missing, tell me instead of changing it; I will coordinate with the team. Keep code simple and readable: this is a demo prototype, not production."

**Owner:** P4 (name: Nassime)

**Your mission:** you own what happens **after** the AI has diagnosed a fault, the knowledge the AI reads, and the live deployment:

1. **Plant knowledge.** Write the pump manual and maintenance history the agent searches, and the loaders that read them. The agent's accuracy depends directly on how clearly the manual describes each fault.
2. **Alerts.** Route the diagnosis to the right on-shift person, then manage acknowledge → work order → resolve, plus escalation when nobody answers.
3. **Deployment.** One Docker image on a Hugging Face Space: the public URL the judges will open.

---

## You own

```
backend/app/data.py
backend/data/manuals/pump_p101.md          (replace P1's placeholder)
backend/data/maintenance_log.json          (replace P1's placeholder)
backend/data/roster.json, spare_parts.json   (after P1's first commit)
backend/app/alerts/__init__.py, service.py, routing.py, notify.py
backend/app/api/alerts.py                  (P1 commits a stub; then it is yours)
backend/tests/test_data.py, test_routing.py, test_alerts.py
Dockerfile, .dockerignore
Hugging Face Space (settings, secrets, pushes) and the front matter block at the top of README.md
```

**Do not touch:** `sim/*`, `detect/*`, `agent/*`, `decide/*`, `api/plant.py`, `api/decide.py`, `main.py`, `state.py`, `models.py`, `frontend/*`, `eval/*`.

## You depend on

| From | What | When | Until then |
|---|---|---|---|
| P1 | Skeleton (stub `api/alerts.py`, placeholders, seed data) | Fri 10:00 | Start with Task 1, which needs nothing |
| P1 | Real `Engine` with hooks (00 §8) | Fri 15:00 | Unit-test with a tiny fake engine |
| P2 | `llm.chat` / `llm.is_mock` / `llm.stats` (00 §8.1) | Fri 12:00 | Use your templates |
| P2 | `diagnose(engine, event, on_step=...)` | Fri 15:00 | A stub that returns the 00 §14.3 diagnosis |
| P3 | `npm run build` works in `frontend/` | Fri 20:00 | Build the backend-only image first |

## Others depend on you

| Who | Needs | By |
|---|---|---|
| P2 | `data.py` loaders, real manual, real maintenance log | **Fri 12:00** |
| P3 | `/api/alerts*`, `/api/people`, `/api/manual/{id}`, `/api/maintenance/{id}`, `/api/amd/stats` (shapes as in 00 §14) | Fri 19:00 |
| P2 | `data.corrective_last_12m` for repair vs. replace | Fri 12:00 (part of `data.py`) |
| Whole team | Deployed URL with the full loop | **Fri 23:00** |

---

## Task 1: Plant knowledge (now, done by Fri 12:00)

Do this first: it depends on nobody, and P2 needs it.

### 1a. `backend/app/data.py`: loaders

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

Push `data.py` as soon as it works with P1's placeholder files, so P2 can build on it. Then write the real content.

### 1b. The pump manual (`backend/data/manuals/pump_p101.md`)

This is a fictional manual for the **AquaFlow CP-80** end-suction centrifugal pump that feeds the plant's cooling loop. The agent searches it with keyword search (BM25), and the backend checks that every manual reference the agent cites exists. So:

- **Format.** Each section starts with exactly `## [ID] Title`, using the 13 IDs and titles from 00 §10.4, in that order. Nothing else may use `## [`.
- **Signal names.** Mention the exact signal name in parentheses every time you mention a sensor, e.g. "high-frequency vibration energy (`vibration_hf`)". Keyword search relies on it.
- **Troubleshooting section structure.** Every `TS` section uses the same sub-headings, in this order: **Symptoms** (in the order they appear) · **Typical progression** · **Likely causes** · **What to do** (numbered steps with section references such as `(P101-PR-01)`) · **Parts** (exact part numbers from 00 §10.2) · **Category** (mechanical / electrical / process) · **Do not confuse with**.
- **Length and style.** Write 120–300 words per section, in the plain, practical style of a technician's manual. Write original text.

#### Required facts per section

These must match P1's simulator. If you change any fact, tell P1 and P2.

**`P101-OV-01` Overview and specifications**
- **Use:** end-suction centrifugal pump in the cooling loop.
- **Duty point:** 120 m³/h at 42 m head.
- **Motor:** 30 kW, 400 V, 2950 rpm; normal current about 52 A.
- **Bearings:** drive end 6309 C3 (`BRG-6309-C3`), non-drive end 6308 C3 (`BRG-6308-C3`). Grease EP2 (`GREASE-EP2`), re-greasing every 2,000 operating hours.
- **Seal and coupling:** mechanical seal 45 mm (`SEAL-M80`); flexible coupling element (`CPL-ELEM-80`).
- **Monitored signals with normal ranges:**

  | Signal | Normal range |
  |---|---|
  | `vibration_rms` | 1.5–2.5 mm/s |
  | `vibration_hf` | 0.25–0.35 g |
  | `bearing_temp` | 50–60 °C |
  | `motor_temp` | 65–80 °C |
  | `motor_current` | 48–56 A |
  | `discharge_pressure` | 4.0–4.4 bar |
  | `flow` | 112–128 m³/h |

- **Legacy alarm limits:**

  | Signal | Limit |
  |---|---|
  | `vibration_rms` | > 7.1 mm/s |
  | `bearing_temp` | > 85 °C |
  | `motor_temp` | > 120 °C |
  | `motor_current` | > 62 A |
  | `discharge_pressure` | < 3.3 bar |
  | `flow` | < 100 m³/h |

  Say explicitly that `vibration_hf` is **not** covered by the legacy alarm system.

**`P101-TS-01` Troubleshooting: bearing wear**
- **Symptoms:**
  1. `vibration_hf` rises first, a clear early sign while everything else is normal.
  2. `vibration_rms` increases in the later stage.
  3. `bearing_temp` climbs near the end.
  4. `motor_current` rises slightly just before seizure.

  Flow and pressure stay normal.
- **Typical progression:** about **2 days (48 h)** at full load from the first `vibration_hf` rise to bearing seizure.
- **Causes:** missed or insufficient lubrication, contaminated grease, end of bearing life, over-greasing.
- **What to do:**
  1. Confirm with a handheld analyser.
  2. Re-grease now to slow the damage (P101-PR-03).
  3. Plan a stop within 24 h.
  4. Lockout/tagout (P101-SAF-01).
  5. Replace the bearings (P101-PR-01).
  6. Check alignment (P101-PR-02).
  7. Test run.
- **Parts:** `BRG-6309-C3`, `BRG-6308-C3`, `GREASE-EP2`.
- **Category:** mechanical.
- **Do not confuse with:** misalignment (TS-03), where vibration rises **together with** bearing temperature and current while `vibration_hf` stays low; or impeller imbalance (TS-05), where there is no `vibration_hf` rise.

**`P101-TS-02` Troubleshooting: cavitation**
- **Symptoms:** `discharge_pressure` drops **and fluctuates**; `flow` drops; `vibration_rms` rises with broadband noise and a crackling, gravel-like sound; `vibration_hf` rises moderately; `motor_current` **drops**, because the pump does less work. Temperatures stay normal.
- **Typical progression:** from hours up to about **1 day (20 h)** before impeller erosion and loss of cooling flow.
- **Causes:** low suction tank level, clogged suction strainer (`STR-DN125`), partly closed suction valve, coolant too hot, air ingress.
- **What to do:** check the tank level and suction valve, clean the strainer (P101-PR-04), reduce flow demand, check suction conditions.
- **Parts:** `STR-DN125`.
- **Category:** process.
- **Do not confuse with:** bearing wear (TS-01), where pressure and flow stay normal; or seal leak (TS-06).

**`P101-TS-03` Troubleshooting: shaft misalignment**
- **Symptoms:** `vibration_rms` rises steadily (strong at 1× and 2× running speed, axial direction); `bearing_temp` rises moderately on both bearings; `motor_current` and `motor_temp` rise slightly. `vibration_hf` rises only a little.
- **Typical progression:** about **3 days (72 h)** before coupling or bearing damage.
- **Causes:** after maintenance work, base settling, soft foot, thermal growth, worn coupling element.
- **What to do:** lockout/tagout (P101-SAF-01), inspect the coupling element, laser alignment (P101-PR-02), soft-foot check, shims.
- **Parts:** `CPL-ELEM-80`, `SHIM-KIT-80`.
- **Category:** mechanical.
- **Do not confuse with:** bearing wear (TS-01), or impeller imbalance (TS-05), where temperatures and current don't change.

**`P101-TS-04` Troubleshooting: motor overheating**
- **Symptoms:** `motor_temp` rises steadily **together with** `motor_current`; vibration (`vibration_rms`, `vibration_hf`) stays **normal**; `bearing_temp` rises only slightly from motor heat.
- **Typical progression:** about **1.5 days (36 h)** before thermal trip or insulation damage.
- **Causes:** blocked cooling fan cover or dirty cooling fins, damaged fan (`FAN-MTR-30`), supply voltage imbalance, overload, insulation ageing.
- **What to do:** check and clean the fan and fins (P101-PR-05), measure phase voltages and currents, test insulation resistance (P101-PR-05), reduce load if possible.
- **Parts:** `FAN-MTR-30`.
- **Category:** electrical.
- **Do not confuse with:** bearing wear, where vibration changes.

**`P101-TS-05` Troubleshooting: impeller imbalance** (a realistic distractor)
- **Symptoms:** `vibration_rms` rises at 1× running speed, radial direction. **No** `vibration_hf` rise; temperatures and current normal.
- **Typical progression:** slow, weeks.
- **Causes:** deposits, erosion, broken vane.
- **What to do:** inspect and clean the impeller; balance or replace (`IMP-CP80`, 21-day lead time).
- **Category:** mechanical.

**`P101-TS-06` Troubleshooting: mechanical seal leak** (a distractor)
- **Symptoms:** visible leakage at the seal and a slow drop in coolant tank level. Sensors are mostly normal; later, possible bearing contamination.
- **What to do:** replace the seal (`SEAL-M80`, currently out of stock, 9-day lead time).
- **Category:** mechanical.

**`P101-PR-01` Procedure: bearing replacement**
- **Effort:** 6–8 h, 2 technicians.
- **Steps:** lockout/tagout → close valves and drain → remove the coupling guard and decouple → remove the bearing covers → pull the bearings → clean and inspect the shaft → heat the new bearing (induction heater, max 110 °C) → mount → fill grease to 1/3 → reassemble → alignment check (PR-02) → test run 30 min, confirming `vibration_hf` is back near baseline.

**`P101-PR-02` Procedure: laser shaft alignment**
- **Steps:** lockout/tagout, soft-foot check (≤ 0.05 mm), mount the laser heads, measure, correct with shims, re-measure.
- **Tolerances** for 3000 rpm: offset ≤ 0.05 mm, angularity ≤ 0.05 mm per 100 mm.
- Record the final readings.

**`P101-PR-03` Procedure: lubrication (re-greasing)**
- **Interval:** every 2,000 operating hours. **Amount:** about 20 g per bearing of `GREASE-EP2`.
- **Don't over-grease.** Record it in the maintenance system.
- **Note:** for early-stage bearing wear, re-greasing slows the damage but does **not** repair it.

**`P101-PR-04` Procedure: suction side inspection and strainer cleaning**
- **Steps:** lockout/tagout, close the suction valve, open the strainer housing, clean or replace the basket (`STR-DN125`), check the gasket, refill and vent, and confirm `discharge_pressure` and `flow` return to normal.

**`P101-PR-05` Procedure: motor cooling and insulation checks**
- **Steps:** lockout/tagout, clean the fan cover and fins, inspect or replace the fan (`FAN-MTR-30`), measure phase voltages (imbalance ≤ 1%) and currents, and run an insulation resistance test at 500 V DC (≥ 100 MΩ is good).

**`P101-SAF-01` Safety: lockout/tagout before any work**
- **Steps:** notify the control room → stop the pump → open and lock the breaker, with a personal lock and tag → try-start to verify zero energy → close and lock suction and discharge valves → relieve pressure and drain → beware hot surfaces (> 60 °C) and residual coolant → remove locks only when the work is complete and guards are back.

### 1c. Maintenance history (`backend/data/maintenance_log.json`)

This is a JSON array of `MaintenanceRecord` objects (00 §7.1): `id`, `machine_id`, `date` (YYYY-MM-DD), `type` (`preventive` | `corrective` | `inspection` | `missed_pm`), `title`, `description` (1–3 sentences), `parts` (part numbers), `cost_eur`, `downtime_h`, and `technician_id` (a roster id from 00 §10.1, or null).

**Must contain, exactly**, the six P-101 records from 00 §10.5, with these details:

| id | parts | cost_eur | downtime_h | technician_id | description idea |
|---|---|---|---|---|---|
| `WO-2025-0871` | `BRG-6309-C3`, `GREASE-EP2` | 1850 | 7 | tech-a1 | Noise from the drive end; bearing showed pitting; replaced. |
| `WO-2025-1104` | `CPL-ELEM-80` | 620 | 3 | tech-b1 | Cracked coupling element found during a routine check. |
| `WO-2026-0153` | `SEAL-M80` | 1240 | 6 | tech-a1 | Seal leak, about 2 L/h; seal replaced. |
| `WO-2026-0418` | `SHIM-KIT-80` | 780 | 4 | tech-c1 | Vibration complaint; 0.18 mm offset found and corrected by laser alignment. |
| `PM-2026-0702` | – | 0 | 0 | null | Scheduled re-greasing skipped: production priority, line could not stop. |
| `WO-2026-0901` | – | 120 | 0 | tech-a1 | Quarterly route: overall vibration 2.1 mm/s, bearing temperature 56 °C, OK. |

**Add more history** (about 15–25 more records) so it looks real:
- **P-101:** commissioning on 2017-03-14; yearly inspections 2018–2025; re-greasing PMs about every 4 months; one old corrective, e.g. "impeller cleaned, deposits" in 2022.
- **P-102, C-201, M-301:** 3–5 records each (filter changes, belt replacement, oil change, inspections).

⚠️ **Do not add any other P-101 `corrective` record dated after 2025-10-15.** The demo needs exactly 3 corrective repairs in the last 12 months. Keep ids unique, in the `WO-YYYY-NNNN` / `PM-YYYY-NNNN` format.

**Acceptance (`test_data.py`):**
- `manual_sections()` has the 13 IDs from 00 §10.4.
- `maintenance_log.json` validates as a list of `MaintenanceRecord`.
- `corrective_last_12m("P-101", datetime(2026, 10, 15, tzinfo=timezone.utc)) == 3`.
- Once P2's `search_manual` exists, check these queries return the right section first:

  | Query | First result |
  |---|---|
  | "high frequency vibration rising bearing temperature" | `P101-TS-01` |
  | "discharge pressure dropping flow falling noise" | `P101-TS-02` |
  | "motor temperature current rising vibration normal" | `P101-TS-04` |

Push and post in chat: "manual + history on main".

---

## Task 2: Alerts, routing and notifications (Fri, integrate by 19:00)

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
except RuntimeError:            # no event loop (tests): run inline
    _pipeline(alert.id, generation)
```

**`_pipeline(alert_id, gen)`** (runs in a worker thread):
1. Call P2's `diagnose(engine, event, on_step=append_to_alert_trace)`. It returns `DiagnosisResult(diagnosis, trace, calls, used_fallback, error)`. Store the diagnosis, trace, and error.
2. Route with `routing.pick(...)` → primary and cc list. Set `assignee`.
3. Notify: `notify.compose(...)` then `notify.send(...)` for the primary (`reason="primary"`) and each cc (`reason="cc"`). Append the Notifications.
4. Set `state="open"`, but only if `gen` is still current.

Until P2's `diagnose` is merged, use a stub that sleeps 2 s, appends two fake trace steps, and returns the diagnosis from 00 §14.3.

**`on_threshold(machine_id, t, signal)`:**
- Find the newest alert for that machine whose state is not `rejected`.
- Set `threshold_alarm_at`, `threshold_signal`, and `lead_time_h = round((t - event.detected_at).total_seconds() / 3600, 1)`.

**`on_tick(now)`:**
- For each alert in `open` where `now - created_at ≥ ESCALATE_AFTER_MIN`: set `state="escalated"`.
- Notify the on-shift supervisor with `reason="escalation"`, using the template message.
- The engine auto-pauses while the AI diagnoses, so `created_at` is the right reference.

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
- Append `{alert_id, machine_id, predicted, actual, correct, at}` to `LOG_DIR/feedback.jsonl` (create the dir; ignore write errors). This is the "learning loop" the pitch mentions.

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
| 09:40, P-101 (area "Cooling loop"), mechanical | Sara Benali (`tech-a1`) |
| Same, with action `consider_replacement` | cc Karim Ouali (`sup-a1`) |
| 23:00, process | Giulia Romano (`sup-c1`); shift C has no process engineer |
| 15:00, electrical | Elena Conti (`tech-b2`) |

### `alerts/notify.py`

**`compose(person, alert, reason) -> str`:**
- **`primary`:** one LLM call with P2's `llm.chat(..., purpose="alert_message", max_tokens=150)`. Prompt:

  "Write a phone notification for {name} ({role}). Max 300 characters, plain text, no markdown. Include the machine id and name, the fault in plain words, the severity, the estimated time to failure if known, and the first action. End with 'Open the dashboard to acknowledge.' Use only facts from this JSON: {fault_label, severity, est_time_to_failure_h, fix_steps[0], machine}."

  Truncate to 300 characters. If `llm.is_mock()` or `LlmError`, use the template.
- **Templates:**
  - primary: `f"{mid} {mname}: {fault_label} ({severity}{', ~%d h to failure' % ttf if ttf else ''}). First step: {fix_steps[0]} Open the dashboard to acknowledge."`
  - cc: `f"FYI {mid}: {fault_label} ({severity}). Assigned to {primary_name}."`, plus `" Repair-vs-replace review suggested."` when the action is `consider_replacement`
  - escalation: `f"ESCALATION {mid}: {fault_label} not acknowledged for {mins} min by {primary_name}. Please take over."`

**`send(person, message, reason, now) -> list[Notification]`:**
- Always return an `in_app` Notification with `delivered=True`.
- Add Telegram in Task 5 (stretch).

### `api/alerts.py` (your router; `main.py` already includes it under `/api`)

| Endpoint | Behaviour |
|---|---|
| `GET /alerts` | `list_alerts()`, newest first |
| `GET /alerts/{id}` | The alert, or 404 |
| `POST /alerts/{id}/ack` | `ack(...)`; 404 or 409 |
| `POST /alerts/{id}/resolve` | `resolve(...)`; 404 or 409 |
| `GET /people` | `routing.people_now(engine.sim_time)` |
| `GET /manual/{section_id}` | `ManualSection`, or 404 |
| `GET /maintenance/{machine_id}` | Records newest first (empty list if none, 404 if the machine is unknown) |
| `GET /amd/stats` | P2's `llm.stats()` |

**Acceptance (with P1's engine, Fri 19:00):**
1. `POST /api/demo/inject {"machine_id": "P-101", "fault": "bearing_wear"}`.
2. `/api/alerts` shows `ALT-0001` `diagnosing` with the trace growing, then `open`, verified, assigned to `tech-a1`, cc `sup-a1`.
3. Acknowledge → `WO-2026-0412`.
4. Resume (`POST /api/demo/control {"paused": false, "speed": 30}`) → `lead_time_h` is filled later.
5. Resolve → P-101 is `ok` again.
6. Repeat without acknowledging → `escalated` after 120 sim-minutes.

---

## Task 3: Docker and Hugging Face Space (Fri evening, live URL by 23:00)

### `Dockerfile` (repo root)

```dockerfile
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY eval/ eval/
COPY --from=web /web/dist frontend/dist
ENV PORT=7860 LOG_DIR=/tmp/logs PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
```

### `.dockerignore`

```
**/node_modules
frontend/dist
.venv
.git
.env
backend/logs
**/__pycache__
docs
```

**Local check:**

```bash
docker build -t mc .
docker run --rm -p 7860:7860 --env-file .env mc
```

Open http://localhost:7860: the UI is served by FastAPI and the full loop works.

### Hugging Face Space

1. **Create the Space:** huggingface.co → New Space → SDK **Docker** → Blank → **Public** (judges must open it) → name e.g. `maintenance-copilot`.
2. **Secrets:** Settings → *Variables and secrets* → add **secret** `RADEON_API_KEY`. Add variables `AGENT_MODE` (from P2's check) and `LLM_MODEL`. Never paste the key anywhere else.
3. **README front matter:** a Space needs this block at the **top** of `README.md`. Add it, and keep it at the top (GitHub just renders it as a small table):

   ```
   ---
   title: Operion
   emoji: 🛠️
   colorFrom: red
   colorTo: gray
   sdk: docker
   app_port: 7860
   pinned: false
   ---
   ```

4. **Push:**
   ```bash
   git remote add space https://huggingface.co/spaces/<user>/<space>
   git push space main
   ```
   - Log in with your HF username and an access token with **write** scope as the password; the token is yours to create.
   - **If the push is rejected for binary files** (PNG/GIF in the repo), track them with LFS: `git lfs install`, `git lfs track "*.png" "*.jpg" "*.gif"`, commit `.gitattributes`, and push again.
5. **Watch the build logs** in the Space. When it shows *Running*, open the URL **from your phone** and run the full demo once.
6. **Check AMD latency from the Space.** After one diagnosis, `/api/amd/stats` shows the latency to `developer.amd.com.cn`. If calls time out from the Space, raise `LLM_TIMEOUT_S` and tell P2 immediately. That's a demo risk.
7. **Post the URL** in the team chat.

**Backup host:** if HF fails, use Render.com (New → Web Service → connect the GitHub repo → Docker → env var `RADEON_API_KEY`). The free tier sleeps after idle, so open it before judging.

**Notes:**
- State is in memory: a Space restart resets the demo. That's fine, because the reset state is the clean demo start.
- Redeploy after every merge to `main` that touches the app, at least at each checkpoint (00 §12).

---

## Task 4: QA on the deployed URL (Fri night after deploy, again Sat 12:00)

On a laptop **and** a phone, run this checklist. Report bugs to the owner in the team chat with steps to reproduce.

- [ ] The page loads, the clock ticks, and 4 machines are green.
- [ ] Inject P-101 bearing wear → an alert within about 10 s at default speed → the trace grows → a diagnosis appears, verified, assigned to Sara Benali.
- [ ] Each evidence type opens the right thing (chart highlight, manual, history record, part).
- [ ] Acknowledge → work order. Resume at speed 30 → lead-time banner.
- [ ] Resolve → P-101 is green again.
- [ ] Reset → inject again → do **not** acknowledge, resume → escalation to Karim Ouali.
- [ ] Inject cavitation and motor_overheat on P-101 → sensible diagnoses (the process engineer / electrical technician get them).
- [ ] The AMD panel shows real (not mock) calls.
- [ ] Repair vs. replace shows AF-CP80-G2 as rank 1, payback 15.0 months, and "Numbers checked ✓".

---

## Task 5 (stretch, only if done before Sat 14:00): Telegram alerts

In `notify.send`, if `TELEGRAM_BOT_TOKEN` is set and `TELEGRAM_CHAT_IDS` maps this person id:
- Call `httpx.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": cid, "text": message}, timeout=5)`.
- Add a `telegram` Notification. `delivered` is whether the call returned HTTP 200. **Never raise.**

**Setup:**
1. Create a bot with @BotFather and get the token.
2. The presenter sends any message to the bot.
3. `https://api.telegram.org/bot<token>/getUpdates` shows their `chat.id`.
4. Set `TELEGRAM_CHAT_IDS=tech-a1:<chat_id>` locally and in the Space secrets.

Chat ids and tokens live **only** in env vars, never in the repo. In the video, the phone buzzes when the alert goes out.

---

## Your schedule

| When | Do |
|---|---|
| Fri → 12:00 | Task 1: `data.py` (push early), manual, maintenance log |
| Fri → 19:00 | Task 2: alerts service, routing, notify, API (stub `diagnose` until P2's lands at 15:00) |
| Fri → 23:00 | Task 3: Docker + HF Space live, URL to team; Task 4 QA pass |
| Sat → 12:00 | Task 4 QA again after P2's repair-vs-replace and P1's eval land; redeploy |
| Sat → 14:00 | Task 5 stretch (Telegram), final redeploy; then freeze |

## Pitfalls

- **Don't call the LLM inside `engine.step` or any hook.** Always use the worker thread.
- **Mutate alerts only under the lock.** The API reads them from another thread.
- **Keep the API key out of logs, traces, and error messages** (`str(e)` from the SDK may include headers; trim it).
- **Use timezone-aware datetimes everywhere.** Comparing naive and aware datetimes crashes.
- **Run one uvicorn worker only.** All state is in memory.
