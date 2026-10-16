import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "../../api";
import type { ManualSection } from "../../types";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

export function ManualModal({ sectionId, onClose }: { sectionId: string; onClose: () => void }) {
  const [section, setSection] = useState<ManualSection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSection(null);
    setError(null);
    api
      .manual(sectionId)
      .then((s) => alive && setSection(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sectionId]);

  return (
    <Modal
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-sky-400" />
          <span className="font-mono text-sm text-sky-300">{sectionId}</span>
          {section && <span className="truncate">{section.title}</span>}
        </span>
      }
    >
      {error ? (
        <div className="text-sm text-red-400">Could not load the manual section: {error}</div>
      ) : !section ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner /> Loading manual…
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{section.text}</div>
      )}
    </Modal>
  );
}
