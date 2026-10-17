# Operion: one image that serves the API and the React UI (Hugging Face Space, port 7860).

# ---- stage 1: build the UI ----
# Until P3's frontend/ is in the repo, this stage writes a placeholder page instead,
# so the backend-only image still builds. Once frontend/ exists, the UI is built automatically.
FROM node:20-alpine AS web
WORKDIR /src
COPY . .
RUN if [ -f frontend/package.json ]; then \
        cd frontend && npm ci && npm run build; \
    else \
        mkdir -p frontend/dist && \
        echo '<!doctype html><title>Operion</title><p>UI not built yet. API docs: <a href="/docs">/docs</a></p>' \
            > frontend/dist/index.html; \
    fi

# ---- stage 2: the app ----
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY eval/ eval/
COPY --from=web /src/frontend/dist frontend/dist
ENV PORT=7860 LOG_DIR=/tmp/logs PYTHONUNBUFFERED=1
EXPOSE 7860
# one worker only: all demo state lives in memory
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
