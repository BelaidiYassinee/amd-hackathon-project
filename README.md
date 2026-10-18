---
title: Operion Agent
emoji: 🛠️
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Operion Agent

**Predict • Diagnose • Decide**

Operion Agent hears a machine failing before it breaks. It detects drift early, diagnoses the fault with verified evidence, alerts the right technician, and recommends repair or replace. Built on the AMD Token Factory API.

AMD Developer Hackathon ACT III · Track 1: Intelligent Industry

- Demo video: TODO
- Slides: [docs/Operion_Agent_Deck.pdf](docs/Operion_Agent_Deck.pdf)

## Why

Fixed-limit alarms ring too late, or never. On our 40 simulated fault runs the legacy alarm never fired in 9 of them. Operion Agent replaces it with a complete pipeline from signal to decision.

## How it works

1. **Simulator.** A simulated plant (pump P-101) with four fault types: bearing wear, cavitation, misalignment, motor overheating. Seeded and reproducible.
2. **Detector.** A transparent statistical detector learns normal behavior from 72 h of history, removes the effect of plant load, scores drift with an EWMA robust z-score, and raises an event when the score stays above the limit.
3. **AI agent.** DeepSeek-V4-Flash on the AMD Token Factory API reads the evidence, the maintenance history and the equipment manual, names the fault, and cites its sources. Every number and section id in the answer is verified against plant data. If the API is down, a rule-based fallback takes over.
4. **Alerts.** The alert goes to the technician on shift with the likely cause and the next step. Optional Telegram delivery.
5. **Decision.** A repair-versus-replace analysis compares the five-year cost of each option.

## Results (simulated plant, fixed seeds)

Full report: [eval/report.md](eval/report.md)

| Metric | Result |
|---|---|
| Faults detected before the pump failed | 40/40 |
| Detection delay after fault onset (median) | 3.6 h |
| Warning before failure, Operion (median / min) | 36.4 h / 16.0 h |
| Warning before failure, legacy alarm (median / min) | 6.2 h / 0.2 h |
| Runs where the legacy alarm never fired | 9/40 |
| Lead time over legacy, where both fired (median) | 28.6 h |
| False alarms on healthy runs | 0/10 (720 simulated hours) |
| Diagnosis accuracy | 97.5% (39/40) |
| Diagnoses passing evidence verification | 100%, 0 fallbacks |
| Average latency per diagnosis | 31.5 s |

## Run it

You need an API key for the AMD Token Factory endpoint.

```bash
cp .env.example .env        # Windows: copy .env.example .env
# put your key in RADEON_API_KEY, and set AGENT_MODE=prefetch
```

### With Docker

```bash
docker build -t operion-agent .
docker run --rm -p 7860:7860 --env-file .env operion-agent
```

Open http://localhost:7860 (API docs at `/docs`).

### Without Docker

```bash
python -m venv .venv
.venv\Scripts\activate       # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm ci && npm run build && cd ..
uvicorn backend.app.main:app --host 0.0.0.0 --port 7860 --workers 1
```

Set `LLM_MOCK=1` in `.env` to run the UI without API calls (rule-based diagnosis).

### Tests and evaluation

```bash
python -m pytest                       # 196 tests
python -m eval.run_eval --no-llm       # detection evaluation
```

## Configuration

See [.env.example](.env.example). Key variables: `RADEON_API_KEY`, `LLM_MODEL`, `AGENT_MODE` (`prefetch` or `tools`), `LLM_MOCK`, `PORT`, optional `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS`.

## Limits

- All data is simulated. Fault signatures were designed by the team, and real plants are messier.
- Evaluated on one pump (P-101) with four fault types.
- The 97.5% diagnosis accuracy followed a pipeline fix made after seeing results on the same scenarios, so treat it as optimistic.

## Next

- Let the agent take action: open work orders, order spare parts and schedule the repair, with human approval.
- Fresh-seed evaluation, real or public machine data, more machine types.

## Team

| Member | Role |
|---|---|
| Yassine Belaidi | Backend core, simulator, detection and evaluation |
| Aymane Idrissi Khamlichi | AI agent on AMD, diagnosis and repair-vs-replace analysis |
| Yahya Dadsi | Dashboard (React frontend) |
| Nassime Gharib | Knowledge base, alerts, deployment and QA |

## Repository layout

```
backend/    FastAPI app, detector, agent, alerts, replace analysis
frontend/   React + Vite dashboard
eval/       evaluation scripts and reports
Dockerfile  one image serving the API and the UI
```
