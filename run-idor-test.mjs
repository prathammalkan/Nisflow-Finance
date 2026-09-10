import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const envPath = join(__dir, '.env.local');

const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

try {
  const result = execSync(
    'node --experimental-strip-types --test test/security/15-adversarial-idor-rest.test.ts',
    { env, timeout: 180000, encoding: 'utf-8', cwd: __dir }
  );
  process.stdout.write(result);
  process.exit(0);
} catch (e) {
  process.stdout.write(e.stdout || '');
  process.stderr.write(e.stderr || '');
  process.exit(e.status || 1);
}
