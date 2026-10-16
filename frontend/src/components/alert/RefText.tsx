// Manual section ids look like P101-PR-01 / P101-SAF-01 (00 §10.4).
const MANUAL_REF = /(P\d{3}-[A-Z]+-\d{2})/g;

/** Renders text, turning manual section ids like "(P101-PR-01)" into chips that open the manual. */
export function RefText({ text, onOpenManual }: { text: string; onOpenManual: (sectionId: string) => void }) {
  // split() with a capture group puts the matches at odd indices.
  const parts = text.split(MANUAL_REF);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <button
            key={i}
            type="button"
            onClick={() => onOpenManual(p)}
            className="mx-0.5 rounded bg-sky-500/15 px-1 font-mono text-[11px] text-sky-300 hover:bg-sky-500/25"
          >
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
