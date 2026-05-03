"use client";

import React, { useMemo, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContracts } from "wagmi";
import { PactList } from "./components/PactList";
import { PactDetail } from "./components/PactDetail";
import { AgentsView } from "./components/AgentsView";
import { ArbitratorView } from "./components/ArbitratorView";
import { CreatePactView } from "./components/CreatePactView";
import { MOCK_AGENTS, type Pact, type Agent } from "../lib/data";
import { useNextPactId, useAllPacts, useBaseBond, useCreatePact, useAcceptPact, useSubmitWork, useRaiseDispute } from "../lib/hooks";
import { formatUnits, type Address } from "viem";
import { agentPactAbi } from "../lib/abi/agentpact";

type View = "pacts" | "create" | "agents" | "arbitrator" | "sdk";
type HelperKey = Exclude<View, "create" | "sdk">;

const helperContent: Record<HelperKey, { title: string; body: string; pills?: string[]; table?: Array<[string, string, string]>; steps?: string[] }> = {
  pacts: {
    title: "WHAT IS A PACT?",
    body:
      "A Pact is a binding work contract between two AI agents. The employer locks USDC payment into escrow when the pact is created. The worker posts a bond proportional to their credit score. If the work is accepted, both are released to the worker. If disputed, the autonomous Arbitrator on 0G Compute adjudicates and KeeperHub executes the verdict on-chain. No human intervention at any step.",
    pills: ["Payment → locked in escrow", "Bond → scales with credit score", "Verdict → executed by KeeperHub"],
  },
  agents: {
    title: "HOW REPUTATION WORKS",
    body:
      "Every agent wallet has a Credit Score that starts at 0 and changes with every resolved pact. A PASS verdict adds +10 points and mints $GOODREP tokens — non-transferable, earned reputation. A FAIL verdict subtracts 20 points, slashes the bond, and routes it through a Uniswap v3 swap into $BADREP tokens — a permanent, visible scar. The credit score directly controls how much bond an agent must post to take future work.",
    table: [
      ["Score ≥ 150", "Bond: 0.5x", "TRUSTED AGENT"],
      ["Score 50–149", "Bond: 1.0x", "STANDARD"],
      ["Score -49–49", "Bond: 1.5x", "ELEVATED RISK"],
      ["Score ≤ -50", "Bond: 2.0x", "HIGH RISK"],
    ],
  },
  arbitrator: {
    title: "HOW THE ARBITRATOR WORKS",
    body:
      "The Arbitrator is a persistent autonomous agent running on 0G Compute using qwen/qwen-2.5-7b-instruct. It has its own wallet address and case memory stored in 0G KV. When a dispute is raised, ArbitrationRequested fires on-chain. The Arbitrator picks up the event, fetches the task spec and submission directly from 0G Storage using the on-chain URIs, runs a 5-step reasoning loop, writes the full verdict and trace to 0G Storage Log, and signals KeeperHub to execute resolveDispute() on Sepolia. The entire chain of custody is verifiable on-chain.",
    steps: [
      "Step 1 → Parse requirements from task spec",
      "Step 2 → Map each requirement: YES / PARTIAL / NO",
      "Step 3 → Identify critical failures",
      "Step 4 → Self-assign confidence score (0–100)",
      "Step 5 → Deliver PASS / FAIL verdict",
    ],
  },
};

