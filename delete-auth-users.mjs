import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envLines = readFileSync(join(__dir, '.env.local'), 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPA_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SECRET_KEY'];

const KEEP_TEST_USERS = true;
const TEST_USER_EMAILS = ['e2e-test-user@nisflow.test', 'e2e-test-user2@nisflow.test'];

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': Bearer +${SERVICE_KEY},
  'Content-Type': 'application/json',
};

const res = await fetch(${SUPA_URL}/auth/v1/admin/users?page=1&per_page=1000, { headers });
if (!res.ok) { const t = await res.text(); console.error('List failed ' + res.status + ': ' + t); process.exit(1); }
const json = await res.json();
const users = json.users ?? json;
console.log('Found ' + users.length + ' users');

let deleted = 0, skipped = 0, failed = 0;
for (const user of users) {
  const email = user.email ?? '(no email)';
  if (KEEP_TEST_USERS && TEST_USER_EMAILS.includes(email)) { console.log('  - Keeping: ' + email); skipped++; continue; }
  const dr = await fetch(${SUPA_URL}/auth/v1/admin/users/, { method: 'DELETE', headers });
  if (dr.status === 200 || dr.status === 204) { console.log('  deleted: ' + email); deleted++; }
  else { const t = await dr.text(); console.error('  FAILED ' + email + ': ' + dr.status + ' ' + t); failed++; }
}
console.log('Done: ' + deleted + ' deleted, ' + skipped + ' skipped, ' + failed + ' failed');
