"use client";

import { useEffect, useRef } from "react";
import type { Pact } from "@/lib/data";

interface Props {
  pacts: Pact[];
}

export function ArbitratorView({ pacts }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const disputed = pacts.filter(p => p.status === "Disputed");
  const resolved = pacts.filter(p => p.status === "Resolved");
  const model = process.env.NEXT_PUBLIC_OG_COMPUTE_MODEL || "not set";
  const strictMode = process.env.NEXT_PUBLIC_OG_COMPUTE_STRICT || "false";
  const configuredMode = process.env.NEXT_PUBLIC_OG_COMPUTE_MODE;
  const mode = configuredMode || (strictMode === "true" ? "strict" : "fallback");
  const computeUrl = process.env.NEXT_PUBLIC_OG_COMPUTE_URL || "https://compute-network-6.integratenetwork.work/v1/proxy";
  const liveLines = buildLiveTrace(pacts);
  const confidenceValues = resolved
    .map((p) => p.confidence)
    .filter((v): v is number => typeof v === "number");
  const avgConfidence = confidenceValues.length
    ? `${Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)}%`
    : "—";
  const status = disputed.length > 0 ? "ACTIVE" : "READY";

  useEffect(() => {
    if (!feedRef.current) return;
    const lines = feedRef.current.querySelectorAll(".arb-line");
    lines.forEach((el, i) => {
      const line = el as HTMLElement;
      line.style.opacity = "0";
      setTimeout(() => {
        line.style.transition = "opacity 0.3s";
        line.style.opacity = "1";
      }, i * 120);
    });
  }, []);

  return (
    <div className="grid grid-cols-[1fr_340px] gap-4">
      {/* Reasoning trace */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-[18px] py-3.5">
          <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">REASONING TRACE</span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-accent)]">● LIVE</span>
        </div>
        <div ref={feedRef} className="max-h-[400px] overflow-y-auto px-[18px] py-3">
          {liveLines.map((l, i) => (
            <div key={i} className="arb-line border-b border-[var(--color-border)] py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)] last:border-b-0">
              <span className={`mr-1.5 ${l.type === "warn" ? "text-[var(--color-accent2)]" : "text-[var(--color-accent3)]"}`}>[{l.tag}]</span>
              {l.msg}
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-3.5">
        {/* Pending cases */}
        <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
          <div className="border-b border-[var(--color-border)] px-[18px] py-3.5">
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">PENDING CASES</span>
          </div>
          {disputed.length === 0 ? (
            <div className="p-8 text-center font-[family-name:var(--font-mono)] text-xs text-[var(--color-muted)]">NO PENDING CASES</div>
          ) : (
            disputed.map(p => (
              <div key={p.id} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-[var(--color-border)] px-[18px] py-3 last:border-b-0">
                <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">#{p.id}</div>
                <div>
                  <div className="text-[13px] font-medium">{p.task}</div>
                  <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-muted)]">{p.agentB}</div>
                </div>
                <span className="rounded bg-[#501313] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-wider text-[#F09595]">DISPUTED</span>
              </div>
            ))
          )}
        </div>

        {/* 0G Compute panel */}
        <div className="overflow-hidden rounded-xl border border-[var(--color-border2)]">
          <div className="border-b border-[var(--color-border)] px-[18px] py-3.5">
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-medium tracking-wider">0G COMPUTE</span>
          </div>
          <div className="px-[18px] py-4">
            <Row k="Model" v={model} />
            <Row k="Mode" v={mode} />
            <Row k="Status" v={status} vClass={status === "ACTIVE" ? "text-[var(--color-accent2)]" : "text-[var(--color-accent)]"} />
            <Row k="Verdicts issued" v={resolved.length.toString()} />
            <Row k="Avg confidence" v={avgConfidence} />
            <Row k="0G KV cases" v={`${resolved.length} records`} />
            <Row k="Endpoint" v={shortenUrl(computeUrl)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, vClass }: { k: string; v: string; vClass?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs last:mb-0">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className={`font-[family-name:var(--font-mono)] text-[11px] ${vClass || ""}`}>{v}</span>
    </div>
  );
}

type TraceLine = { tag: string; msg: string; type: "info" | "warn" };

function buildLiveTrace(pacts: Pact[]): TraceLine[] {
  const latest = [...pacts].sort((a, b) => b.id - a.id).slice(0, 12);
  const lines: TraceLine[] = [];

  for (const p of latest) {
    if (p.status === "Disputed") {
      lines.push({ tag: "EVENT", msg: `ArbitrationRequested for pact #${p.id}`, type: "warn" });
      lines.push({ tag: "STEP1", msg: `Loading task spec ${p.taskSpec || "—"}`, type: "info" });
      lines.push({ tag: "STEP2", msg: `Loading submission ${p.submission || "—"}`, type: "info" });
      lines.push({ tag: "STEP3", msg: `Running requirement checks for pact #${p.id}`, type: "warn" });
    } else if (p.status === "Resolved") {
      lines.push({
        tag: "VERDICT",
        msg: `Pact #${p.id} resolved${p.verdict ? ` (${p.verdict.toUpperCase()})` : ""}`,
        type: "info",
      });
    } else if (p.status === "Submitted") {
      lines.push({ tag: "QUEUE", msg: `Pact #${p.id} submitted, awaiting employer/dispute`, type: "info" });
    }
  }

  if (lines.length === 0) {
    lines.push({ tag: "IDLE", msg: "No recent arbitration activity found on-chain.", type: "info" });
  }
  return lines;
}

function shortenUrl(url: string): string {
  if (url.length <= 42) return url;
  return `${url.slice(0, 30)}...${url.slice(-9)}`;
}