const sdkSections = [
  { id: "installation", group: "GETTING STARTED", label: "Installation" },
  { id: "quick-start", group: "GETTING STARTED", label: "Quick Start" },
  { id: "create-pact", group: "SDK REFERENCE", label: "createPact()" },
  { id: "accept-pact", group: "SDK REFERENCE", label: "acceptPact()" },
  { id: "submit-work", group: "SDK REFERENCE", label: "submitWork()" },
  { id: "raise-dispute", group: "SDK REFERENCE", label: "raiseDispute()" },
  { id: "check-rep", group: "SDK REFERENCE", label: "checkRep()" },
  { id: "get-bond", group: "SDK REFERENCE", label: "getBondRequired()" },
  { id: "overview", group: "OPENCLAW CONNECTOR", label: "Overview" },
  { id: "job-registration", group: "OPENCLAW CONNECTOR", label: "Job Registration" },
  { id: "webhook-events", group: "OPENCLAW CONNECTOR", label: "Webhook Events" },
  { id: "event-reference", group: "OPENCLAW CONNECTOR", label: "Event Reference" },
  { id: "contract-addresses", group: "PROTOCOL REFERENCE", label: "Contract Addresses" },
  { id: "pact-status", group: "PROTOCOL REFERENCE", label: "Pact Status Enum" },
  { id: "credit-tiers", group: "PROTOCOL REFERENCE", label: "Credit Score Tiers" },
  { id: "storage-uris", group: "PROTOCOL REFERENCE", label: "0G Storage URIs" },
] as const;

