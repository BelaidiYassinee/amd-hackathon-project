import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { dismiss, useNotes, type Note } from "../../lib/notify";

// Matches the `note` animation in index.css (4 s), plus a little slack.
const LIFETIME_MS = 4300;

/**
 * Green confirmations, bottom-right. Each one pops up, stays ~2.5 s, then fades out while drifting up
 * (the `animate-note` CSS animation); it is removed when the animation ends.
 */
export function Notifications() {
  const notes = useNotes();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} />
      ))}
    </div>
  );
}

function NoteCard({ note: n }: { note: Note }) {
  // Backup: remove it on a timer too, so it can never stay on screen if the animation does not run.
  useEffect(() => {
    const t = setTimeout(() => dismiss(n.id), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [n.id]);

  return (
    <div
      role="status"
      onAnimationEnd={() => dismiss(n.id)}
      className="flex animate-note items-start gap-3 rounded-xl border border-emerald-400/40 bg-emerald-950/80 px-4 py-3 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl will-change-transform"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-emerald-100">{n.title}</div>
        {n.detail && <div className="mt-0.5 truncate text-xs text-emerald-300/70">{n.detail}</div>}
      </div>
    </div>
  );
}
