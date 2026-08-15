const puppeteer = require('puppeteer');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  const email = 'diag_' + Date.now() + '@example.com';
  const { data: auth } = await supabase.auth.signUp({ email, password: 'Password123!' });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const failed = [];

  // Intercept all network requests and log failures
  page.on('response', async res => {
    const status = res.status();
    const url = res.url();
    if ((status === 400 || status === 401 || status === 500) && url.includes('supabase')) {
      failed.push({ status, url: url.replace(supabaseUrl, '[SUPABASE]') });
    }
  });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000)); // wait for all queries

  console.log('\n=== FAILING SUPABASE REQUESTS ON DASHBOARD ===');
  if (failed.length === 0) {
    console.log('No failing Supabase requests!');
  } else {
    const unique = [...new Set(failed.map(f => `[${f.status}] ${f.url}`))];
    unique.forEach(u => console.log(u));
  }

  failed.length = 0;

  // Also test transactions page
  await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== FAILING SUPABASE REQUESTS ON TRANSACTIONS ===');
  if (failed.length === 0) {
    console.log('No failing Supabase requests!');
  } else {
    const unique = [...new Set(failed.map(f => `[${f.status}] ${f.url}`))];
    unique.forEach(u => console.log(u));
  }

  failed.length = 0;

  // Also test accounts page
  await page.goto('http://localhost:3000/accounts', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== FAILING SUPABASE REQUESTS ON ACCOUNTS ===');
  if (failed.length === 0) {
    console.log('No failing Supabase requests!');
  } else {
    const unique = [...new Set(failed.map(f => `[${f.status}] ${f.url}`))];
    unique.forEach(u => console.log(u));
  }

  await browser.close();
}

diagnose();
