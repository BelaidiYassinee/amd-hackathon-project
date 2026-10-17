# Team briefs: AMD Hackathon Act III (Track 1, Intelligent Industry)

**What we're building:** an AI Operion. A simulated machine develops a fault. The system detects it early, an agent running on the **AMD Radeon API** diagnoses it with verified evidence, the alert goes to the on-shift technician with fix steps, and a repair-vs-replace comparison supports the supervisor's decision. The scope follows our mentor's feedback: one strong end-to-end workflow, done well.

## How to use these files

1. Fill in your name in the table below and commit.
2. Give your AI model **two files**: `00-project-and-contract.md` (always) and **your own brief**. Each brief starts with a ready-made prompt to paste.
3. Work only on the files your brief lists under *You own*. Need a change in someone else's file? Ask them in the team chat.
4. The API contract (00 §7) is binding. A contract change needs a team heads-up, and the same commit must update `backend/app/models.py` **and** `frontend/src/types.ts`.
5. Merge to `main` at every checkpoint (00 §12), at least twice a day, and pull often.

## The 4-way build split

All four people build until the **Sat 14:00 feature freeze**. Pitch and submission are not part of this split (see the end of this page).

| Role | Brief | Owns | Name |
|---|---|---|---|
| **P1: Backend core and detection** | [01-data-and-detection.md](01-data-and-detection.md) | backend skeleton, `main.py`/`state.py`, `sim/`, `detect/`, `api/plant.py`, `machines.yaml`, `eval/` harness | |
| **P2: AI on AMD** | [02-agent-and-decisions.md](02-agent-and-decisions.md) | `agent/` (LLM client, tools, diagnosis, validation, fallback), `decide/` + `api/decide.py` (repair vs. replace), `catalog.json`, diagnosis eval | |
| **P3: Dashboard** | [03-frontend.md](03-frontend.md) | `frontend/` (all of the UI) | |
| **P4: Knowledge, alerts, deploy** | [04-knowledge-alerts-and-deploy.md](04-knowledge-alerts-and-deploy.md) | `data.py`, pump manual, maintenance log, roster/parts, `alerts/` + `api/alerts.py` (routing, escalation, work orders), Dockerfile + Hugging Face Space, QA | |

**How the pieces connect:** P1's engine raises an anomaly → P4's alert service calls P2's `diagnose()` → P4 routes and notifies → P3 shows everything. P2's agent reads P4's manual and history.

## Key checkpoints (GMT+1)

| When | What | Who |
|---|---|---|
| **Fri 10:00** | Backend skeleton on `main` | P1 |
| Fri 11:00 | Radeon API capability check posted | P2 |
| **Fri 12:00** | `data.py`, manual, maintenance log; `llm.py`; UI on mocks | P4, P2, P3 |
| Fri 15:00 | Live engine; `diagnose()` works headless | P1, P2 |
| **Fri 19:00** | Integration: inject → detect → diagnose on AMD → alert → UI | all |
| **Fri 23:00** | Full loop on the deployed URL | P4 |
| Sat 11:00 | Repair vs. replace live | P2 |
| Sat 12:00 | Eval report; QA pass | P1, P2, P4 |
| **Sat 14:00** | Feature freeze | all |

## After the freeze: pitch and submission

One person takes [later-pitch-and-submission.md](later-pitch-and-submission.md) at Sat 14:00: video, slides, cover image, README, and the lablab submission by **Sun 12:00**.

**One exception, today:** anyone posts the Discord eligibility question (Task 1 in that file). Whether the AMD Radeon API counts as "AMD infrastructure" decides how the pitch is worded, and the answer takes time.
