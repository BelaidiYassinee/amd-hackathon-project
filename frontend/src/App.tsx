import { useState } from "react";
import { api } from "./api";
import { usePoll } from "./hooks/usePoll";
import { MachineCard } from "./components/MachineCard";

export default function App() {
  const plant = usePoll(api.plant, 1000);
  const [selectedId, setSelectedId] = useState("P-101");

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Maintenance Copilot</h1>
      {!plant.data && <div className="text-slate-400">Loading plant…</div>}
      <div className="flex w-[280px] flex-col gap-3">
        {plant.data?.machines.map((m) => (
          <MachineCard key={m.id} machine={m} selected={m.id === selectedId} onSelect={() => setSelectedId(m.id)} />
        ))}
      </div>
    </div>
  );
}
