import type { Pact } from "@/lib/data";

function statusBadge(status: string) {
  const cls: Record<string, string> = {
    Created: "bg-[#042C53] text-[#85B7EB]",
    Active: "bg-[#173404] text-[#97C459]",
    Submitted: "bg-[#412402] text-[#FAC775]",
    Disputed: "bg-[#501313] text-[#F09595]",
    Resolved: "bg-[#04342C] text-[#5DCAA5]",
  };
  return (
    <span className={`rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-wider ${cls[status] || ""}`}>
      {status.toUpperCase()}
    </span>
  );
}

interface Props {
  pacts: Pact[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function PactList({ pacts, selectedId, onSelect }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-[18px] py-3.5">
        <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">PACT REGISTRY</span>
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">{pacts.length} pacts</span>
      </div>
      <div>
        {pacts.map(p => (
          <div key={p.id} onClick={() => onSelect(p.id)}
            className={`grid cursor-pointer grid-cols-[56px_1fr_auto_auto_96px] items-center gap-3 border-b border-[var(--color-border)] px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[var(--color-bg2)] ${selectedId === p.id ? "bg-[var(--color-bg3)]" : ""}`}>
            <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">#{p.id}</div>
            <div>
              <div className="text-[13px] font-medium">{p.task}</div>
              <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">{p.agentA} → {p.agentB}</div>
            </div>
            <div>{statusBadge(p.status)}</div>
            <div className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[13px] font-medium">${p.payment}</div>
            <div className="text-right text-[11px] text-[var(--color-muted)]">{p.created}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
