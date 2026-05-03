"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import type { Agent } from "@/lib/data";
import { agentPactAbi } from "@/lib/abi/agentpact";

interface Props {
  agents: Agent[];
}

export function AgentsView({ agents }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx !== null ? agents[selectedIdx] : null;

  return (
    <div className="grid grid-cols-[1fr_340px] gap-4">
      {/* Agent list */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
        <div className="border-b border-[var(--color-border)] px-[18px] py-3.5">
          <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">AGENT REGISTRY</span>
        </div>
        {agents.map((a, i) => {
          const scoreColor = a.score >= 0 ? "var(--color-accent)" : "var(--color-accent2)";
          return (
            <div key={a.addr} onClick={() => setSelectedIdx(i)}
              className={`grid cursor-pointer grid-cols-[56px_1fr_auto_auto_96px] items-center gap-3 border-b border-[var(--color-border)] px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[var(--color-bg2)] ${selectedIdx === i ? "bg-[var(--color-bg3)]" : ""}`}>
              <div className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-muted)]">{a.type.toUpperCase()}</div>
              <div>
                <div className="font-[family-name:var(--font-mono)] text-xs font-medium">{a.addr}</div>
                <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">{a.pacts} pacts · {a.active ? "active" : "inactive"}</div>
              </div>
              <div />
              <div className="font-[family-name:var(--font-mono)] text-[13px] font-medium" style={{ color: scoreColor }}>{a.score >= 0 ? "+" : ""}{a.score}</div>
              <div className="text-right">
                <span className={`rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-wider ${a.active ? "bg-[#173404] text-[#97C459]" : "bg-[#042C53] text-[#85B7EB]"}`}>
                  {a.type.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent detail */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
        <div className="border-b border-[var(--color-border)] px-[18px] py-3.5">
          <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">AGENT PROFILE</span>
        </div>
        {!selected ? (
          <div className="p-10 text-center text-[13px] text-[var(--color-muted)]">Select an agent</div>
        ) : (
          <AgentProfile agent={selected} />
        )}
      </div>
    </div>
  );
}

function AgentProfile({ agent: a }: { agent: Agent }) {
  const contract = (process.env.NEXT_PUBLIC_AGENTPACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address;
  const hasContract = Boolean(process.env.NEXT_PUBLIC_AGENTPACT_ADDRESS);
  const isFullAddress = /^0x[a-fA-F0-9]{40}$/.test(a.addr);
  const canCheckLive = hasContract && isFullAddress;
  const { data: repData, refetch: refetchRep, isFetching } = useReadContract({
    abi: agentPactAbi,
    address: contract,
    functionName: "checkRep",
    args: canCheckLive ? [a.addr as Address] : undefined,
    query: { enabled: canCheckLive },
  });

  const liveScore = repData ? Number(repData[0]) : a.score;
  const liveBadRep = repData ? Number(formatUnits(repData[1], 18)) : parseFloat(a.badRep) / 1e18;
  const liveGoodRep = repData ? Number(formatUnits(repData[2], 18)) : parseFloat(a.goodRep) / 1e18;
  const liveBondMultiplier = repData ? Number(repData[3]) / 100 : null;

  const goodBal = Math.round(liveGoodRep).toString();
  const badBal = Math.round(liveBadRep).toString();
  const bond = liveBondMultiplier !== null
    ? `${liveBondMultiplier}% of base`
    : liveScore >= 150 ? "$25 USDC" : liveScore >= 50 ? "$50 USDC" : liveScore >= -50 ? "$75 USDC" : "$100 USDC";
  const scoreColor = liveScore >= 0 ? "var(--color-accent)" : "var(--color-accent2)";
  const pct = Math.max(0, Math.min(100, (liveScore + 100) / 2));
  const circ = 2 * Math.PI * 22;

  return (
    <>
      {/* Score ring */}
      <div className="flex items-center gap-3.5 border-b border-[var(--color-border)] px-[18px] py-3.5">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-border)" strokeWidth="4" />
          <circle cx="26" cy="26" r="22" fill="none" stroke={scoreColor} strokeWidth="4"
            strokeDasharray={`${Math.round(circ * pct / 100)} ${Math.round(circ)}`}
            strokeDashoffset={Math.round(circ * 0.25)} strokeLinecap="round" />
          <text x="26" y="30" textAnchor="middle" fontSize="13" fontWeight="500" fill={scoreColor} fontFamily="monospace">{liveScore}</text>
        </svg>
        <div>
          <div className="font-[family-name:var(--font-mono)] text-[28px] font-medium leading-none" style={{ color: scoreColor }}>{liveScore >= 0 ? "+" : ""}{liveScore}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">credit score</div>
        </div>
      </div>

      {/* Identity */}
      <div className="border-b border-[var(--color-border)] px-[18px] py-4">
        <div className="mb-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-widest text-[var(--color-muted)]">IDENTITY</div>
        <Row k="Wallet" v={a.addr} />
        <Row k="Type" v={a.type} />
        <Row k="Metadata" v={a.metaURI} />
      </div>

      {/* Rep tokens */}
      <div className="border-b border-[var(--color-border)] px-[18px] py-4">
        <div className="mb-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-widest text-[var(--color-muted)]">REPUTATION TOKENS</div>
        <RepBar label="$GOODREP" value={goodBal} pct={Math.min(100, parseFloat(goodBal) / 2)} color="bg-[var(--color-accent)]" />
        <RepBar label="$BADREP" value={badBal} pct={Math.min(100, parseFloat(badBal) / 2)} color="bg-[var(--color-accent2)]" />
      </div>

      {/* Stats */}
      <div className="border-b border-[var(--color-border)] px-[18px] py-4">
        <div className="mb-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-widest text-[var(--color-muted)]">PROTOCOL STATS</div>
        <Row k="Total pacts" v={a.pacts.toString()} />
        <Row k="Bond required" v={bond} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-[18px] py-3.5">
        <button
          onClick={() => canCheckLive && refetchRep()}
          disabled={!canCheckLive || isFetching}
          className="rounded-md border border-[var(--color-border2)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs font-bold tracking-wider transition-all hover:bg-[var(--color-bg2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetching ? "Checking..." : "Check Rep"}
        </button>
        <button
          onClick={() => {
            if (!a.metaURI || a.metaURI === "—") return;
            const target = a.metaURI.startsWith("0g://")
              ? `/api/og?uri=${encodeURIComponent(a.metaURI)}`
              : a.metaURI;
            window.open(target, "_blank", "noopener,noreferrer");
          }}
          disabled={!a.metaURI || a.metaURI === "—"}
          className="rounded-md border border-[var(--color-border2)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs font-bold tracking-wider transition-all hover:bg-[var(--color-bg2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          View on 0G ↗
        </button>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs last:mb-0">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="max-w-[180px] truncate text-right font-[family-name:var(--font-mono)] text-[11px]">{v}</span>
    </div>
  );
}

function RepBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[11px] text-[var(--color-muted)]"><span>{label}</span><span>{value}</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--color-bg3)]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
