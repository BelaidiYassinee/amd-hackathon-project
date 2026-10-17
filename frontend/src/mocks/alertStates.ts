import type { Alert } from "../types";
import { seedSteps } from "../lib/stepLog";

/**
 * Mock-only: derive the other alert states from the §14.3 "open" fixture, so every panel state
 * can be checked without a backend. Use `?mockState=diagnosing|acknowledged|escalated|resolved|rejected|none`
 * and `&mockLead=1` (legacy alarm fired, lead time 40.7 h).
 */
export function applyMockState(alerts: Alert[]): Alert[] {
  const params = new URLSearchParams(window.location.search);
  const state = params.get("mockState");
  if (state === "none") return [];
  const a = alerts[0];
  if (!a) return alerts;

  if (params.get("mockLead") === "1") {
    a.threshold_alarm_at = "2026-10-17T02:20:00Z";
    a.threshold_signal = "vibration_rms";
    a.lead_time_h = 40.7;
  }

  switch (state) {
    case "diagnosing":
      a.state = "diagnosing";
      a.diagnosis = null;
      a.trace = a.trace.slice(0, 5);
      a.assignee = null;
      a.notifications = [];
      break;
    case "acknowledged":
    case "resolved":
      a.state = state;
      a.ack = { person_id: "tech-a1", at: "2026-10-15T09:40:00Z", decision: "accepted", note: null };
      a.work_order = {
        id: "WO-2026-0412", created_at: "2026-10-15T09:40:00Z", machine_id: "P-101",
        title: "Drive-end bearing wear (early stage) - Coolant pump P-101", priority: "P2", assignee_id: "tech-a1",
        steps: a.diagnosis?.fix_steps ?? [], parts: a.diagnosis?.parts.slice(0, 1) ?? [], status: state === "resolved" ? "done" : "open",
      };
      // Ticked steps live in the frontend step log: 2 done while in progress, all done once resolved.
      seedSteps(a, a.work_order.steps.map((_, i) => (state === "resolved" || i < 2 ? `2026-10-15T1${i}:05:00Z` : null)));
      if (state === "resolved") {
        a.resolution = { at: "2026-10-15T14:10:00Z", actual_fault: "bearing_wear", diagnosis_correct: true, note: null };
      }
      break;
    case "escalated":
      a.state = "escalated";
      a.notifications.push({
        person_id: "sup-a1", person_name: "Karim Ouali", role: "maintenance_supervisor", channel: "in_app", reason: "escalation",
        sent_at: "2026-10-15T11:40:00Z", delivered: true,
        message: "ESCALATION P-101: bearing wear alert not acknowledged by Sara Benali after 2 h. Please assign or acknowledge.",
      });
      break;
    case "rejected":
      a.state = "rejected";
      a.ack = { person_id: "tech-a1", at: "2026-10-15T09:45:00Z", decision: "rejected", note: "Sensor recently recalibrated" };
      break;
  }
  return alerts;
}
