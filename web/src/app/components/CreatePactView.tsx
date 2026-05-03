"use client";

import { useState } from "react";

interface Props {
  onCreate: (task: string, payment: number, worker: string, uri?: string) => void;
  onCancel: () => void;
}

export function CreatePactView({ onCreate, onCancel }: Props) {
  const [task, setTask] = useState("");
  const [payment, setPayment] = useState("");
  const [worker, setWorker] = useState("");
  const [uri, setUri] = useState("");

  function handleSubmit() {
    if (!task || !payment || !worker) return;
    onCreate(task, parseInt(payment), worker, uri.trim() || undefined);
  }

  return (
    <div className="mx-auto max-w-150">
      <div className="overflow-hidden rounded-xl border border-border2">
        <div className="border-b border-border px-4.5 py-3.5">
          <span className="font-mono text-[13px] font-medium tracking-wider">CREATE NEW PACT</span>
        </div>
        <div className="flex flex-col gap-3 px-4.5 py-4">
          {/* Task spec */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] tracking-wider text-muted">TASK SPECIFICATION</label>
            <textarea value={task} onChange={e => setTask(e.target.value)}
              placeholder="Describe the work in detail. Requirements, deliverables, acceptance criteria..."
              className="min-h-18 resize-y rounded-md border border-border2 bg-bg2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent" />
          </div>

          {/* Payment + Worker */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] tracking-wider text-muted">PAYMENT (USDC)</label>
              <input type="number" value={payment} onChange={e => setPayment(e.target.value)}
                placeholder="50" min="1"
                className="rounded-md border border-border2 bg-bg2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] tracking-wider text-muted">WORKER AGENT</label>
              <input value={worker} onChange={e => setWorker(e.target.value)}
                placeholder="0x..."
                className="rounded-md border border-border2 bg-bg2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent" />
            </div>
          </div>

          {/* 0G URI */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] tracking-wider text-muted">0G STORAGE URI (auto-uploaded if blank)</label>
            <input value={uri} onChange={e => setUri(e.target.value)}
              placeholder="0g://..."
              className="rounded-md border border-border2 bg-bg2 px-2.5 py-2 text-[13px] text-text outline-none focus:border-accent" />
          </div>

          {/* Gensyn gate info */}
          <div className="rounded-md bg-bg2 px-3.5 py-3 text-xs text-muted">
            <span className="mr-1.5 font-mono text-accent">GENSYN GATE</span>
            — submission relevance will be checked at submitWork(). Threshold: 0.65 cosine similarity.
          </div>

          {/* Buttons */}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onCancel}
              className="rounded-md border border-border2 px-4 py-2.5 font-mono text-xs font-bold tracking-wider transition-all hover:bg-bg2">
              Cancel
            </button>
            <button onClick={handleSubmit}
              className="rounded-md border border-accent bg-accent px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-[#001a0e] transition-all hover:opacity-90">
              Deploy Pact ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
