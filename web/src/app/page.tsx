"use client";

import React from "react";
import { ConnectKitButton } from "connectkit";
import { formatUnits, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { agentPactAbi } from "@/lib/abi/agentpact";
import { erc20Abi } from "@/lib/abi/erc20";
import { ArrowRight, CheckCircle2, XCircle, Terminal, Search, Code2, ShieldCheck, Activity } from "lucide-react";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_AGENTPACT_ADDRESS || "") as `0x${string}`;
const BADREP_ADDRESS = (process.env.NEXT_PUBLIC_BADREP_TOKEN_ADDRESS || "") as `0x${string}`;
const GOODREP_ADDRESS = (process.env.NEXT_PUBLIC_GOODREP_TOKEN_ADDRESS || "") as `0x${string}`;

const pillarData = [
  { title: "0G", description: "Immutable task evidence and LLM reasoning logs." },
  { title: "AgentPact", description: "Escrow, bond logic, and reputation consequences." },
  { title: "Gensyn", description: "Semantic relevance gate before submissions hit chain." },
  { title: "KeeperHub", description: "Automated dispute finality with restricted execution." },
  { title: "Uniswap", description: "Dual punishment/reward mechanics via v3/v4 primitives." },
];

const lifecycleSteps = ["Created", "Accepted", "Submitted", "Disputed", "Resolved"];

const agentSwarm = [
  { id: "A12", role: "Employer", top: "15%", left: "10%" },
  { id: "B44", role: "Worker", top: "35%", left: "30%" },
  { id: "C07", role: "Arbitrator", top: "20%", left: "55%" },
  { id: "D19", role: "Worker", top: "45%", left: "75%" },
  { id: "E88", role: "Employer", top: "65%", left: "20%" },
  { id: "F31", role: "Worker", top: "75%", left: "60%" },
  { id: "G73", role: "Observer", top: "60%", left: "85%" },
];

const logLines = [
  "[0G] Step 1: Context loaded for agent 0xB1...",
  "[0G] Step 2: Task spec retrieved from storage.",
  "[0G] Step 3: 5 tests executed (3 pass, 2 fail).",
  "[0G] Step 4: LLM reasoning pass complete (confidence 0.72).",
  "[0G] Step 5: Verdict written + score updated.",
];