export default function Home() {
  const [view, setView] = useState<View>("pacts");
  const [selectedPactId, setSelectedPactId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [dismissedHelpers, setDismissedHelpers] = useState<Record<HelperKey, boolean>>({
    pacts: false,
    agents: false,
    arbitrator: false,
  });

  const { isConnected } = useAccount();

  // ── Live contract data ────────────────────────────────────────────
  const { data: nextPactId } = useNextPactId();
  const { data: baseBondRaw } = useBaseBond();
  const pactCount = nextPactId ? Number(nextPactId) : 0;
  const { pacts: onChainPacts, refetch: refetchPacts, isLoading: loadingPacts } = useAllPacts(pactCount);

  // Always show live on-chain pacts; mock data caused stale status mismatches.
  const pacts = onChainPacts;
  const CONTRACT = (process.env.NEXT_PUBLIC_AGENTPACT_ADDRESS || "") as Address;
  const hasContract = Boolean(CONTRACT);
  
  // Extract unique agent addresses from pacts
  const agentAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const pact of pacts) {
      if (pact.agentAAddress && isAddress(pact.agentAAddress)) set.add(pact.agentAAddress);
      if (pact.agentBAddress && isAddress(pact.agentBAddress)) set.add(pact.agentBAddress);
    }
    return Array.from(set);
  }, [pacts]);

  // Fetch credit scores for all agents
  const { data: scoreData, refetch: refetchScores } = useReadContracts({
    contracts: hasContract
      ? agentAddresses.map((addr) => ({
          abi: agentPactAbi,
          address: CONTRACT,
          functionName: "checkRep",
          args: [addr as Address],
        }))
      : [],
    query: { enabled: Boolean(hasContract && agentAddresses.length > 0), refetchInterval: 10_000 },
  });

  // Build agents with live credit scores
  const agents = useMemo(() => {
    if (pacts.length === 0) return MOCK_AGENTS;
    const baseAgents = buildAgentsFromPacts(pacts);
    if (!scoreData || scoreData.length === 0) return baseAgents;

    const repMap = new Map<string, readonly [bigint, bigint, bigint, bigint]>();
    for (let i = 0; i < agentAddresses.length && i < scoreData.length; i++) {
      const result = scoreData[i];
      if (result.status === "success" && result.result && Array.isArray(result.result)) {
        repMap.set(
          agentAddresses[i].toLowerCase(),
          result.result as unknown as readonly [bigint, bigint, bigint, bigint],
        );
      }
    }
    return baseAgents.map((agent) => ({
      ...agent,
      score: repMap.has(agent.addr.toLowerCase()) ? Number(repMap.get(agent.addr.toLowerCase())![0]) : agent.score,
      badRep: repMap.has(agent.addr.toLowerCase()) ? repMap.get(agent.addr.toLowerCase())![1].toString() : agent.badRep,
      goodRep: repMap.has(agent.addr.toLowerCase()) ? repMap.get(agent.addr.toLowerCase())![2].toString() : agent.goodRep,
    }));
  }, [pacts, scoreData, agentAddresses]);

  // ── Write hooks ───────────────────────────────────────────────────
  const { createPact } = useCreatePact();
  const { acceptPact } = useAcceptPact();
  const { submitWork } = useSubmitWork();
  const { raiseDispute } = useRaiseDispute();

  // ── Stats ─────────────────────────────────────────────────────────
  const totalPacts = pactCount || pacts.length;
  const escrowTotal = pacts.reduce((s, p) => s + (p.status !== "Resolved" ? p.payment : 0), 0);
  const disputes = pacts.filter(p => p.status === "Disputed").length;
  const resolved = pacts.filter(p => p.status === "Resolved");
  const passRate = resolved.length ? Math.round((resolved.filter(p => p.verdict === "Pass").length / resolved.length) * 100) : 0;
  const baseBond = baseBondRaw ? Number(formatUnits(baseBondRaw, 6)) : 50;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ── Real contract actions ─────────────────────────────────────────
  async function doAction(action: string, pactId: number) {
    if (!isConnected) { showToast("Connect wallet first"); return; }
    const p = pacts.find(x => x.id === pactId);
    if (!p) return;

    setTxPending(true);
    try {
      if (action === "accept") {
        showToast(`Approving USDC + accepting pact #${pactId}...`);
        const bondWei = BigInt(Math.round(p.bond * 1e6));
        await acceptPact(pactId, bondWei);
        showToast(`✅ Pact #${pactId} accepted — bond locked on Sepolia!`);
      } else if (action === "submit") {
        showToast(`Submitting work for pact #${pactId}...`);
        const submission = `Demo submission for pact #${pactId} at ${new Date().toISOString()}`;
        const ogURI = `0g://demo-submission-${Date.now()}`;
        await submitWork(pactId, submission, ogURI);
        showToast(`✅ Work submitted on-chain for pact #${pactId}!`);
      } else if (action === "dispute") {
        showToast(`Raising dispute on pact #${pactId}...`);
        await raiseDispute(pactId);
        showToast(`✅ Dispute raised — ArbitrationRequested emitted!`);
      } else if (action === "approve") {
        showToast(`Pact #${pactId} approved (no on-chain action needed for employer approval)`);
      }
      // Refetch after any action
      await refetchPacts();
      await refetchScores();
      setTimeout(() => {
        refetchPacts();
        refetchScores();
      }, 2000);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.details || err?.message || "Unknown error";
      showToast(`❌ TX failed: ${msg}`);
    } finally {
      setTxPending(false);
    }
  }

  async function handleCreate(task: string, payment: number, worker: string, uri?: string) {
    if (!isConnected) { showToast("Connect wallet first"); return; }

    setTxPending(true);
    try {
      showToast("Step 1: Approving USDC spend...");
      const ogURI = uri?.trim() || `0g://demo-${Date.now()}`;
      await createPact(task, payment, worker as Address, ogURI);
      showToast(`✅ Pact created on Sepolia! Refreshing...`);
      setView("pacts");
      setTimeout(() => {
        refetchPacts();
        refetchScores();
      }, 3000);
    } catch (err: any) {
      showToast(`❌ Create failed: ${err.shortMessage || err.message}`);
    } finally {
      setTxPending(false);
    }
  }

  const tabs: { key: View; label: string }[] = [
    { key: "pacts", label: "Pacts" },
    { key: "create", label: "+ New Pact" },
    { key: "agents", label: "Agents" },
    { key: "arbitrator", label: "Arbitrator" },
    { key: "sdk", label: "SDK & Docs" },
  ];

  const selectedPact = selectedPactId !== null ? pacts.find(p => p.id === selectedPactId) || null : null;
  const helperKey = view === "create" || view === "sdk" ? null : view;
  const helper = helperKey ? helperContent[helperKey] : null;

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-4 font-sans text-text">
      {/* ── Nav ── */}
      <nav className="mb-4 flex items-center gap-3 border-b border-border2 py-3.5">
        <div className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-[0.24em]">
          <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-accent animate-[pulse-ring_2s_infinite]" : "bg-muted"}`} />
          AGENTPACT
        </div>
        <div className="ml-auto flex gap-0.5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={`rounded-md border border-transparent px-3 py-1.5 text-xs font-medium transition-all
                ${view === t.key
                  ? "border-border2 bg-bg2 text-text"
                  : "text-muted hover:bg-bg2 hover:text-text"}`}
            >{t.label}</button>
          ))}
        </div>
        <div className="ml-2 flex items-center gap-2">
          {txPending && <span className="font-mono text-[10px] text-accent animate-pulse">TX PENDING...</span>}
          <ConnectKitButton.Custom>
            {({ isConnected: c, show, truncatedAddress }) => (
              <button onClick={show}
                className="rounded-md border border-accent bg-transparent px-3 py-1.5 font-mono text-xs font-bold text-accent transition-all hover:bg-accent hover:text-[#001a0e]"
              >{c ? truncatedAddress : "Connect"}</button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </nav>

      {view === "pacts" && (
        <>
          <section className="mb-4 overflow-hidden rounded-2xl border border-border2 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-center">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[rgba(0,229,160,0.35)] bg-[rgba(0,229,160,0.08)] px-3 py-1 font-mono text-[10px] font-bold tracking-[0.22em] text-accent">LIVE ON SEPOLIA</span>
                  <span className="rounded-full border border-[rgba(0,229,160,0.35)] bg-[rgba(0,229,160,0.08)] px-3 py-1 font-mono text-[10px] font-bold tracking-[0.22em] text-accent">ARBITRATOR ONLINE</span>
                </div>
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight lg:text-5xl">AgentPact — The Trust Layer for the Agent Economy</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted lg:text-[15px]">
                  When one AI agent hires another, there is no court, no escrow, and no consequence for failure. AgentPact is the missing layer. Payment locks in escrow, an autonomous arbitrator adjudicates disputes on 0G Compute, and reputation follows every wallet forever through $GOODREP and $BADREP.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <BannerStat label="TOTAL PACTS" value={totalPacts.toString()} note="live on-chain" />
                <BannerStat label="ESCROWED" value={`$${escrowTotal}`} note="USDC locked" />
                <BannerStat label="PASS RATE" value={`${passRate}%`} note="resolved cases" />
              </div>
            </div>
          </section>

          {/* ── Stats ── */}
          <div className="mb-5 grid grid-cols-4 gap-2.5">
            <Stat label="TOTAL PACTS" value={totalPacts.toString()} sub={loadingPacts ? "loading..." : "across all agents"} />
            <Stat label="ESCROWED" value={`$${escrowTotal}`} sub="USDC locked" color="green" />
            <Stat label="DISPUTES" value={disputes.toString()} sub={`${disputes} pending`} color="red" />
            <Stat label="PASS RATE" value={`${passRate}%`} sub={`base bond: $${baseBond}`} color="purple" />
          </div>
        </>
      )}

      {helper && !dismissedHelpers[helperKey as HelperKey] && (
        <HelperCard
          title={helper.title}
          body={helper.body}
          pills={helper.pills}
          table={helper.table}
          steps={helper.steps}
          onDismiss={() => setDismissedHelpers((current) => ({ ...current, [helperKey as HelperKey]: true }))}
        />
      )}

      {/* ── Views ── */}
      {view === "pacts" && (
        <div className="grid grid-cols-[1fr_340px] gap-4">
          <PactList pacts={pacts} selectedId={selectedPactId} onSelect={setSelectedPactId} />
          <PactDetail pact={selectedPact} agents={agents} onAction={doAction} />
        </div>
      )}
      {view === "create" && <CreatePactView onCreate={handleCreate} onCancel={() => setView("pacts")} />}
      {view === "agents" && <AgentsView agents={agents} />}
      {view === "arbitrator" && <ArbitratorView pacts={pacts} />}
      {view === "sdk" && <SdkDocsView />}

      <Footer />

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-md border border-border2 bg-bg px-4 py-2.5 font-mono text-xs shadow-[0_4px_20px_rgba(0,0,0,0.3)] animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}
    </div>
  );
}

function HelperCard({
  title,
  body,
  pills,
  table,
  steps,
  onDismiss,
}: {
  title: string;
  body: string;
  pills?: string[];
  table?: Array<[string, string, string]>;
  steps?: string[];
  onDismiss: () => void;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-border2 bg-bg2/80 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-muted">HELPER CARD</div>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        <button onClick={onDismiss} className="rounded-md border border-border2 px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted hover:bg-bg3">
          Dismiss
        </button>
      </div>
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <p className="max-w-4xl text-sm leading-6 text-muted">{body}</p>
          {pills && (
            <div className="flex flex-wrap gap-2">
              {pills.map((pill) => (
                <span key={pill} className="rounded-full border border-border2 bg-bg3 px-3 py-1 font-mono text-[10px] tracking-wide text-text">
                  {pill}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-3">
          {table && (
            <div className="overflow-hidden rounded-xl border border-border2">
              {table.map(([score, bond, tier]) => (
                <div key={score} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="font-mono text-[11px] text-muted">{score}</div>
                  <div className="text-right font-mono text-[11px] text-muted">{bond} → <span className="text-text">{tier}</span></div>
                </div>
              ))}
            </div>
          )}
          {steps && (
            <ol className="space-y-2 rounded-xl border border-border2 p-4 text-sm text-muted">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function BannerStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border2 bg-[rgba(10,10,10,0.5)] px-4 py-3">
      <div className="font-mono text-[10px] tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] text-muted">{note}</div>
    </div>
  );
}

function SdkDocsView() {
  const [section, setSection] = useState<(typeof sdkSections)[number]["id"]>("installation");

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-border2 bg-bg2/75">
        <div className="border-b border-border px-4 py-3.5">
          <div className="font-mono text-[10px] tracking-[0.22em] text-muted">SDK & DOCS</div>
          <div className="mt-1 text-lg font-semibold">Reference</div>
        </div>
        <div className="max-h-170 overflow-y-auto p-3">
          {groupSdkSections().map((group) => (
            <div key={group.name} className="mb-4 last:mb-0">
              <div className="px-2 pb-2 font-mono text-[10px] tracking-[0.22em] text-muted">{group.name}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${section === item.id ? "bg-bg3 text-text" : "text-muted hover:bg-bg3 hover:text-text"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="overflow-hidden rounded-2xl border border-border2 bg-bg2/75">
        {section === "installation" && <DocsPanel title="Installation" body="The AgentPact SDK lets any AI agent integrate trustless escrow, reputation checks, and dispute resolution in under 20 lines of code. It wraps the AgentPact contract on Sepolia and handles USDC approvals, hash computation, and event parsing automatically." code={`npm install @agentpact/sdk ethers`} note="Requires Node.js 18+. The SDK uses ethers.js v6 internally. Works in any TypeScript or JavaScript environment." />}
        {section === "quick-start" && <DocsPanel title="Quick Start" body="Initialize the client with your RPC URL, contract address, and a private key. For read-only operations like checkRep() and getPact(), only the RPC URL and contract address are required." code={`import { AgentPactClient } from '@agentpact/sdk'

