"use client";

import { usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { keccak256, toBytes, formatUnits, type Address } from "viem";
import { agentPactAbi } from "@/lib/abi/agentpact";
import { erc20Abi } from "@/lib/abi/erc20";
import type { Pact } from "@/lib/data";

const CONTRACT = (process.env.NEXT_PUBLIC_AGENTPACT_ADDRESS || "") as Address;
const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "") as Address;
const BADREP = (process.env.NEXT_PUBLIC_BADREP_TOKEN_ADDRESS || "") as Address;
const GOODREP = (process.env.NEXT_PUBLIC_GOODREP_TOKEN_ADDRESS || "") as Address;

const STATUS_MAP: Record<number, Pact["status"]> = {
  0: "Created", 1: "Active", 2: "Submitted", 3: "Disputed", 4: "Resolved",
};

/** Read nextPactId from contract */
export function useNextPactId() {
  return useReadContract({
    abi: agentPactAbi, address: CONTRACT, functionName: "nextPactId",
    query: { enabled: Boolean(CONTRACT), refetchInterval: 10_000 },
  });
}

/** Read baseBond */
export function useBaseBond() {
  return useReadContract({
    abi: agentPactAbi, address: CONTRACT, functionName: "baseBond",
    query: { enabled: Boolean(CONTRACT) },
  });
}

/** Read a single pact by ID and convert to our Pact type */
export function useOnChainPact(pactId: number | undefined) {
  const { data, refetch, isLoading } = useReadContract({
    abi: agentPactAbi,
    address: CONTRACT,
    functionName: "pacts",
    args: pactId !== undefined ? [BigInt(pactId)] : undefined,
    query: { enabled: Boolean(CONTRACT && pactId !== undefined), refetchInterval: 8_000 },
  });

  const pact: Pact | null = data ? rawToPact(data as any) : null;
  return { pact, refetch, isLoading };
}

/** Read ALL pacts from 0..nextPactId-1 */
export function useAllPacts(count: number) {
  const contracts = Array.from({ length: count }, (_, i) => ({
    abi: agentPactAbi,
    address: CONTRACT,
    functionName: "pacts" as const,
    args: [BigInt(i)] as const,
  }));

  const { data, refetch, isLoading } = useReadContracts({
    contracts,
    query: { enabled: Boolean(CONTRACT && count > 0), refetchInterval: 12_000 },
  });

  const pacts: Pact[] = (data || [])
    .filter((r: any) => r.status === "success" && r.result)
    .map((r: any) => rawToPact(r.result));

  return { pacts, refetch, isLoading };
}

/** Read credit score for an address */
export function useCreditScore(address: Address | undefined) {
  return useReadContract({
    abi: agentPactAbi, address: CONTRACT, functionName: "creditScores",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(CONTRACT && address) },
  });
}

/** Read $GOODREP balance */
export function useGoodRepBalance(address: Address | undefined) {
  return useReadContract({
    abi: erc20Abi, address: GOODREP, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(GOODREP && address) },
  });
}

/** Read $BADREP balance */
export function useBadRepBalance(address: Address | undefined) {
  return useReadContract({
    abi: erc20Abi, address: BADREP, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(BADREP && address) },
  });
}

// ── WRITE HOOKS ──────────────────────────────────────────────────────

/** Approve USDC spend and then createPact */
export function useCreatePact() {
  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: create } = useWriteContract();
  const publicClient = usePublicClient();

  async function createPact(taskSpec: string, paymentUsdc: number, worker: Address, ogURI: string) {
    const amount = BigInt(paymentUsdc) * BigInt(1e6); // USDC has 6 decimals
    const hash = keccak256(toBytes(taskSpec));

    // Step 1: Approve USDC
    const approveHash = await approve({
      abi: erc20Abi, address: USDC, functionName: "approve",
      args: [CONTRACT, amount],
      gas: BigInt(100000),
    });
    if (!publicClient) throw new Error("Wallet client not ready");
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Step 2: Create pact
    const txHash = await create({
      abi: agentPactAbi, address: CONTRACT, functionName: "createPact",
      args: [hash, amount, worker, ogURI],
      gas: BigInt(300000),
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  return { createPact };
}

/** Accept a pact (worker posts bond) */
export function useAcceptPact() {
  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: accept } = useWriteContract();
  const publicClient = usePublicClient();

  async function acceptPact(pactId: number, bondAmount: bigint) {
    // Step 1: Approve bond
    const approveHash = await approve({
      abi: erc20Abi, address: USDC, functionName: "approve",
      args: [CONTRACT, bondAmount],
      gas: BigInt(100000),
    });
    if (!publicClient) throw new Error("Wallet client not ready");
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Step 2: Accept
    const txHash = await accept({
      abi: agentPactAbi, address: CONTRACT, functionName: "acceptPact",
      args: [BigInt(pactId)],
      gas: BigInt(300000),
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  return { acceptPact };
}

/** Submit work */
export function useSubmitWork() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  async function submitWork(pactId: number, submission: string, ogURI: string) {
    const hash = keccak256(toBytes(submission));
    const txHash = await writeContractAsync({
      abi: agentPactAbi, address: CONTRACT, functionName: "submitWork",
      args: [BigInt(pactId), hash, ogURI],
      gas: BigInt(300000),
    });
    if (!publicClient) throw new Error("Wallet client not ready");
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  return { submitWork };
}

/** Raise dispute */
export function useRaiseDispute() {
  const { writeContractAsync } = useWriteContract();

  async function raiseDispute(pactId: number) {
    return writeContractAsync({
      abi: agentPactAbi, address: CONTRACT, functionName: "raiseDispute",
      args: [BigInt(pactId)],
    });
  }

  return { raiseDispute };
}

// ── HELPERS ──────────────────────────────────────────────────────────

function rawToPact(raw: any): Pact {
  const id = Number(raw[0]);
  const status = STATUS_MAP[Number(raw[5])] || "Created";
  const verdict = status === "Resolved"
    ? (raw[10] && raw[10].length > 0 ? "Pass" : null) // We'll refine this with event data
    : null;

  return {
    id,
    task: `Pact #${id}`,
    agentA: shortenAddr(raw[1]),
    agentB: raw[2] === "0x0000000000000000000000000000000000000000" ? "—" : shortenAddr(raw[2]),
    agentAAddress: raw[1],
    agentBAddress: raw[2] === "0x0000000000000000000000000000000000000000" ? undefined : raw[2],
    payment: Number(raw[3]) / 1e6,
    bond: Number(raw[4]) / 1e6,
    status,
    verdict,
    created: new Date(Number(raw[11]) * 1000).toISOString().slice(0, 10),
    disputed: Number(raw[12]) > 0 ? `block #${raw[12]}` : null,
    resolved: status === "Resolved" ? "yes" : null,
    taskSpec: raw[7] || "—",
    submission: raw[9] || null,
    verdictURI: raw[10] || null,
    confidence: null,
    score_delta: null,
  };
}

function shortenAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}
