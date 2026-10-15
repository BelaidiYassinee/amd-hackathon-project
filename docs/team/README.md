# Team briefs: AMD Hackathon Act III (Track 1, Intelligent Industry)

**What we're building:** an AI maintenance copilot. A simulated machine develops a fault. The system detects it early, an agent running on the **AMD Radeon API** diagnoses it with verified evidence, the alert goes to the on-shift technician with fix steps, and a repair-vs-replace comparison supports the supervisor's decision. The scope follows our mentor's feedback: one strong end-to-end workflow, done well.

## How to use these files

1. Fill in your name in the table below and commit.
2. Give your AI model **two files**: `00-project-and-contract.md` (always) and **your own brief**. Each brief starts with a ready-made prompt to paste.
3. Work only on the files your brief lists under *You own*. Need a change in someone else's file? Ask them in the team chat.
4. The API contract (00 §7) is binding. A contract change needs a team heads-up, and the same commit must update `backend/app/models.py` **and** `frontend/src/types.ts`.
5. Merge to `main` at every checkpoint (00 §12), at least twice a day, and pull often.

| Role | Brief | Owns | Name |
|---|---|---|---|
| P1: Simulator, detection, decisions, eval | [01-data-and-detection.md](01-data-and-detection.md) | backend skeleton, `sim/`, `detect/`, `decide/`, `api/plant.py`, `eval/` | |
| P2: AI agent on AMD, alerts, routing | [02-agent-and-decisions.md](02-agent-and-decisions.md) | `agent/`, `alerts/`, `api/alerts.py`, `data.py`, `scripts/check_radeon.py` | |
| P3: Dashboard and deployment | [03-frontend-and-deploy.md](03-frontend-and-deploy.md) | `frontend/`, `Dockerfile`, Hugging Face Space | |
| P4: Domain content, pitch, submission | [04-pitch-and-submission.md](04-pitch-and-submission.md) | manual, maintenance log, README, video, slides, submission | |

With only 3 people, P1 writes the manual and maintenance log on Thursday night, and P2 and P3 share the video and slides on Saturday afternoon (00 §12).

## Key checkpoints (GMT+1)

| When | What |
|---|---|
| **Thu 21:00** | Backend skeleton on `main` (P1) |
| Thu 23:00 | Radeon API check results (P2), UI on mocks (P3), Discord question + product name (P4) |
| **Fri 12:00–13:00** | Manual and history (P4), live engine (P1), agent runs headless (P2) |
| Fri 18:00 | Integration: inject → detect → diagnose on AMD → UI |
| **Fri 22:00** | Full loop on the deployed URL |
| Sat 12:00 | Eval report and repair vs. replace done |
| **Sat 14:00** | Feature freeze |
| Sat 15:00–20:00 | Video and slides |
| **Sun 12:00** | Submitted |
