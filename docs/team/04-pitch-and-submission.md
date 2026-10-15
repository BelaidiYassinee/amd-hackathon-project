# 04: P4 brief: domain content, pitch, video, submission

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are helping me with my part of a 3-day hackathon project. Read `00-project-and-contract.md` first. It describes the product, the demo workflow, and the seed data, and its IDs and signal names are binding. Then read this brief: it is my part (domain content, pitch, video, submission). When you write manual or maintenance content, follow the exact IDs, signal names and fault fingerprints given here, because the software depends on them. Write original text: never copy from real manuals or vendors, and keep all brands and people fictional. When you write pitch material, never invent statistics. Use our eval numbers, or label a number clearly as an assumption, or cite a real source I can check."

**Owner:** P4 (name: ____________). If the team has only 3 people, see 00 §12 for who covers what.

**Your mission:** two jobs.

1. **Make the plant believable.** Write the pump manual and the maintenance history that the AI agent reads. The agent's accuracy depends directly on how clearly the manual describes each fault.
2. **Win the presentation.** Write the Discord question, product name, video, slides, cover image, README, and the lablab submission. The judges score **Application of Technology · Business Value · Originality · Presentation**, and our mentor asked us to show *what the AI does, which data supports its diagnosis, and how it helps the factory decide better*.

---

## You own

```
backend/data/manuals/pump_p101.md         (replace P1's placeholder, Fri 12:00)
backend/data/maintenance_log.json         (replace P1's placeholder, Fri 12:00)
README.md                                 (keep P3's Hugging Face front matter block at the very top)
docs/team/*                               (keep briefs up to date if the team changes something)
pitch assets: slides (Google Slides/Canva → PDF), cover image, video
```

Keep large files (video, PSD) **out of the repo**. Small PNGs are OK; tell P3 if you add images, because of Git LFS on Hugging Face.

**Do not touch:** code under `backend/app`, `frontend`, `eval`, or the Dockerfile.

## You depend on

| From | What | When |
|---|---|---|
| P3 | Deployed URL | Fri 22:00 |
| P3 | A polished UI | Sat 14:00 |
| P1 + P2 | `eval/report.md` numbers | Sat 12:00 |
| P2 | Radeon capability check (incl. whether a Gemma model exists) | Thu 23:00 |

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Team | Discord answer + product name | Thu 23:00 (answer when it comes) |
| P2 | Manual and maintenance log; the agent's accuracy depends on them | **Fri 12:00** |
| Team | Final video, slides, submission | Sat 20:00 / Sun 12:00 |

---

## Task 1: Discord question and product name (Thu, by 23:00)

**Post on the lablab Discord** (hackathon channel):

> Hi! Team *<name>* here (Track 1, Intelligent Industry). Our AI agent runs all of its LLM inference (tool-calling diagnosis, alert messages, decision justifications) on the **AMD Radeon API** (developer.amd.com.cn/radeon/api/v1, model DeepSeek-V4-Flash). We didn't get AMD Developer Cloud credits in time. Does inference on the AMD Radeon API count as "running a meaningful part of the workload on AMD infrastructure" for prize eligibility? Thanks!

- **When the answer comes,** paste it in the team chat. It decides how we word the AMD slide.
- **If P2's check shows a Gemma model** on the Radeon API, also ask whether using it qualifies for the Google/Gemma prize.

**Product name.** Pick one by Thursday night:
- short, about maintenance and uptime, easy to say in a video
- not an existing product: search the web and GitHub
- replaces "Maintenance Copilot" everywhere (tell P3 for the UI title and the Space name)

---

## Task 2: The pump manual (`backend/data/manuals/pump_p101.md`, by Fri 12:00)

This is a fictional manual for the **AquaFlow CP-80** end-suction centrifugal pump that feeds the plant's cooling loop. The agent searches it with keyword search (BM25), and the backend checks that every manual reference the agent cites exists. So:

- **Format.** Each section starts with exactly `## [ID] Title`, using the 13 IDs and titles from 00 §10.4, in that order. Nothing else may use `## [`.
- **Signal names.** Mention the exact signal name in parentheses every time you mention a sensor, e.g. "high-frequency vibration energy (`vibration_hf`)". Keyword search relies on it.
- **Troubleshooting section structure.** Every `TS` section uses the same sub-headings, in this order: **Symptoms** (in the order they appear) · **Typical progression** · **Likely causes** · **What to do** (numbered steps with section references such as `(P101-PR-01)`) · **Parts** (exact part numbers from 00 §10.2) · **Category** (mechanical / electrical / process) · **Do not confuse with**.
- **Length and style.** Write 120–300 words per section, in the plain, practical style of a technician's manual. Write original text.

### Required facts per section