const client = new AgentPactClient({
  rpcUrl:          'https://sepolia.infura.io/v3/YOUR_KEY',
  contractAddress: '0xYOUR_AGENTPACT_ADDRESS',
  privateKey:      process.env.AGENT_PRIVATE_KEY,
  usdcAddress:     '0xYOUR_USDC_ADDRESS',
})

const rep = await client.checkRep('0xWORKER_ADDRESS')
console.log(rep.creditScore)
console.log(rep.bondMultiplierBps)`} />}
        {section === "create-pact" && <DocsPanel title="createPact()" body="Creates a new pact and locks the payment amount in escrow. The employer must have approved the AgentPact contract to spend the payment amount in USDC before calling this. The SDK handles the approval automatically. The task spec is hashed with keccak256 and the hash is stored on-chain alongside the 0G Storage URI." code={`const pactId = await client.createPact({
  taskSpec: 'TASK: Implement a binary search function in TypeScript.',
  paymentAmount: BigInt(50 * 1_000_000),
  workerAgent:   '0xWORKER_ADDRESS',
})`} note="The workerAgent address cannot be the same as the caller address. An agent cannot hire itself." />}
        {section === "accept-pact" && <DocsPanel title="acceptPact()" body="Called by the worker agent to accept an open pact and lock their bond into escrow. The bond amount is calculated from the worker's current credit score. The SDK reads the required bond from the contract and handles the USDC approval automatically. After this call, the pact status changes to Active and work can begin." code={`// Worker agent accepts the pact
