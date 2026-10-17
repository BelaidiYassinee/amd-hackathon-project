# Later: pitch and submission (after the Sat 14:00 feature freeze)

> **Not part of the 4-way build split.** The four build briefs (01–04) cover all the code and content. One person takes this file after the feature freeze. Exception: post the Discord question (Task 1) **today**, because the answer takes time; anyone can do it in 2 minutes.

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are helping me with my part of a 3-day hackathon project. Read `00-project-and-contract.md` first. It describes the product, the demo workflow, and the seed data, and its IDs and signal names are binding. Then read this brief: it is my part (pitch, video, submission). When you write pitch material, never invent statistics. Use our eval numbers, or label a number clearly as an assumption, or cite a real source I can check."

**Owner:** whoever takes the pitch after the freeze (name: ____________).

**Your mission:** win the presentation. Write the Discord question, product name, video, slides, cover image, README, and the lablab submission. The judges score **Application of Technology · Business Value · Originality · Presentation**, and our mentor asked us to show *what the AI does, which data supports its diagnosis, and how it helps the factory decide better*.

---

## You own

```
README.md                                 (keep P4's Hugging Face front matter block at the very top)
pitch assets: slides (Google Slides/Canva → PDF), cover image, video
```

Keep large files (video, PSD) **out of the repo**. Small PNGs are OK; tell P4 if you add images, because of Git LFS on Hugging Face.

**Do not touch:** code under `backend/`, `frontend/`, `eval/`, or the Dockerfile. After the freeze, report bugs to their owner instead of fixing them yourself.

## You depend on

| From | What | When |
|---|---|---|
| P4 | Deployed URL | Fri 23:00 |
| P3 | A polished UI | Sat 14:00 |
| P1 + P2 | `eval/report.md` numbers | Sat 12:00 |
| P2 | Radeon capability check (incl. whether a Gemma model exists) | Fri 11:00 |

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Team | Discord answer (question posted today) | When it comes |
| Team | Final video, slides, submission | Sat 20:00 / Sun 12:00 |

---

## Task 1: Discord question (today, anyone) and product name

**Post on the lablab Discord** (hackathon channel):

> Hi! Team *<name>* here (Track 1, Intelligent Industry). Our AI agent runs all of its LLM inference (tool-calling diagnosis, alert messages, decision justifications) on the **AMD Radeon API** (developer.amd.com.cn/radeon/api/v1, model DeepSeek-V4-Flash). We didn't get AMD Developer Cloud credits in time. Does inference on the AMD Radeon API count as "running a meaningful part of the workload on AMD infrastructure" for prize eligibility? Thanks!

- **When the answer comes,** paste it in the team chat. It decides how we word the AMD slide.
- **If P2's check shows a Gemma model** on the Radeon API, also ask whether using it qualifies for the Google/Gemma prize.

**Product name.** Pick one before recording (the team can decide it any time):
- short, about maintenance and uptime, easy to say in a video
- not an existing product: search the web and GitHub
- replaces "Operion" everywhere (tell P3 for the UI title and P4 for the Space name)

---

## Task 2: Storyboard and video script (Sat afternoon)

The video runs **2:30–3:00**, recorded at 1920×1080 with P3 driving the UI and you doing the voice-over (or the other way round). One continuous realistic case is better than a feature tour.

| Time | On screen | Voice-over (adapt) |
|---|---|---|
| 0:00–0:15 | Title card → plant overview, all green | "Unplanned downtime is one of the most expensive problems in a factory. Today's alarms fire late and say nothing about *why*. We built *<name>* for maintenance teams." |
| 0:15–0:35 | Inject bearing wear into P-101 at speed 2; the `vibration_hf` chart drifts | "This coolant pump is developing a bearing fault. The plant's fixed alarms watch overall vibration and temperature, and they're still silent." |
| 0:35–0:50 | Red "AI detected" marker; card turns red; the sim auto-pauses | "Our detector learned each signal's normal behaviour and flags the drift in high-frequency vibration 1–2 hours after it starts." |
| 0:50–1:25 | Alert panel in *diagnosing*: the trace steps appear live; open the trace drawer | "Now the AI agent investigates, running on the **AMD Radeon API**. It pulls the sensor trends, the maintenance history and the manual, and checks spare parts." |
| 1:25–1:50 | Diagnosis card: evidence list; click the `vibration_hf` evidence (chart highlight), then the manual section | "Every claim is backed by evidence, and our backend verifies each reference against real plant data before anyone is alerted: no hallucinated parts or procedures." |
| 1:50–2:05 | Assignee card, notification (phone buzz if P4's Telegram stretch works); click Acknowledge → work order | "The alert goes to the mechanical technician on shift, with fix steps and parts in stock. One click creates the work order." |
| 2:05–2:20 | Resume at speed 30 → orange "Legacy alarm" marker → lead-time banner | "Without us, the legacy alarm would have fired **<lead time from eval> hours later**." |
| 2:20–2:40 | Repair vs. replace tab: run it, show the recommendation, payback, verified justification | "And because this pump keeps failing, the supervisor gets a 5-year cost comparison: replacing pays back in about 15 months." |
| 2:40–2:55 | Results slide: eval table + AMD numbers | "Across <N> simulated faults: <lead time>, <accuracy>, <false alarms>, all reasoning on AMD at <latency> per diagnosis." |
| 2:55–3:00 | Closing card: name, URL, team | "*<name>*: catch it early, fix it right, spend wisely." |

**Recording tips:**
- Use OBS Studio (free) at 1920×1080, 30 fps, with a decent mic in a quiet room.
- Record the UI part in 2–3 takes, and record the voice separately if that's easier.
- Edit in DaVinci Resolve, CapCut or Clipchamp. Add captions: judges often watch without sound.
- Upload to YouTube as **unlisted**, or wherever lablab asks.
- **Rehearse with P3 (UI) twice before recording.** Do a `Reset` before each take.

---

## Task 3: Slides (Sat, final by 20:00, PDF)

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

## Task 4: Cover image (Sat/Sun)

- Use the size and aspect ratio lablab's form asks for (check the form; usually 16:9).
- Show the product name, the one-liner, and a stylised chart with the "AI detected" and "Legacy alarm" markers.
- Write "Runs on AMD" as text. Only use AMD logos if the hackathon's brand rules allow it.

---

## Task 5: README (Sat, final Sun 10:00)

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

## Task 6: Submission (Sun, by 12:00; hard deadline 16:00)

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
| Fri (today) | Task 1: post the Discord question (anyone) |
| Sat 14:00 | Feature freeze: take over this file |
| Sat 14:00–17:00 | Storyboard and script with the real eval numbers; slides 1–7 |
| Sat 17:00–20:00 | Record and edit the video with P3 driving the UI; slides 8–10 |
| Sun → 10:00 | README final, cover image, re-test the URL |
| Sun → 12:00 | Submission |
