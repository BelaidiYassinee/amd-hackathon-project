# 03: P3 brief: dashboard (React) and deployment

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are my pair programmer for a 3-day hackathon. Read `00-project-and-contract.md` first. It is the shared spec, and its API contract (§7, especially `types.ts` in §7.2) and the example payloads (§14) are binding. Then read this brief: it is my part. Work only on the files listed under *You own*. Implement the tasks in order. After each task, run its acceptance check and show me the result before moving on. Use only the libraries listed here. If something in the contract looks wrong or missing, tell me instead of changing it; I will coordinate with the team. Keep code simple and readable: this is a demo prototype, not production."

**Owner:** P3 (name: ____________)

**Your mission:** build the single-page dashboard the judges will watch in the video and click through on the live URL. It must make three things obvious at a glance:

1. **the AI caught the fault early**, with the AI marker well before the legacy alarm marker on the chart
2. **what the AI did and which data backs it**, through the evidence list and the agent trace
3. **that it ran on AMD**, via the AMD inference chip and panel

You also own the Docker image and the Hugging Face Space deployment.

---

## You own

```
frontend/**            (Vite + React 18 + TypeScript + Tailwind 3 + Recharts + lucide-react + clsx)
Dockerfile
.dockerignore
Hugging Face Space setup (secrets, pushes)
```

**Do not touch:** anything in `backend/`, `eval/`, or `docs/`. For `README.md`, only the Space front matter block, coordinated with P4.

## You depend on

| From | What | When |
|---|---|---|
| P1 | Stub API (00 §14 payloads) | Thu 21:00 |
| P1 | Live `/api/plant`, `/series`, `/demo/*` | Fri 13:00 |
| P1 | `/replace-analysis` | Sat 10:00 |
| P2 | `/api/alerts*`, `/api/people`, `/api/manual`, `/api/maintenance`, `/api/amd/stats` | Fri 18:00 |

Until those dates, use **mocks** built from 00 §14.

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Whole team | Deployed URL with the full loop | **Fri 22:00** |
| P4 | A polished, recording-ready UI and you driving it during the recording | Sat 15:00 |

---

## Task 1: Scaffold, types, mocks (Thu, push by 23:00)

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install recharts lucide-react clsx
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

**Config:**
- `tailwind.config.js`: `content: ["./index.html", "./src/**/*.{ts,tsx}"]`, dark UI by default.
- `src/index.css`: the three `@tailwind` directives. Load the Inter font from Google Fonts in `index.html`.
- `vite.config.ts`:

  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  export default defineConfig({
    plugins: [react()],
    server: { proxy: { "/api": "http://localhost:8000" } },
  });
  ```

- `package.json` scripts: add `"dev:mock": "vite --mode mock"`.
- `frontend/.env.mock`: `VITE_MOCK=1`.

**Files to create:**

```
src/types.ts                 VERBATIM from 00 §7.2
src/api.ts                   fetch wrappers + mock switch
src/hooks/usePoll.ts
src/lib/format.ts            eur(), hours(), simTime(), roleLabel(), actionLabel(), statusColor()
src/mocks/                   plant.json, alerts.json, replace_P-101.json, amd.json, people.json,
                             manual.json, maintenance_P-101.json, makeSeries.ts