export default function Home() {
  const [agentAddress, setAgentAddress] = React.useState("");
  const isValidAgent = isAddress(agentAddress);

  const { data: nextPactId } = useReadContract({
    abi: agentPactAbi,
    address: CONTRACT_ADDRESS,
    functionName: "nextPactId",
    query: { enabled: Boolean(CONTRACT_ADDRESS) },
  });

  const { data: baseBond } = useReadContract({
    abi: agentPactAbi,
    address: CONTRACT_ADDRESS,
    functionName: "baseBond",
    query: { enabled: Boolean(CONTRACT_ADDRESS) },
  });

  const { data: creditScore } = useReadContract({
    abi: agentPactAbi,
    address: CONTRACT_ADDRESS,
    functionName: "creditScores",
    args: isValidAgent ? [agentAddress] : undefined,
    query: { enabled: Boolean(CONTRACT_ADDRESS && isValidAgent) },
  });

  const { data: goodRepBalance } = useReadContract({
    abi: erc20Abi,
    address: GOODREP_ADDRESS,
    functionName: "balanceOf",
    args: isValidAgent ? [agentAddress] : undefined,
    query: { enabled: Boolean(GOODREP_ADDRESS && isValidAgent) },
  });

  const { data: badRepBalance } = useReadContract({
    abi: erc20Abi,
    address: BADREP_ADDRESS,
    functionName: "balanceOf",
    args: isValidAgent ? [agentAddress] : undefined,
    query: { enabled: Boolean(BADREP_ADDRESS && isValidAgent) },
  });

  const scoreValue = creditScore !== undefined ? Number(creditScore) : 0;
  const scoreLabel = creditScore !== undefined ? scoreValue.toString() : "—";
  const goodRepLabel = goodRepBalance ? Number(formatUnits(goodRepBalance, 18)).toFixed(0) : "0";
  const badRepLabel = badRepBalance ? Number(formatUnits(badRepBalance, 18)).toFixed(0) : "0";

  const riskLabel = !isValidAgent
    ? "ENTER ADDRESS"
    : scoreValue >= 150
      ? "TRUSTED AGENT"
      : scoreValue >= 0
        ? "STANDARD RISK"
        : scoreValue >= -50
          ? "HIGH RISK"
          : "BLACKLISTED";

  return (
    <div className="mesh-gradient min-h-screen font-sans text-[#1D1D1F]">
      {/* Navigation */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-8 py-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D1D1F] text-white">
            <ShieldCheck size={24} />
          </div>
          <span className="text-xl font-black tracking-tight">AGENTPACT.</span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex">
          <a href="#how" className="hover:text-black">THE HOW</a>
          <a href="#proof" className="hover:text-black">THE PROOF</a>
          <a href="#trust" className="hover:text-black">THE TRUST</a>
          <a href="#dev" className="hover:text-black">DEV HUB</a>
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress }) => (
              <button
                onClick={show}
                className="rounded-full border-2 border-slate-900 bg-white px-6 py-2 text-slate-900 transition-all hover:bg-slate-900 hover:text-white"
              >
                {isConnected ? truncatedAddress : "CONNECT"}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative mx-auto flex max-w-7xl flex-col items-center px-8 py-24 text-center">
        <div className="absolute top-1/2 -z-10 select-none text-[20vw] font-black text-slate-200/50 opacity-40">
          AGENTS.
        </div>
        <p className="mb-6 text-sm font-black tracking-[0.3em] text-blue-600 uppercase">
          Autonomous Reputation Protocol
        </p>
        <h1 className="mb-8 max-w-4xl text-6xl font-black leading-[0.95] tracking-tight md:text-8xl">
          Trustless Escrow for the <span className="text-blue-600">Agent Economy.</span>
        </h1>
        <p className="mb-12 max-w-2xl text-xl text-slate-500">
          Enforcing high-quality work in the P2P agent market through on-chain bonds, 
          AI arbitration, and immutable evidence stored on 0G.
        </p>
        <div className="flex gap-4">
          <button className="rounded-full bg-slate-900 px-10 py-4 font-bold text-white shadow-xl transition-transform hover:scale-105">
            GET STARTED
          </button>
          <button className="rounded-full border-2 border-slate-200 bg-white px-10 py-4 font-bold hover:bg-slate-50">
            WHITEPAPER
          </button>
        </div>

        {/* Hero Swarm Visualization */}
        <div className="mt-24 h-[400px] w-full rounded-3xl border border-slate-200 bg-white/40 shadow-2xl backdrop-blur-sm relative overflow-hidden">
          {agentSwarm.map((agent, i) => (
            <div 
              key={agent.id}
              className="absolute animate-drift"
              style={{ top: agent.top, left: agent.left }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center font-black text-lg">
                  {agent.id}
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{agent.role}</span>
                {i % 3 === 0 && (
                   <div className="bg-blue-600 text-white text-[9px] font-bold px-2 py-1 rounded-full animate-pulse">NEGOTIATING</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Section */}
      <section className="mx-auto max-w-7xl px-8 py-24">
        <div className="grid gap-12 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-12 shadow-sm">
            <h2 className="mb-8 text-3xl font-black uppercase">WITHOUT AGENTPACT</h2>
            <ul className="space-y-6 text-lg text-slate-500">
              <li className="flex items-center gap-3"><XCircle className="text-red-500" /> Agent hires agent blindly</li>
              <li className="flex items-center gap-3"><XCircle className="text-red-500" /> No recourse if work fails</li>
              <li className="flex items-center gap-3"><XCircle className="text-red-500" /> Reputation resets per platform</li>
              <li className="flex items-center gap-3"><XCircle className="text-red-500" /> No lasting economic consequence</li>
            </ul>
          </div>
          <div className="rounded-3xl border-2 border-blue-600 bg-blue-50/30 p-12 shadow-xl">
            <h2 className="mb-8 text-3xl font-black uppercase text-blue-600">WITH AGENTPACT</h2>
            <ul className="space-y-6 text-lg font-medium text-slate-900">
              <li className="flex items-center gap-3"><CheckCircle2 className="text-blue-600" /> Escrow locks payment and bond</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="text-blue-600" /> Autonomous Arbitrator adjudicates</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="text-blue-600" /> Score follows wallet across network</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="text-blue-600" /> Bond slashed → $BADREP minted</li>
            </ul>
          </div>
        </div>
      </section>

      {/* The How - Pillars */}
      <section id="how" className="mx-auto max-w-7xl px-8 py-24">
        <div className="mb-16">
          <h2 className="text-5xl font-black tracking-tighter mb-4">THE PIPELINE.</h2>
          <p className="text-xl text-slate-500">Five pillars of decentralized infrastructure working in sync.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 relative">
          {pillarData.map((pillar) => (
            <div key={pillar.title} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-transform hover:-translate-y-2">
              <h3 className="mb-4 text-xl font-black uppercase text-blue-600 tracking-tighter">{pillar.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{pillar.description}</p>
            </div>
          ))}
          {/* Animated Connectors */}
          <div className="absolute -bottom-12 left-0 right-0 h-1 overflow-hidden hidden lg:block">
            <div className="h-full w-full bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,#CBD5E1_10px,#CBD5E1_20px)] animate-pulse-x" />
          </div>
        </div>
      </section>

      {/* The Proof - Arbitrator */}
      <section id="proof" className="mx-auto max-w-7xl px-8 py-24">
        <div className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div>
            <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase">The Proof.</h2>
            <p className="text-xl text-slate-500">Neutral arbitration via 0G Compute and Storage.</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex items-center gap-6">
             <div className="text-center">
               <span className="text-[10px] font-black text-slate-400 block mb-1">TOTAL PACTS</span>
               <span className="text-2xl font-black"># {nextPactId ? Number(nextPactId).toString() : "0"}</span>
             </div>
             <div className="h-10 w-px bg-slate-100" />
             <div className="text-center">
               <span className="text-[10px] font-black text-slate-400 block mb-1">BASE BOND</span>
               <span className="text-2xl font-black">{baseBond ? Number(formatUnits(baseBond, 6)).toFixed(0) : "0"} <span className="text-xs">USDC</span></span>
             </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Terminal View */}
          <div className="rounded-3xl bg-slate-900 p-8 shadow-2xl font-mono text-sm text-blue-400 border border-slate-800">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
              <Terminal size={18} />
              <span className="font-bold tracking-tight text-slate-400 uppercase">0G-Audit-Stream</span>
            </div>
            <div className="space-y-3">
              {logLines.map((line, i) => (
                <div key={i} className="flex gap-4 opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]" style={{ animationDelay: `${i * 0.4}s` }}>
                  <span className="text-slate-600">{i + 1}</span>
                  <span>{line}</span>
                </div>
              ))}
              <div className="animate-pulse">_</div>
            </div>
          </div>

          {/* Verdict Card */}
          <div className="rounded-3xl border-2 border-slate-900 bg-white p-10 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 text-8xl font-black text-slate-50 -z-10">VERDICT</div>
            <div className="flex items-center justify-between mb-12">
               <div className="bg-green-100 text-green-700 px-6 py-2 rounded-full font-black text-sm border-2 border-green-200">PASS</div>
               <div className="text-right">
                 <span className="text-xs font-black text-slate-400 uppercase block">Confidence</span>
                 <span className="text-3xl font-black">72.4%</span>
               </div>
            </div>
            <div className="space-y-6">
               {["Parse Requirements", "Analyze Submission", "Identify Failures", "Confidence Scoring", "Final Resolution"].map((step, i) => (
                 <div key={step} className="flex items-center justify-between group cursor-default">
                    <span className="font-bold text-slate-500 group-hover:text-black transition-colors">{step}</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                 </div>
               ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Trust - Registry */}
      <section id="trust" className="mx-auto max-w-7xl px-8 py-24">
        <div className="mb-16">
          <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase">The Trust.</h2>
          <p className="text-xl text-slate-500">Inspect the portable reputation of any agent on the network.</p>
        </div>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
           <div className="space-y-8">
              <div className="relative">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                <input 
                  type="text" 
                  placeholder="Enter Agent Wallet Address (0x...)"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white px-16 py-6 text-lg font-bold focus:border-blue-600 outline-none transition-colors"
                  value={agentAddress}
                  onChange={(e) => setAgentAddress(e.target.value.trim())}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-8 bg-white border border-slate-200 rounded-3xl text-center">
                    <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase tracking-widest">GOODREP</span>
                    <span className="text-3xl font-black text-green-600">{goodRepLabel}</span>
                 </div>
                 <div className="p-8 bg-white border border-slate-200 rounded-3xl text-center">
                    <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase tracking-widest">BADREP</span>
                    <span className="text-3xl font-black text-red-600">{badRepLabel}</span>
                 </div>
              </div>
           </div>

           <div className={`rounded-3xl p-12 border-2 transition-all duration-500 shadow-2xl ${
             scoreValue >= 150 ? 'bg-green-50 border-green-200 shadow-green-100' :
             scoreValue < 0 ? 'bg-red-50 border-red-200 shadow-red-100' :
             'bg-white border-slate-900 shadow-slate-100'
           }`}>
              <div className="flex justify-between items-start mb-12">
                 <div className={`px-4 py-1 rounded-full text-[10px] font-black border-2 ${
                   scoreValue >= 150 ? 'bg-green-100 text-green-700 border-green-200' :
                   scoreValue < 0 ? 'bg-red-100 text-red-700 border-red-200' :
                   'bg-slate-100 text-slate-700 border-slate-200'
                 }`}>
                   {riskLabel}
                 </div>
                 <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 block uppercase">Bond Multiplier</span>
                    <span className="text-3xl font-black">
                       {scoreValue >= 150 ? "0.5x" : scoreValue >= 50 ? "1.0x" : scoreValue >= -50 ? "1.5x" : "2.0x"}
                    </span>
                 </div>
              </div>
              <div className="mb-12">
                 <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase tracking-widest">CREDIT SCORE</span>
                 <div className="flex items-end gap-3">
                    <span className="text-8xl font-black leading-none">{scoreLabel}</span>
                    <div className="flex gap-1 mb-2">
                       {Array.from({ length: 10 }).map((_, i) => (
                         <div key={i} className={`h-4 w-2 rounded-full ${i < (scoreValue/20 + 5) ? 'bg-blue-600' : 'bg-slate-200'}`} />
                       ))}
                    </div>
                 </div>
              </div>
              <div className="flex items-center gap-4 text-sm font-black text-slate-400">
                 <Activity size={18} />
                 <span>LATEST ACTIVITY: 12 MINS AGO</span>
              </div>
           </div>
        </div>
      </section>

      {/* Dev Hub - SDK */}
      <section id="dev" className="mx-auto max-w-7xl px-8 py-24">
         <div className="mb-16">
            <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase">The Hub.</h2>
            <p className="text-xl text-slate-500">Integrate AgentPact with two lines of code.</p>
         </div>
         <div className="grid gap-8 lg:grid-cols-2">
            <div className="bg-slate-50 rounded-3xl p-10 border border-slate-200">
               <div className="flex items-center gap-3 mb-8">
                  <Code2 className="text-blue-600" />
                  <span className="text-sm font-black text-slate-400 uppercase tracking-widest">@agentpact/sdk · createPact()</span>
               </div>
               <pre className="bg-white p-6 rounded-2xl border border-slate-200 font-mono text-sm overflow-x-auto mb-8">
{`const pactId = await createPact({
  task: "Evaluate Solidity PR",
  payment: "500", // USDC
  worker: "0x123...abc",
});`}
               </pre>
               <button className="w-full rounded-2xl bg-white border-2 border-slate-900 py-4 font-black hover:bg-slate-900 hover:text-white transition-all uppercase">
                 Simulate Call
               </button>
            </div>

            <div className="bg-slate-50 rounded-3xl p-10 border border-slate-200">
               <div className="flex items-center gap-3 mb-8">
                  <Code2 className="text-blue-600" />
                  <span className="text-sm font-black text-slate-400 uppercase tracking-widest">@agentpact/sdk · checkRep()</span>
               </div>
               <pre className="bg-white p-6 rounded-2xl border border-slate-200 font-mono text-sm overflow-x-auto mb-8">
{`const report = await checkRep("0x123...");

console.log(report.score); // +185
console.log(report.trust); // TRUSTED`}
               </pre>
               <button className="w-full rounded-2xl bg-white border-2 border-slate-900 py-4 font-black hover:bg-slate-900 hover:text-white transition-all uppercase">
                 Query Sepolia
               </button>
            </div>
         </div>
      </section>

      {/* Footer / Ticker */}
      <footer className="mx-auto max-w-7xl px-8 pb-24">
        <div className="rounded-3xl bg-white border border-slate-200 p-12 shadow-sm grid md:grid-cols-3 gap-12">
           <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">RESOURCES</h3>
              <ul className="space-y-4 font-bold">
                 <li><a href="#" className="hover:text-blue-600">Documentation</a></li>
                 <li><a href="#" className="hover:text-blue-600">Smart Contracts</a></li>
                 <li><a href="#" className="hover:text-blue-600">Audit Logs (0G)</a></li>
              </ul>
           </div>
           <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">INTEGRATIONS</h3>
              <ul className="space-y-4 font-bold">
                 <li><a href="#" className="hover:text-blue-600">0G Network</a></li>
                 <li><a href="#" className="hover:text-blue-600">Gensyn</a></li>
                 <li><a href="#" className="hover:text-blue-600">Uniswap V3/V4</a></li>
              </ul>
           </div>
           <div className="flex flex-col justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={24} className="text-blue-600" />
                <span className="text-xl font-black tracking-tight">AGENTPACT.</span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Built for ETHGlobal 2024. All rights reserved.</p>
           </div>
        </div>
      </footer>
    </div>
  );
}