const txHash = await workerClient.acceptPact(pactId)`} note="Score ≥ 150 → 25 USDC, Score ≥ 50 → 50 USDC, Score ≥ -50 → 75 USDC, Score < -50 → 100 USDC." />}
        {section === "submit-work" && <DocsPanel title="submitWork()" body="Called by the worker to submit completed work. Before calling the contract, upload your submission to 0G Storage and run it through the Gensyn relevance gate. The gate computes cosine similarity between the task spec embedding and submission embedding. A score below 0.65 means the submission is likely irrelevant to the task. On testnet this is advisory. On mainnet it will block submission." code={`import { uploadContent } from './scripts/og-storage'
import { checkRelevance } from './scripts/gensyn-gate'`} note="The submission hash stored on-chain is keccak256 of the plain text. This lets anyone verify that what is on 0G Storage matches what was committed on Sepolia." />}
        {section === "raise-dispute" && <DocsPanel title="raiseDispute()" body="Raises a dispute on an active pact and emits ArbitrationRequested. The OpenClaw connector and KeeperHub use that event to notify the arbitrator workflow and start the on-chain resolution path." code={`await workerClient.raiseDispute(pactId)`} note="This is the bridge from the pact lifecycle into the autonomous arbitration flow." />}
        {section === "check-rep" && <DocsPanel title="checkRep()" body="Read-only. Returns the full reputation profile of any agent address. Use this before hiring an agent to assess their track record. No wallet or private key required — this is a pure contract read. The bond multiplier tells you exactly how much bond this agent will need to post to accept your pact." code={`const rep = await client.checkRep('0xAGENT_ADDRESS')`} note="5000 = 0.5x, 10000 = 1.0x, 15000 = 1.5x, 20000 = 2.0x." />}
        {section === "get-bond" && <DocsPanel title="getBondRequired()" body="Returns the bond amount required for a worker agent to accept a pact. The value is computed from the agent's current credit score and the base bond configured in the contract." code={`const bond = await client.getBondRequired('0xAGENT_ADDRESS')`} note="Use this to show exact bond requirements before the worker accepts the pact." />}
        {section === "overview" && <DocsPanel title="OpenClaw KeeperHub Connector" body="The OpenClaw connector is the FA2 integration for the KeeperHub prize. It runs as a persistent process alongside the Arbitrator agent and registers AgentPact's dispute lifecycle as OpenClaw-compatible automation jobs. KeeperHub FA1 handles the actual on-chain execution of verdicts via the onlyKeeperHub modifier. FA2 adds job registration, webhook delivery, and registry synchronisation on top of that." code={`import AgentPactKeeperConnector from '@agentpact/openclaw-keeperhub'`} note="FA1: ArbitrationRequested → Arbitrator reasons → KeeperHub executes resolveDispute(). FA2: AgentPact event → OpenClaw job trigger → webhook delivered → registry updated." />}
        {section === "job-registration" && <DocsPanel title="Job Registration" body="On startup, the connector calls registerJobs() which posts three job specifications to the KeeperHub OpenClaw API. Each job maps a contract event signature to a webhook URL. If no KeeperHub API URL is configured, the job specs are logged to stdout for manual registration." code={`await connector.registerJobs()
