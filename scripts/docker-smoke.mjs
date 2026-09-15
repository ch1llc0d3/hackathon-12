import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const suffix = randomUUID().slice(0, 8);
const image = `ventanilla-hermes-smoke:${suffix}`;
const container = `ventanilla-hermes-smoke-${suffix}`;
let imageBuilt = false;
let containerCreated = false;

try {
  await run('docker', ['build', '--tag', image, '.']);
  imageBuilt = true;
  await run('docker', [
    'run', '--detach', '--name', container,
    '--env', 'OPENROUTER_API_KEY=smoke-test-key',
    '--publish', '127.0.0.1::8787',
    image,
  ]);
  containerCreated = true;

  const mapping = (await run('docker', ['port', container, '8787/tcp'], { capture: true })).trim();
  const match = mapping.match(/^127\.0\.0\.1:(\d+)$/m);
  assert.ok(match, `Docker did not report a loopback port mapping: ${mapping}`);

  const health = await waitForHealth(`http://127.0.0.1:${match[1]}/api/health`);
  assert.deepEqual(health, {
    ok: true,
    configured: true,
    provider: 'openrouter',
    model: 'nousresearch/hermes-3-llama-3.1-70b',
  });
  console.log(`Docker smoke test passed on 127.0.0.1:${match[1]}`);
} finally {
  if (containerCreated) {
    await run('docker', ['stop', container], { allowFailure: true });
    await run('docker', ['rm', container], { allowFailure: true });
  }
  if (imageBuilt) await run('docker', ['image', 'rm', image], { allowFailure: true });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`health endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`container did not become healthy: ${lastError}`);
}

function run(command, args, { allowFailure = false, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let stdout = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 || allowFailure) return resolve(stdout);
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}
