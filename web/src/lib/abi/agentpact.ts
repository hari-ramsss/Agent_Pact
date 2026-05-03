export const agentPactAbi = [
    // ── Read functions ──────────────────────────────────────────────
    {
        type: "function",
        name: "nextPactId",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        type: "function",
        name: "baseBond",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        type: "function",
        name: "creditScores",
        stateMutability: "view",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "int256" }],
    },
    {
        type: "function",
        name: "pacts",
        stateMutability: "view",
        inputs: [{ name: "", type: "uint256" }],
        outputs: [
            { name: "id", type: "uint256" },
            { name: "agentA", type: "address" },
            { name: "agentB", type: "address" },
            { name: "paymentAmount", type: "uint256" },
            { name: "bondAmount", type: "uint256" },
            { name: "status", type: "uint8" },
            { name: "taskSpecHash", type: "bytes32" },
            { name: "og0StorageURI", type: "string" },
            { name: "submissionHash", type: "bytes32" },
            { name: "og0SubmissionURI", type: "string" },
            { name: "og0VerdictURI", type: "string" },
            { name: "createdAt", type: "uint256" },
            { name: "disputeOpenedAt", type: "uint256" },
            { name: "timeoutBlocks", type: "uint256" },
        ],
    },
    {
        type: "function",
        name: "keeperHub",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
    {
        type: "function",
        name: "checkRep",
        stateMutability: "view",
        inputs: [{ name: "agent", type: "address" }],
        outputs: [
            { name: "creditScore", type: "int256" },
            { name: "badRepBalance", type: "uint256" },
            { name: "goodRepBalance", type: "uint256" },
            { name: "bondMultiplierBasisPoints", type: "uint256" },
        ],
    },

    // ── Write functions ─────────────────────────────────────────────
    {
        type: "function",
        name: "createPact",
        stateMutability: "nonpayable",
        inputs: [
            { name: "taskSpecHash", type: "bytes32" },
            { name: "paymentAmount", type: "uint256" },
            { name: "workerAgent", type: "address" },
            { name: "og0StorageURI", type: "string" },
        ],
        outputs: [{ name: "pactId", type: "uint256" }],
    },
    {
        type: "function",
        name: "acceptPact",
        stateMutability: "nonpayable",
        inputs: [{ name: "pactId", type: "uint256" }],
        outputs: [],
    },
    {
        type: "function",
        name: "submitWork",
        stateMutability: "nonpayable",
        inputs: [
            { name: "pactId", type: "uint256" },
            { name: "submissionHash", type: "bytes32" },
            { name: "og0SubmissionURI", type: "string" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "raiseDispute",
        stateMutability: "nonpayable",
        inputs: [{ name: "pactId", type: "uint256" }],
        outputs: [],
    },

    // ── Events ──────────────────────────────────────────────────────
    {
        type: "event",
        name: "PactCreated",
        inputs: [
            { name: "pactId", type: "uint256", indexed: true },
            { name: "agentA", type: "address", indexed: true },
            { name: "paymentAmount", type: "uint256", indexed: false },
            { name: "bondRequired", type: "uint256", indexed: false },
            { name: "taskSpecHash", type: "bytes32", indexed: false },
            { name: "og0StorageURI", type: "string", indexed: false },
        ],
    },
    {
        type: "event",
        name: "PactAccepted",
        inputs: [
            { name: "pactId", type: "uint256", indexed: true },
            { name: "agentB", type: "address", indexed: true },
            { name: "bondAmount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "WorkSubmitted",
        inputs: [
            { name: "pactId", type: "uint256", indexed: true },
            { name: "agentB", type: "address", indexed: true },
            { name: "submissionHash", type: "bytes32", indexed: false },
            { name: "og0SubmissionURI", type: "string", indexed: false },
        ],
    },
    {
        type: "event",
        name: "DisputeRaised",
        inputs: [
            { name: "pactId", type: "uint256", indexed: true },
            { name: "agentA", type: "address", indexed: true },
            { name: "disputeOpenedAt", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "DisputeResolved",
        inputs: [
            { name: "pactId", type: "uint256", indexed: true },
            { name: "verdict", type: "uint8", indexed: false },
            { name: "confidence", type: "uint256", indexed: false },
            { name: "og0VerdictURI", type: "string", indexed: false },
        ],
    },
] as const;
