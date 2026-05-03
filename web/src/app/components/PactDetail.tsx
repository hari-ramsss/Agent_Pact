import type { Pact, Agent } from "@/lib/data";

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
  pact: Pact | null;
  agents: Agent[];
  onAction: (action: string, pactId: number) => void;
}

export function PactDetail({ pact, agents, onAction }: Props) {
  if (!pact) {
    return (
      <div className="flex flex-col gap-3.5">
        <Panel title="PACT DETAIL">
          <div className="p-10 text-center text-[13px] text-[var(--color-muted)]">Select a pact to inspect</div>
        </Panel>
      </div>
    );
  }

  const p = pact;
  const agent = agents.find(a => a.addr.startsWith(p.agentB.slice(0, 6)));

  const timelineSteps = [
    { name: "Pact created", time: p.created, done: true },
    { name: "Worker accepted", time: p.status !== "Created" ? p.created : "—", done: p.status !== "Created" },
    { name: "Work submitted", time: p.submission ? p.created : "—", done: !!p.submission },
    { name: "Dispute raised", time: p.disputed || "—", done: !!p.disputed, active: p.status === "Disputed" },
    { name: "Arbitrator verdict", time: p.resolved || "pending", done: !!p.resolved, active: p.status === "Disputed" },
    { name: "Resolved on-chain", time: p.resolved || "—", done: p.status === "Resolved" },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <Panel title="PACT DETAIL" badge={statusBadge(p.status)}>
        {/* Financials */}
        <Section label="FINANCIALS">
          <Row k="Payment locked" v={`$${p.payment} USDC`} />
          <Row k="Bond posted" v={`$${p.bond} USDC`} />
          <Row k="Total at stake" v={`$${p.payment + p.bond} USDC`} />
          {p.verdict && (
            <Row k="Verdict" v={`${p.verdict.toUpperCase()} (${p.confidence}%)`}
              vClass={p.verdict === "Pass" ? "text-[var(--color-accent)]" : "text-[var(--color-accent2)]"} />
          )}
        </Section>

        {/* Chain of Custody */}
        <Section label="CHAIN OF CUSTODY">
          <Row k="Task spec" v={p.taskSpec} />
          <Row k="Submission" v={p.submission || "—"} />
          <Row k="Verdict record" v={p.verdictURI || "—"} />
        </Section>

        {/* Timeline */}
        <Section label="TIMELINE">
          <div className="space-y-3.5 px-[18px] py-4">
            {timelineSteps.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${s.done ? "bg-[var(--color-accent)]" : s.active ? "bg-[var(--color-accent2)] shadow-[0_0_0_3px_rgba(255,77,109,0.2)]" : "bg-[var(--color-border2)]"}`} />
                <div>
                  <div className={`text-xs font-medium ${s.done ? "" : "text-[var(--color-muted)]"}`}>{s.name}</div>
                  <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">{s.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Actions */}
        {p.status === "Created" && (
          <div className="flex gap-2 px-[18px] py-3.5">
            <Btn label="Accept Pact" primary onClick={() => onAction("accept", p.id)} />
          </div>
        )}
        {p.status === "Active" && (
          <div className="flex gap-2 px-[18px] py-3.5">
            <Btn label="Submit Work" primary onClick={() => onAction("submit", p.id)} />
          </div>
        )}
        {p.status === "Submitted" && (
          <div className="flex gap-2 px-[18px] py-3.5">
            <Btn label="Approve" onClick={() => onAction("approve", p.id)} />
            <Btn label="Raise Dispute" danger onClick={() => onAction("dispute", p.id)} />
          </div>
        )}
      </Panel>

      {/* Rep mini panel */}
      {agent && <RepPanel agent={agent} />}
    </div>
  );
}

function RepPanel({ agent }: { agent: Agent }) {
  const a = agent;
  const goodBal = (parseFloat(a.goodRep) / 1e18).toFixed(0);
  const badBal = (parseFloat(a.badRep) / 1e18).toFixed(0);
  const bond = a.score >= 150 ? "50%" : a.score >= 50 ? "100%" : a.score >= -50 ? "150%" : "200%";
  const scoreColor = a.score >= 0 ? "var(--color-accent)" : "var(--color-accent2)";
  const pct = Math.max(0, Math.min(100, (a.score + 100) / 2));
  const circ = 2 * Math.PI * 22;

  return (
    <Panel title="AGENT REPUTATION">
      <div className="flex items-center gap-3.5 border-b border-[var(--color-border)] px-[18px] py-3.5">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-border)" strokeWidth="4" />
          <circle cx="26" cy="26" r="22" fill="none" stroke={scoreColor} strokeWidth="4"
            strokeDasharray={`${Math.round(circ * pct / 100)} ${Math.round(circ)}`}
            strokeDashoffset={Math.round(circ * 0.25)} strokeLinecap="round" />
          <text x="26" y="30" textAnchor="middle" fontSize="13" fontWeight="500" fill={scoreColor} fontFamily="monospace">{a.score}</text>
        </svg>
        <div>
          <div className="font-[family-name:var(--font-mono)] text-[28px] font-medium leading-none" style={{ color: scoreColor }}>{a.score >= 0 ? "+" : ""}{a.score}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">credit score · bond: {bond}</div>
        </div>
      </div>
      <Section label="">
        <RepBar label="$GOODREP" value={goodBal} pct={Math.min(100, parseFloat(goodBal) / 2)} color="bg-[var(--color-accent)]" />
        <RepBar label="$BADREP" value={badBal} pct={Math.min(100, parseFloat(badBal) / 2)} color="bg-[var(--color-accent2)]" />
      </Section>
      <Section label="">
        <Row k="Agent type" v={a.type} />
        <Row k="Total pacts" v={a.pacts.toString()} />
        <Row k="Metadata URI" v={a.metaURI} />
      </Section>
    </Panel>
  );
}

/* ── Shared sub-components ── */

function Panel({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-[18px] py-3.5">
        <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-border)] px-[18px] py-4 last:border-b-0">
      {label && <div className="mb-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-widest text-[var(--color-muted)]">{label}</div>}
      {children}
    </div>
  );
}

function Row({ k, v, vClass }: { k: string; v: string; vClass?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs last:mb-0">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className={`max-w-[180px] truncate text-right font-[family-name:var(--font-mono)] text-[11px] ${vClass || ""}`}>{v}</span>
    </div>
  );
}

function Btn({ label, primary, danger, onClick }: { label: string; primary?: boolean; danger?: boolean; onClick: () => void }) {
  const base = "rounded-md border px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs font-bold tracking-wider transition-all cursor-pointer";
  const style = primary
    ? "bg-[var(--color-accent)] text-[#001a0e] border-[var(--color-accent)] hover:opacity-90"
    : danger
      ? "border-[var(--color-accent2)] text-[var(--color-accent2)] hover:bg-[rgba(255,77,109,0.08)]"
      : "border-[var(--color-border2)] hover:bg-[var(--color-bg2)]";
  return <button className={`${base} ${style}`} onClick={onClick}>{label}</button>;
}

function RepBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[11px] text-[var(--color-muted)]">
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--color-bg3)]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