src/App.tsx, src/main.tsx
src/components/...           (Tasks 2–6)
```

### `api.ts`

```ts
const MOCK = import.meta.env.VITE_MOCK === "1";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  plant: () => (MOCK ? mock.plant() : get<PlantState>("/plant")),
  series: (id: string, hours = 24) => (MOCK ? mock.series(id, hours) : get<Series>(`/machines/${id}/series?hours=${hours}&max_points=600`)),
  alerts: () => (MOCK ? mock.alerts() : get<Alert[]>("/alerts")),
  ack: (id: string, body: AckRequest) => post<Alert>(`/alerts/${id}/ack`, body),
  resolve: (id: string, body: ResolveRequest) => post<Alert>(`/alerts/${id}/resolve`, body),
  people: () => get<Person[]>("/people"),
  manual: (sectionId: string) => get<ManualSection>(`/manual/${sectionId}`),
  maintenance: (machineId: string) => get<MaintenanceRecord[]>(`/maintenance/${machineId}`),
  amdStats: () => get<AmdStats>("/amd/stats"),
  inject: (body: InjectRequest) => post<PlantState>("/demo/inject", body),
  control: (body: ControlRequest) => post<PlantState>("/demo/control", body),
  reset: (seed = 7) => post<PlantState>("/demo/reset", { seed }),
  replaceAnalysis: (id: string, body: ReplaceRequest) => post<ReplaceAnalysis>(`/machines/${id}/replace-analysis`, body),
};
```

In mock mode, every function returns fixture data, and mutations return the fixture unchanged.

### Fixtures

- Copy the JSON from 00 §14 into the fixture files.
- `people.json` is the roster from 00 §10.1 with `on_shift: true` for shift A.
- `manual.json` holds two sections, e.g. `P101-TS-01` and `P101-SAF-01`, with any placeholder text.
- **`makeSeries.ts`** generates a realistic 24 h series for any machine: 288 points, 5 min apart, ending at `2026-10-15T09:40:00Z`.
  - Each signal is `base + noise`. For P-101, `vibration_hf` rises linearly over the last 2 h (+0.07).
  - `score` stays around 0.2 and ramps up to 1.62 over the last hour.
  - Include the two markers from §14.2.

### `hooks/usePoll.ts`

Use a setTimeout chain, so requests never overlap:
- Skip the fetch when `document.visibilityState !== "visible"`.
- Keep the last good data when an error occurs.
- Expose `{ data, error, refresh }`. Re-run when `deps` change.

**Polling intervals:**

| Data | Interval |
|---|---|
| plant | 1000 ms |
| series of the selected machine | 1000 ms |
| alerts | 1500 ms |
| amd stats | 3000 ms |
| people | 10000 ms |

**Acceptance:** `npm run dev:mock` shows the four machine cards from mocks, and `npm run build` passes with no TypeScript errors. Push.

---

## Task 2: Layout, top bar, machine cards, demo controls (Fri morning)

The target screen is **1920×1080** (video recording), and it must still work at 1366×768. The theme is dark and industrial:

| Element | Colour |
|---|---|
| Background | `slate-950` |
| Cards | `slate-900`, `border-slate-800`, `rounded-xl` |
| Text | `slate-200` / `slate-400` |
| Status | `ok` emerald-500, `watch` amber-400, `alert` red-500, `down` zinc-500 |
| Accent | red-600, for the AMD chip only |

**Always show status as a colour and a text label.**

```
┌ TopBar: product name · "Track 1 · Intelligent Industry" · sim clock · run state · [AMD chip] · demo controls ┐
├───────────────┬─────────────────────────────────────────────────────┬────────────────────────────┤
│ Machine cards │ Tabs: [Live monitoring] [Repair vs. replace]        │ Alert panel (440 px)        │
│ (280 px)      │ Lead-time banner (when available)                   │                            │
│ P-101         │ Machine chart (small multiples + anomaly score)     │                            │
│ P-102         │                                                     │                            │
│ C-201         │                                                     │                            │
│ M-301         │                                                     │                            │
└───────────────┴─────────────────────────────────────────────────────┴────────────────────────────┘
```

**TopBar:**
- **Sim clock:** "Thu 15 Oct · 09:40" (from `sim_time`, formatted in UTC).
- **Run state:** "▶ 30 sim-min/s" or "⏸ Paused".
- **AMD chip:** `AMD Radeon API · DeepSeek-V4-Flash · 2.3 s avg · 6 calls`. Clicking it opens the AMD panel (Task 5). If `mock` is true, show "MOCK" in amber.

**DemoControls** (compact, right side of the top bar):
- **Play/pause:** `control({paused})`.
- **Speed select** (values in samples per second):

  | Value | Label |
  |---|---|
  | 1 | 5 min/s |
  | 2 | 10 min/s |
  | 6 | 30 min/s |
  | 30 | 2.5 h/s |
  | 60 | 5 h/s |

- **"Inject fault…" menu:** machine (P-101, P-102) × fault (4 options) → `inject`.
- **Reset**, with a confirm dialog.
- An **auto-pause** checkbox.
- When a machine has `injected_fault`, show a muted chip "Demo fault active: P-101 bearing_wear". This is the only place the ground truth appears.

**MachineCard:**
- Content: name and id, area, status pill, the health number large, a sparkline of the 60 health values (a plain SVG polyline is fine), and the latest value of the first 2 signals with units.
- A red bell icon appears when `active_alert_id` is set.
- Clicking selects the machine; the selected card gets a ring.

**Auto-select:** when `/api/alerts` returns an alert id you haven't seen before, select its machine and show that alert. This keeps the demo hands-free.

**Acceptance:**
- With mocks, the layout renders at 1920 and 1366 widths with no horizontal scroll.
- With P1's live API (Fri 13:00), the clock ticks, cards update, and inject, pause, and speed work.

---

## Task 3: Machine chart (Fri morning)

**Data prep:** convert each point to `{ tms: Date.parse(p.t), ...p.values, score: p.score }`.

**Small multiples:**
- One Recharts `LineChart` per displayed signal, about 110 px tall, all sharing `syncId="machine"`.
- `<XAxis dataKey="tms" type="number" scale="time" domain={["dataMin", "dataMax"]} />`. Show the axis ticks only on the bottom chart.
- Line props: `isAnimationActive={false}` and `dot={false}`. **This matters with 1 s polling.**
- `ReferenceLine` at `alarm_high` / `alarm_low` (red dashed, label "Alarm").
- The Y label shows the signal label and unit. The tooltip shows the value with unit and the time.

**Which signals:**
- **With an active alert:** the top 4 contribution signals of that alert.
- **Otherwise:** for pumps `vibration_rms`, `vibration_hf`, `bearing_temp`, `motor_current`; for other machines, the first 4 signals.
- A "Show all signals" toggle overrides this.

**Range toggle:** 6 h / 24 h / 48 h. Default 24 h; it sets `hours` in the series request.

**Markers:** draw a vertical `ReferenceLine x={tms}` on every chart. Only the top chart gets a small label.

| Marker kind | Style | Label |
|---|---|---|
| `fault_injected` | Grey dashed | "Fault injected (demo)" |
| `ai_detected` | **Red solid, thicker** | "AI detected" |
| `threshold_alarm` | **Orange solid** | "Legacy alarm" |
| `failure` | Zinc solid | "Trip" |
| `acknowledged` | Blue | — |
| `resolved` | Emerald | — |

**Anomaly score chart** (under the signals):
- An `AreaChart` of `score` with `ReferenceLine y={ewma_limit}`, labelled "AI alert limit".
- The area is red above the limit; use a gradient or just colour.

**Evidence highlight:** the app state holds `highlight: { signal, from, to } | null`.
- When set, force that signal into the displayed list and draw a `ReferenceArea x1={from} x2={to}` (red, low opacity) on its chart.
- Scroll it into view.
- Clear it after 6 s or on the next click.

**Paused overlay:** when `paused` and the selected alert is `diagnosing`, show a chip on the chart: "Paused · AI is investigating on AMD…".

**Acceptance:**
- With the live engine, inject bearing wear at speed 2. You see `vibration_hf` drift up, the red "AI detected" line appear, and the score crossing the limit.
- Resume at speed 30: the orange "Legacy alarm" line appears much later on the `vibration_rms` chart.
- No flicker or animation jank.

---

## Task 4: Alert panel and diagnosis (Fri afternoon, live by 18:00)

Pick the alert to show:
- the selected machine's `active_alert_id`
- else that machine's newest alert
- else none

**By state:**

**No alert**
- "All machines running normally".
- A compact list of past alerts (id, machine, fault label, state). Clicking one shows it.

**`diagnosing`**
- Header "AI is investigating on AMD…" with a spinner.
- Event summary: "Detected 09:40 · deviating since 08:55". Show the top 3 contributions as chips: signal label, ↑/↓, `z`.
- **Live trace list:** each `alert.trace` step as it arrives (icon + name + latency). This is the "agent thinking" moment of the video.

**`open` / `escalated` / `acknowledged` / `resolved` / `rejected`**

**DiagnosisCard:**
- **Title:** `fault_label`.
- **Chips:** severity (coloured), category, and the action in plain words:

  | `action` | Text |
  |---|---|
  | `monitor` | "Monitor" |
  | `schedule_repair` | "Schedule repair" |
  | `stop_now` | "Stop the machine now" |
  | `consider_replacement` | "Repair now · review replacement" |

- A confidence bar (%) and "~46 h to failure".
- The `summary` paragraph.
- **Verification badge:**
  - `verified` → green shield: "All N evidence items checked against plant data".
  - Otherwise → amber: "Unverified", plus the `validation_errors` list.
- **If `alert.error`:** an amber note, e.g. "AMD API unavailable: rule-based fallback used".

**EvidenceList** (the key part for the mentor's "what data supports the diagnosis"):
- One row per item: a kind icon (`Activity` sensor, `Wrench` history, `BookOpen` manual, `Package` parts), the `ref` as a monospace chip, and the `detail`.
- **Click actions:**

  | Kind | Click does |
  |---|---|
  | `sensor` | Sets `highlight` to `{signal: ref, from: contribution.deviating_since ?? event.first_deviation_at, to: event.detected_at}` |
  | `manual` | `ManualModal`: `GET /api/manual/{ref}`, showing title and text (keep line breaks) |
  | `history` | `HistoryModal`: `GET /api/maintenance/{machine}` and shows the matching record |
  | `parts` | A popover with stock, lead time, and location |

**Collapsible "Why not something else?":** the `alternatives`.

**FixSteps:**
- A numbered checklist (local checkbox state only).
- Render section ids like `(P101-PR-01)` as clickable chips that open the ManualModal.

**PartsList:**
- A green badge "In stock: 2" when `in_stock ≥ qty`.
- Otherwise a red badge "Out of stock · 9 days".

**Safety:** a list with a warning icon.

**AssigneeCard:**
- "Assigned to **Sara Benali**", "Mechanical technician · Shift A · on shift".
- The notifications list: channel icon (bell for in-app, send for Telegram), reason (primary/cc/escalation), sim time, and the message (expandable).
- If `state === "escalated"`, show a red banner: "Escalated to Karim Ouali after 2 h without acknowledgement".

**Actions:**
- An **"Acting as"** select of people on shift (`/api/people`), defaulting to the assignee.
- **`open` / `escalated`:**
  - Primary button **"Acknowledge & create work order"** → `ack({decision: "accepted"})`.
  - Secondary **"Reject (false alarm)"** → `ack({decision: "rejected"})`.
- **`acknowledged`:**
  - A WorkOrderCard: id, priority, assignee, number of steps, parts.
  - Button **"Mark resolved…"** opens a dialog with an actual-fault select (default = `diagnosis.fault`) and a note, then calls `resolve`.
- **`resolved`:** "Resolved · diagnosis confirmed ✓", or "✗ actual fault: X".
- **`rejected`:** muted "Rejected as false alarm".
- A **"Show agent trace"** button opens the TraceDrawer (Task 5).

**Lead-time banner** (top of the center column):
- When the shown alert has `lead_time_h`, show a large green banner: **"AI warned 40.7 h before the legacy alarm"** (sub-text: "Legacy alarm: Vibration RMS > 7.1 mm/s at Sat 17 Oct 02:20").
- Before that, in the alert panel, a small muted line: "Fixed-threshold alarms: still silent".

**Acceptance:**
- With the integrated backend: inject → the diagnosing state shows the live trace → the open state shows the diagnosis.
- Clicking each evidence kind does the right thing.
- Acknowledge → the work order appears.
- Resume → the lead-time banner appears.
- Resolve → P-101 goes back to ok.
- The escalation banner shows when you resume without acknowledging.

---

## Task 5: Agent trace drawer and AMD panel (Fri afternoon)

**TraceDrawer** (right-side drawer, about 560 px, overlays the alert panel):
- **Header:** "{llm} LLM calls · {tools} tool calls · {sum latency s} s on AMD Radeon API · DeepSeek-V4-Flash · {prompt+completion} tokens".
- **Timeline:** one row per `TraceStep`. Icons: `Cpu` for llm, `Wrench` for tool, `ShieldCheck` for validation. Show the name, `latency_ms`, and tokens.
- Each row expands to show `input` and `output` as pretty JSON (`<pre>`, max-height 240 px, scroll).
- It updates live while diagnosing.

**AmdPanel** (modal or drawer from the AMD chip):
- **Big numbers:** calls, average latency, average tokens/s, total tokens.
- Provider, model, and endpoint host.
- If `mock`: a big amber warning, "MOCK MODE: not calling AMD".
- **Recent calls table:** time (wall clock), purpose, latency, prompt/completion tokens, tok/s, ok/error.
- A footnote: "Every diagnosis, alert message and repair-vs-replace justification is generated on the AMD Radeon API."

**Acceptance:** after one real diagnosis, the drawer and panel show non-zero real numbers that match `/api/amd/stats`.

---

## Task 6: Repair vs. replace tab (Sat morning, after P1's endpoint is ready around 10:00)

- Works on the selected machine. Machines without a duty (C-201, M-301) show "Available for pumps".
- **Button:** "Run repair-vs-replace analysis". It calls `POST /api/machines/{id}/replace-analysis` with `{fault}`, taken from the machine's active (or newest) alert diagnosis; otherwise send `{}`. Show a loading state; one LLM call takes a few seconds.

**Results:**
- **Recommendation card:**
  - the label of `recommendation`, with "5-year cost €142,559"
  - "Pays back in 15.0 months vs. repairing" (if `payback_months`)
  - the `justification` text
  - a badge "Numbers checked ✓" if `justification_verified`
- **Table**, one row per option in rank order:

  | Option | Fits duty | Upfront | Energy 5y | Maintenance 5y | Downtime 5y | **TCO 5y** | Score |
  |---|---|---|---|---|---|---|---|

  Highlight the recommended row. Grey out non-fitting rows and tag them "Doesn't meet duty"; show `fit_notes` in a tooltip.
- **Stacked horizontal bar chart** (Recharts `BarChart layout="vertical"`): one bar per option, stacked from capex, energy, maintenance, and downtime, with a legend. Use EUR format.
- **Collapsible "Assumptions":** a readable label → value list, plus a footnote "Assumptions live in backend/data/catalog.json".

**Formatting:** `new Intl.NumberFormat("en-IE", {style: "currency", currency: "EUR", maximumFractionDigits: 0})`.

**Acceptance:** with P1's endpoint, the numbers match 00 §14.4 exactly, and the chart is readable at 1920×1080.

---

## Task 7: Docker and Hugging Face Space (Fri evening, live URL by 22:00)

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
3. **README front matter:** a Space needs this block at the **top** of its `README.md`. Agree with P4 that it stays at the top of the repo README (GitHub just renders it as a small table):

   ```
   ---
   title: Maintenance Copilot
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
6. **Post the URL** in the team chat. P4 puts it in the README and the submission.

