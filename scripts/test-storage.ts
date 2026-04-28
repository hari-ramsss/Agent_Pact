import { uploadToStorage, downloadFromStorage, hashContent } from './og-storage';
import { readCreditScore, writeCreditScore } from './og-kv';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCreditScore(address: string, expectedScore: number): Promise<number> {
  const attempts = 8;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const score = await readCreditScore(address);
    if (score === expectedScore) {
      return score;
    }

    if (attempt < attempts) {
      console.log(`KV not indexed yet (attempt ${attempt}/${attempts}); waiting 5s...`);
      await sleep(5000);
    }
  }

  return readCreditScore(address);
}

async function runTests() {
  console.log('\n===== 0G Storage isolation test =====\n');

  console.log('Test 1: Upload/download round-trip...');
  const testContent = { test: true, message: 'AgentPact storage test', timestamp: Date.now() };
  const uploadResult = await uploadToStorage(testContent, 'test');
  const downloaded = await downloadFromStorage(uploadResult.rootHash);
  const parsed = JSON.parse(downloaded);
  console.log(`Round-trip: ${parsed.message === testContent.message ? 'PASS' : 'FAIL'}`);

  console.log('\nTest 2: Hash consistency...');
  const hash1 = hashContent(testContent);
  const hash2 = hashContent(testContent);
  console.log(`Hash stable: ${hash1 === hash2 ? 'PASS' : 'FAIL'}`);

  console.log('\nTest 3: KV write and read...');
  const testAddress = `0x${Date.now().toString(16).padStart(40, '0')}`;
  await writeCreditScore(testAddress, 42);
  const readScore = await waitForCreditScore(testAddress, 42);
  console.log(`KV round-trip: ${readScore === 42 ? 'PASS' : 'FAIL'} (wrote 42, read ${readScore})`);

  console.log('\nTest 4: Missing key returns 0...');
  const newAgent = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const score = await readCreditScore(newAgent);
  console.log(`New agent score = 0: ${score === 0 ? 'PASS' : 'FAIL'} (got ${score})`);

  console.log('\n===== All tests complete =====');
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