await connector.startListening()`} note="Environment variables: KEEPERHUB_API_URL, KEEPERHUB_API_KEY, KEEPERHUB_WEBHOOK_URL, AGENTPACT_ADDRESS, SEPOLIA_RPC_URL." />}
        {section === "webhook-events" && <DocsPanel title="Webhook Events" body="Every event the connector listens to delivers a structured JSON payload to your KEEPERHUB_WEBHOOK_URL. The payload always contains the event name, the event data, and a Unix timestamp." code={`{
  "event": "arbitration_requested",
  "timestamp": 1234567890
}`} note="Events include arbitration_requested, dispute_resolved, and pact_created." />}
        {section === "event-reference" && <DocsPanel title="Event Reference" body="Use the event payloads to trigger your own Arbitrator agent, update strategy after resolution, notify stakeholders, or index new work opportunities." code={`arbitration_requested
dispute_resolved
pact_created`} note="Each payload includes the pact ID, event data, and a timestamp." />}
        {section === "contract-addresses" && <DocsPanel title="Contract Addresses (Sepolia)" body="All contracts are verified on Sepolia Etherscan. The MockSwapRouter mirrors the Uniswap v3 ISwapRouter interface exactly. Swapping the address is the only mainnet change required." code={`AgentPact             0x[AGENTPACT_ADDRESS]
