import { ethers } from 'ethers';

export interface AgentPactConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  usdcAddress: string;
}

export interface CreatePactParams {
  taskSpec: string;
  paymentAmount: bigint;
  workerAgent: string;
  og0StorageURI?: string;
}

export interface SubmitWorkParams {
  pactId: number;
  submission: string;
  og0SubmissionURI?: string;
}

const AGENTPACT_ABI = [
  'function createPact(bytes32 taskSpecHash, uint256 paymentAmount, address workerAgent, string calldata og0StorageURI) external returns (uint256)',
  'function acceptPact(uint256 pactId) external',
  'function submitWork(uint256 pactId, bytes32 submissionHash, string calldata og0SubmissionURI) external',
  'function raiseDispute(uint256 pactId) external',
  'function checkRep(address agent) external view returns (int256, uint256, uint256, uint256)',
  'function getPact(uint256 pactId) external view returns (tuple(uint256,address,address,uint256,uint256,uint8,bytes32,string,bytes32,string,string,uint256,uint256,uint256))',
  'function getBondRequired(address agent) external view returns (uint256)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

export class AgentPactClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private usdc: ethers.Contract;
  private config: AgentPactConfig;

  constructor(config: AgentPactConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.contract = new ethers.Contract(config.contractAddress, AGENTPACT_ABI, this.wallet);
    this.usdc = new ethers.Contract(config.usdcAddress, ERC20_ABI, this.wallet);
  }

  async createPact(params: CreatePactParams): Promise<number> {
    const taskSpecHash = ethers.keccak256(ethers.toUtf8Bytes(params.taskSpec));
    const og0URI = params.og0StorageURI || `0g://placeholder-${Date.now()}`;

    await (await this.usdc.approve(this.config.contractAddress, params.paymentAmount)).wait();
    const tx = await this.contract.createPact(
      taskSpecHash,
      params.paymentAmount,
      params.workerAgent,
      og0URI,
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: ethers.LogDescription | null) => parsed?.name === 'PactCreated');

    const pactId = event ? Number(event.args.pactId) : -1;
    console.log(`[SDK] Pact created: #${pactId}`);
    return pactId;
  }

  async acceptPact(pactId: number): Promise<string> {
    const bondRequired = await this.contract.getBondRequired(this.wallet.address);
    await (await this.usdc.approve(this.config.contractAddress, bondRequired)).wait();
    const tx = await this.contract.acceptPact(pactId);
    const receipt = await tx.wait();
    console.log(`[SDK] Pact ${pactId} accepted`);
    return receipt.hash;
  }

  async submitWork(params: SubmitWorkParams): Promise<string> {
    const submissionHash = ethers.keccak256(ethers.toUtf8Bytes(params.submission));
    const og0URI = params.og0SubmissionURI || `0g://submission-placeholder-${Date.now()}`;
    const tx = await this.contract.submitWork(params.pactId, submissionHash, og0URI);
    const receipt = await tx.wait();
    console.log(`[SDK] Work submitted for pact ${params.pactId}`);
    return receipt.hash;
  }

  async raiseDispute(pactId: number): Promise<string> {
    const tx = await this.contract.raiseDispute(pactId);
    const receipt = await tx.wait();
    console.log(`[SDK] Dispute raised for pact ${pactId}`);
    return receipt.hash;
  }

  async checkRep(agentAddress: string) {
    const [creditScore, badRepBalance, goodRepBalance, bondMultiplierBps] =
      await this.contract.checkRep(agentAddress);
    return {
      creditScore: Number(creditScore),
      badRepBalance: badRepBalance.toString(),
      goodRepBalance: goodRepBalance.toString(),
      bondMultiplierBps: Number(bondMultiplierBps),
    };
  }

  async getPact(pactId: number) {
    return this.contract.getPact(pactId);
  }

  async getBondRequired(agentAddress: string): Promise<bigint> {
    return this.contract.getBondRequired(agentAddress);
  }

  get address(): string {
    return this.wallet.address;
  }
}

export { ethers };
export default AgentPactClient;