**Backup host:** if HF fails, use Render.com (New → Web Service → connect the GitHub repo → Docker → env var `RADEON_API_KEY`). The free tier sleeps after idle, so open it before judging.

**Notes:**
- State is in memory: a Space restart resets the demo. That's fine, because the reset state is the clean demo start.
- Redeploy after every merge to `main` that touches the app, at least at each checkpoint.

---

## Task 8: Polish and recording mode (Sat, before 14:00 freeze)

**Keyboard shortcuts** (help P4 record smoothly):

| Key | Action |
|---|---|
| `Space` | Play/pause |
| `i` | Inject bearing wear into P-101 |
| `t` | Toggle the trace drawer |
| `a` | Open the AMD panel |
| `r` | Repair-vs-replace tab |
| `Esc` | Close drawers |

**Also:**
- **Empty and loading states** everywhere.
- **Error toast** when the backend is unreachable: "Backend unreachable, retrying…".
- **No console errors.** Check `npm run build` output size.
- **Check both screen sizes:** 1920×1080 and 1366×768.
- **Browser tab:** title = product name, plus a simple favicon.
- **Rehearse the demo path** with P4 twice. Agree on the speed changes: start at speed 2 so the drift is visible, then switch to 30 to reach the legacy alarm quickly.

---

## Your schedule

| When | Do |
|---|---|
| Thu → 23:00 | Task 1 (scaffold, types, mocks, cards from mocks), push |
| Fri → 13:00 | Tasks 2–3 on mocks, then switch plant/series to live at 13:00 |
| Fri → 18:00 | Tasks 4–5, then switch alerts to live at 18:00 (integration with P1+P2) |
| Fri → 22:00 | Task 7: Docker + HF Space live, URL to team |
| Sat → 14:00 | Task 6 repair tab, Task 8 polish, redeploy; then freeze |
| Sat 15:00–20:00 | Drive the UI for P4's recording |
| Sun → 10:00 | Final redeploy; test from a phone and a second laptop |

## Pitfalls

- **Recharts animations plus 1 s polling cause flicker.** Always set `isAnimationActive={false}`.
- **Times are UTC simulated plant time.** Format them with `timeZone: "UTC"` or the clock will shift by your local offset.
- **Don't keep server data in local state copies.** Derive it from the latest poll so the UI never drifts from the backend.
- **Mock mode must never be on in the deployed build.** `.env.mock` is only loaded with `--mode mock`.
- **Don't add UI libraries** beyond the listed ones. Time is short.