These must match the simulator. If you change any fact, tell P1 and P2.

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

**Acceptance:**
- P2 runs `search_manual("high frequency vibration rising bearing temperature")` and gets `P101-TS-01` first.
- `search_manual("discharge pressure dropping flow falling noise")` returns `P101-TS-02` first.
- `search_manual("motor temperature current rising vibration normal")` returns `P101-TS-04` first.

---

## Task 3: Maintenance history (`backend/data/maintenance_log.json`, by Fri 12:00)

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

**Acceptance:** the file loads as JSON (validate it with any JSON linter), and P2's `corrective_last_12m("P-101", 2026-10-15) == 3`.

---

## Task 4: Storyboard and video script (Fri)

The video runs **2:30–3:00**, recorded at 1920×1080 with P3 driving the UI and you doing the voice-over (or the other way round). One continuous realistic case is better than a feature tour.

| Time | On screen | Voice-over (adapt) |
|---|---|---|
| 0:00–0:15 | Title card → plant overview, all green | "Unplanned downtime is one of the most expensive problems in a factory. Today's alarms fire late and say nothing about *why*. We built *<name>* for maintenance teams." |
| 0:15–0:35 | Inject bearing wear into P-101 at speed 2; the `vibration_hf` chart drifts | "This coolant pump is developing a bearing fault. The plant's fixed alarms watch overall vibration and temperature, and they're still silent." |
| 0:35–0:50 | Red "AI detected" marker; card turns red; the sim auto-pauses | "Our detector learned each signal's normal behaviour and flags the drift in high-frequency vibration 1–2 hours after it starts." |
| 0:50–1:25 | Alert panel in *diagnosing*: the trace steps appear live; open the trace drawer | "Now the AI agent investigates, running on the **AMD Radeon API**. It pulls the sensor trends, the maintenance history and the manual, and checks spare parts." |
| 1:25–1:50 | Diagnosis card: evidence list; click the `vibration_hf` evidence (chart highlight), then the manual section | "Every claim is backed by evidence, and our backend verifies each reference against real plant data before anyone is alerted: no hallucinated parts or procedures." |
| 1:50–2:05 | Assignee card, notification (phone buzz if Telegram works); click Acknowledge → work order | "The alert goes to the mechanical technician on shift, with fix steps and parts in stock. One click creates the work order." |
| 2:05–2:20 | Resume at speed 30 → orange "Legacy alarm" marker → lead-time banner | "Without us, the legacy alarm would have fired **<lead time from eval> hours later**." |
| 2:20–2:40 | Repair vs. replace tab: run it, show the recommendation, payback, verified justification | "And because this pump keeps failing, the supervisor gets a 5-year cost comparison: replacing pays back in about 15 months." |
| 2:40–2:55 | Results slide: eval table + AMD numbers | "Across <N> simulated faults: <lead time>, <accuracy>, <false alarms>, all reasoning on AMD at <latency> per diagnosis." |
| 2:55–3:00 | Closing card: name, URL, team | "*<name>*: catch it early, fix it right, spend wisely." |

**Recording tips:**
- Use OBS Studio (free) at 1920×1080, 30 fps, with a decent mic in a quiet room.
- Record the UI part in 2–3 takes, and record the voice separately if that's easier.
- Edit in DaVinci Resolve, CapCut or Clipchamp. Add captions: judges often watch without sound.
- Upload to YouTube as **unlisted**, or wherever lablab asks.
- **Rehearse with P3 twice before recording.** Do a `Reset` before each take.

---

## Task 5: QA of the deployed app (Fri night, after P3 posts the URL)

On a laptop **and** a phone, run this checklist. Report bugs in the team chat with steps to reproduce.

- [ ] The page loads, the clock ticks, and 4 machines are green.
- [ ] Inject P-101 bearing wear → an alert within about 10 s at default speed → the trace grows → a diagnosis appears, verified, assigned to Sara Benali.
- [ ] Each evidence type opens the right thing (chart highlight, manual, history record, part).
- [ ] Acknowledge → work order. Resume at speed 30 → lead-time banner.
- [ ] Resolve → P-101 is green again.
- [ ] Reset → inject again → do **not** acknowledge, resume → escalation to Karim Ouali.
- [ ] Inject cavitation and motor_overheat on P-101 → sensible diagnoses (process engineer / electrical technician get them).
- [ ] The AMD panel shows real (not mock) calls.
- [ ] Repair vs. replace shows AF-CP80-G2 as rank 1, payback 15.0 months, and "Numbers checked ✓".

---

## Task 6: Slides (Sat, final by 20:00, PDF)

Make 10 slides. Keep text light, use screenshots, and **only use numbers from `eval/report.md`, the app, or cited sources.**

