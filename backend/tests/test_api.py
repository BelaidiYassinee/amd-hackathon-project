from fastapi.testclient import TestClient

from backend.app import state
from backend.app.main import app

# No "with TestClient(app)": the startup (and the background clock) does not run,
# so we control the engine by hand.
client = TestClient(app)


def fresh():
    state.reset(7)


def test_health():
    fresh()
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and body["sim_time"].endswith("Z")


def test_plant_has_four_healthy_machines():
    fresh()
    body = client.get("/api/plant").json()
    assert [m["id"] for m in body["machines"]] == ["P-101", "P-102", "C-201", "M-301"]
    assert all(m["status"] == "ok" for m in body["machines"])
    assert body["paused"] is False and body["speed"] == 6


def test_series_is_downsampled_and_keeps_the_last_point():
    fresh()
    body = client.get("/api/machines/P-101/series?hours=48&max_points=100").json()
    assert len(body["points"]) <= 100
    assert body["points"][-1]["t"] == state.engine.sim_time.isoformat().replace("+00:00", "Z")
    assert body["ewma_limit"] == 1.5 and body["markers"] == []
    assert "load_pct" in body["points"][0]["values"]
    assert client.get("/api/machines/NOPE/series").status_code == 404


def test_inject_then_the_event_shows_up_in_the_series():
    fresh()
    r = client.post("/api/demo/inject", json={"machine_id": "P-101", "fault": "bearing_wear"})
    assert r.status_code == 200
    assert r.json()["machines"][0]["injected_fault"] == "bearing_wear"
    state.engine.step(12 * 10)                     # the background clock is off, so step by hand
    assert client.get("/api/plant").json()["paused"] is True      # auto-paused at the event
    kinds = [m["kind"] for m in
             client.get("/api/machines/P-101/series").json()["markers"]]
    assert kinds == ["fault_injected", "ai_detected"]


def test_inject_errors():
    fresh()
    assert client.post("/api/demo/inject",
                       json={"machine_id": "C-201", "fault": "bearing_wear"}).status_code == 409
    assert client.post("/api/demo/inject",
                       json={"machine_id": "NOPE", "fault": "bearing_wear"}).status_code == 404
    ok = {"machine_id": "P-102", "fault": "cavitation"}
    assert client.post("/api/demo/inject", json=ok).status_code == 200
    assert client.post("/api/demo/inject", json=ok).status_code == 409   # already has a fault


def test_control_and_validation():
    fresh()
    r = client.post("/api/demo/control", json={"paused": True, "speed": 10})
    body = r.json()
    assert body["paused"] is True and body["speed"] == 10
    assert client.post("/api/demo/control", json={"speed": 70}).status_code == 422   # max is 60


def test_reset_clears_the_fault():
    fresh()
    client.post("/api/demo/inject", json={"machine_id": "P-101", "fault": "bearing_wear"})
    body = client.post("/api/demo/reset", json={"seed": 7}).json()
    assert all(m["injected_fault"] is None for m in body["machines"])