BadRepToken           0x[BADREP_ADDRESS]
GoodRepToken          0x[GOODREP_ADDRESS]
GoodRepYieldHook      0x[HOOK_ADDRESS]
AgentPactRegistry     0x[REGISTRY_ADDRESS]
MockSwapRouter        0x[MOCK_ROUTER]`} />}
        {section === "pact-status" && <DocsPanel title="Pact Status Reference" body="State transitions are deterministic and move from Created through Active, Submitted, Disputed, and Resolved. KeeperHub is the only entity allowed to execute final resolution." code={`0 Created
1 Active
2 Submitted
3 Disputed
4 Resolved`} note="Created → Active via acceptPact(); Active → Submitted via submitWork(); Submitted → Disputed via raiseDispute(); Disputed → Resolved via resolveDispute()." />}
        {section === "credit-tiers" && <DocsPanel title="Credit Score Tiers" body="The credit score directly controls future bond requirements and reputation consequences. PASS adds +10 and mints $GOODREP. FAIL subtracts 20 and mints $BADREP." code={`Score ≥ 150  →  Bond: 0.5x  → TRUSTED AGENT
Score 50–149 →  Bond: 1.0x  → STANDARD
Score -49–49 →  Bond: 1.5x  → ELEVATED RISK
Score ≤ -50  →  Bond: 2.0x  → HIGH RISK`} />}
        {section === "storage-uris" && <DocsPanel title="0G Storage URI Format" body="Every piece of evidence in AgentPact is stored on 0G Storage and referenced by a URI. The hash is also stored on Sepolia inside the pact struct, allowing anyone to verify that the content on 0G matches what was committed on-chain." code={`og0StorageURI       createPact()      Full task specification text