1. **Title:** name, one-liner, team names, "Track 1 · Intelligent Industry".
2. **Problem:** unplanned downtime, late threshold alarms, troubleshooting that depends on who is on shift. Cite a source for any cost statistic, or don't use one.
3. **User and moment:** the maintenance technician on shift and the maintenance supervisor; P-101's story (9 years old, 3 repairs in 12 months, missed re-greasing).
4. **Solution: one workflow:** detect → explain with evidence → alert the right person → decide repair vs. replace. Use one diagram.
5. **Demo:** 3–4 screenshots (chart with both markers, diagnosis with evidence, trace, repair vs. replace).
6. **What the AI does, and why you can trust it:**
   - the agent's tool loop: sensor summaries, history, manual search, spare parts
   - validation of every reference; stock numbers always come from inventory, never from the model
   - the justification's numbers are machine-checked
   - "Numbers come from a transparent detector; reasoning comes from the agent."
7. **Built on AMD:**
   - the architecture diagram, with every LLM call going to the AMD Radeon API
   - average calls per diagnosis, latency, tokens/s (from the report)
   - one env change switches to a self-hosted vLLM model on an AMD Instinct MI300X for on-premise data privacy (next step)

   Word this slide according to the Discord answer.
8. **Results:** the eval table.

   | Metric | Value |
   |---|---|
   | Detection lead time vs. legacy alarm | |
   | Detection rate | |
   | False alarms on healthy runs | |
   | Diagnosis accuracy | |
   | Evidence verified | |

   Add a business translation, **with assumptions stated**, e.g. "at €1,200/h downtime (assumption), turning one unplanned 6 h stop into a planned repair avoids …".
9. **Business model:**
   - **Who pays:** the plant maintenance or reliability manager.
   - **Price:** a hypothesis, e.g. per monitored asset per month, labelled as a hypothesis.
   - **Differentiation:** evidence-backed diagnosis plus routing plus a repair-vs-replace decision, not just another anomaly score.
10. **Next steps:**
    - real sensor connectors (OPC UA / MQTT)
    - learning from technicians' resolutions (we already log them)
    - more machine types
    - self-hosted model on AMD Instinct for on-prem

---

## Task 7: Cover image (Fri/Sat)

- Use the size and aspect ratio lablab's form asks for (check the form; usually 16:9).
- Show the product name, the one-liner, and a stylised chart with the "AI detected" and "Legacy alarm" markers.
- Write "Runs on AMD" as text. Only use AMD logos if the hackathon's brand rules allow it.

---

## Task 8: README (Sat, final Sun 10:00)

Keep P3's Hugging Face front matter block at the **very top**. Then include:

1. Name, one-liner, **live demo URL**, video link
2. A GIF or screenshot of the demo
3. Problem and users
4. How it works (the one workflow and an architecture diagram from 00 §3)
5. **What runs on AMD**, and how to verify it (the AMD panel, `/api/amd/stats`)
6. Results table from `eval/report.md`, plus how to reproduce: `python -m eval.run_eval`
7. Run locally (from 00 §6) and with Docker
8. Configuration (env vars from 00 §11, without values)
9. Project structure (from 00 §4, short)
10. Data note: simulated plant; fictional brands and people
11. Team, license (MIT)

---

## Task 9: Submission (Sun, by 12:00; hard deadline 16:00)

**Checklist on lablab:**
- [ ] Title (product name) and **short description** (one line).
- [ ] **Long description:** problem → user → workflow → AI on AMD → results → business value.
- [ ] Track: **Intelligent Industry**.
- [ ] Tags, e.g. AMD, AI agent, predictive maintenance, industrial, FastAPI, React.
- [ ] Cover image uploaded.
- [ ] Video link works in a private browser window.
- [ ] Slides PDF uploaded.
- [ ] GitHub repo **public**. `git log --all -- .env` shows nothing, and no API key appears anywhere in the history.
- [ ] App URL (Hugging Face Space) opens from a phone and runs the demo.
- [ ] Every team member is added to the submission.

After submitting, take screenshots of the confirmation and post them in the team chat.

---

## Your schedule

| When | Do |
|---|---|
| Thu → 23:00 | Task 1 (Discord, name); start Task 2 |
| Fri → 12:00 | Tasks 2–3 (manual, maintenance log) on `main` |
| Fri afternoon | Task 4 storyboard/script, Task 7 cover draft, slide skeleton |
| Fri 22:00 → | Task 5 QA on the deployed URL |
| Sat → 12:00 | Collect eval numbers; slides 1–7 |
| Sat 15:00–20:00 | Record and edit the video with P3; finish slides 8–10 |
| Sun → 10:00 | README final, re-test the URL |
| Sun → 12:00 | Task 9 submission |
