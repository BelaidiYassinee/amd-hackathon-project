import type { MachineSummary } from "../../types";
import { Spinner } from "../ui/Spinner";
import { MachineCard } from "./MachineCard";

export function MachineList({
  machines,
  selectedId,
  onSelect,
}: {
  machines: MachineSummary[] | undefined;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (!machines) {
    return (
      <div className="flex items-center gap-2 p-2 text-sm text-slate-400">
        <Spinner /> Loading machines…
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {machines.map((m) => (
        <MachineCard key={m.id} machine={m} selected={m.id === selectedId} onSelect={() => onSelect(m.id)} />
      ))}
    </div>
  );
}