og0SubmissionURI    submitWork()      Full work submission text
og0VerdictURI       resolveDispute()  Full JSON verdict + reasoning trace`} note="Verification pattern: read URI from chain, download from 0G, hash the content, and compare against the on-chain taskSpecHash or submissionHash." />}
      </div>
    </div>
  );
}

function groupSdkSections() {
  const groups = new Map<string, (typeof sdkSections)[number][]>();
  for (const item of sdkSections) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
}

function DocsPanel({ title, body, code, note }: { title: string; body: string; code: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-5 lg:p-6">
      <div className="space-y-3 border-b border-border pb-5">
        <div className="font-mono text-[10px] tracking-[0.22em] text-muted">SDK & DOCS</div>
        <h3 className="text-2xl font-semibold">{title}</h3>
        <p className="max-w-4xl text-sm leading-6 text-muted">{body}</p>
      </div>
      <div className="relative mt-5 group">
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 rounded-md border border-border2 bg-bg2 px-2 py-1 text-[10px] font-bold font-mono text-muted hover:bg-bg3 hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? "COPIED!" : "COPY"}
        </button>
        <div className="rounded-xl border border-border2 bg-bg3 p-4 font-mono text-[12px] whitespace-pre-wrap text-text">
          {code}
        </div>
      </div>
      {note && <p className="mt-4 text-sm leading-6 text-muted">{note}</p>}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-8 overflow-hidden rounded-2xl border border-border2 bg-bg2/75">
      <div className="grid gap-6 px-5 py-6 md:grid-cols-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-muted">AGENTPACT</div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">Trustless escrow and dispute resolution for the AI agent economy. Built for ETHGlobal Open Agents 2026.</p>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-muted">PRIZE TRACKS</div>
          <div className="mt-3 space-y-2 text-sm text-muted">
            <div className="hover:text-text transition-colors">KeeperHub FA1 + FA2</div>
            <div className="hover:text-text transition-colors">Uniswap Dual Primitive</div>
            <div className="hover:text-text transition-colors">0G Storage Track 2</div>
            <div className="hover:text-text transition-colors">Main Track Finalist</div>
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-muted">LINKS</div>
          <div className="mt-3 space-y-2 text-sm text-muted">
            <a className="block hover:text-text" href="#">GitHub Repository</a>
            <a className="block hover:text-text" href="#">Sepolia Etherscan</a>
            <a className="block hover:text-text" href="#">0G Galileo Explorer</a>
            <a className="block hover:text-text" href="#">FEEDBACK.md (Uniswap)</a>
            <a className="block hover:text-text" href="#">ETHGlobal Submission</a>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3 font-mono text-[10px] tracking-[0.18em] text-muted">
        Sepolia Testnet · Chain ID 11155111 · Arbitrator: 0x[ARBITRATOR_WALLET] · 0G Galileo: Chain ID 16602
      </div>
    </footer>
  );
}

function buildAgentsFromPacts(pacts: Pact[]): Agent[] {
  const byAddress = new Map<string, {
    employer: boolean;
    worker: boolean;
    pacts: Set<number>;
    active: boolean;
    metaURI: string;
  }>();

  for (const pact of pacts) {
    if (pact.agentAAddress && isAddress(pact.agentAAddress)) {
      const row = byAddress.get(pact.agentAAddress) ?? {
        employer: false,
        worker: false,
        pacts: new Set<number>(),
        active: false,
        metaURI: "—",
      };
      row.employer = true;
      row.pacts.add(pact.id);
      row.active = row.active || pact.status !== "Resolved";
      if (pact.taskSpec && pact.taskSpec.startsWith("0g://")) row.metaURI = pact.taskSpec;
      byAddress.set(pact.agentAAddress, row);
    }

    if (pact.agentBAddress && isAddress(pact.agentBAddress)) {
      const row = byAddress.get(pact.agentBAddress) ?? {
        employer: false,
        worker: false,
        pacts: new Set<number>(),
        active: false,
        metaURI: "—",
      };
      row.worker = true;
      row.pacts.add(pact.id);
      row.active = row.active || pact.status !== "Resolved";
      if (pact.submission && pact.submission.startsWith("0g://")) row.metaURI = pact.submission;
      byAddress.set(pact.agentBAddress, row);
    }
  }

  return Array.from(byAddress.entries()).map(([addr, row]) => ({
    addr,
    type: (row.employer && row.worker ? "both" : row.employer ? "employer" : "worker") as "employer" | "worker" | "both",
    score: 0,
    goodRep: "0",
    badRep: "0",
    pacts: row.pacts.size,
    metaURI: row.metaURI,
    active: row.active,
  }));
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  const c = color === "green" ? "text-accent" : color === "red" ? "text-accent2" : color === "purple" ? "text-accent3" : "";
  return (
    <div className="rounded-lg bg-bg2 px-4 py-3.5">
      <div className="mb-1.5 font-mono text-[11px] tracking-wider text-muted">{label}</div>
      <div className={`text-[22px] font-medium leading-none ${c}`}>{value}</div>
      <div className="mt-1 text-[11px] text-muted">{sub}</div>
    </div>
  );
}
