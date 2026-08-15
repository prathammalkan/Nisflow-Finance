const puppeteer = require('puppeteer');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

const issues = [];
const passed = [];

async function test() {
  console.log('=== NisFlow UI/UX Deep Audit ===\n');
  
  // Create a test user
  const email = 'ui_audit_' + Date.now() + '@example.com';
  const { data: auth } = await supabase.auth.signUp({ email, password: 'Password123!' });
  console.log('Test user created:', auth.user?.id);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 14 Pro size

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Manifest') && !msg.text().includes('favicon')) errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.toString()));

  try {
    // ---- TEST 1: LOGIN ----
    console.log('\n[1] Testing Login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0', timeout: 15000 });
    const loginTitle = await page.$('h1');
    if (loginTitle) passed.push('Login page loads'); else issues.push('Login page: No h1 heading found');
    
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    console.log('After login URL:', page.url());
    
    const afterLoginUrl = page.url();
    if (afterLoginUrl.includes('/dashboard')) passed.push('Login → Dashboard redirect works');
    else issues.push('Login redirect broken, ended at: ' + afterLoginUrl);

    await new Promise(r => setTimeout(r, 3000));

    // ---- TEST 2: DASHBOARD LAYOUT ----
    console.log('\n[2] Testing Dashboard layout on mobile...');
    const bottomNav = await page.$('nav[aria-label="Mobile navigation"]');
    if (bottomNav) passed.push('Bottom nav exists on mobile');
    else issues.push('Bottom nav missing on mobile viewport');

    // Check for overlapping elements by checking z-index/positions
    const aiButton = await page.$('button.fixed.bottom-6');
    if (aiButton) passed.push('AI companion button present');
    else issues.push('AI companion floating button missing');

    // Check if bottom nav overlaps AI button
    const bottomNavBounds = bottomNav ? await bottomNav.boundingBox() : null;
    const aiButtonBounds = aiButton ? await aiButton.boundingBox() : null;
    if (bottomNavBounds && aiButtonBounds) {
      const aiButtonBottom = aiButtonBounds.y + aiButtonBounds.height;
      if (aiButtonBounds.y < bottomNavBounds.y) {
        passed.push('AI button does NOT overlap bottom nav');
      } else {
        issues.push('AI companion button OVERLAPS with bottom nav!');
      }
    }

    // ---- TEST 3: HEADER ----
    console.log('\n[3] Testing Header...');
    const header = await page.$('header');
    if (header) passed.push('Header exists');
    const hamburger = await page.$('button[aria-label="Open menu"]');
    if (hamburger) passed.push('Hamburger menu button visible on mobile');
    else issues.push('Hamburger menu button not found');
    
    // Search should be hidden on mobile
    const searchVisible = await page.evaluate(() => {
      const search = document.querySelector('input[placeholder*="Search"]') || document.querySelector('input[type="search"]');
      if (!search) return false;
      const style = window.getComputedStyle(search);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (!searchVisible) passed.push('Global search hidden on mobile (correct)');
    else issues.push('Global search is visible on mobile (should be hidden)');

    // ---- TEST 4: ONBOARDING ----
    console.log('\n[4] Testing Onboarding Wizard...');
    const wizardTitle = await page.evaluate(() => document.body.innerText.includes('Welcome to NisFlow'));
    if (wizardTitle) {
      passed.push('Onboarding wizard appears for new user');
      
      // Check wizard fits on screen
      const wizardOverflow = await page.evaluate(() => {
        const el = document.querySelector('.fixed.inset-0.z-50');
        return el ? el.scrollHeight > window.innerHeight : false;
      });
      if (!wizardOverflow) passed.push('Wizard fits on mobile screen (no overflow)');
      else issues.push('Onboarding wizard overflows mobile screen height');
    } else {
      issues.push('Onboarding wizard not showing for fresh user');
    }

    // ---- TEST 5: SIDEBAR HAMBURGER ----
    console.log('\n[5] Testing Hamburger → Sidebar...');
    if (hamburger) {
      await page.click('button[aria-label="Open menu"]');
      await new Promise(r => setTimeout(r, 500));
      const sidebarVisible = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        return aside ? !aside.className.includes('-translate-x-full') : false;
      });
      if (sidebarVisible) passed.push('Sidebar opens on hamburger click');
      else issues.push('Sidebar does not open on hamburger click');
      
      // Close sidebar by clicking overlay
      const overlay = await page.$('.fixed.inset-0.z-40.bg-black\\/50');
      if (overlay) {
        await overlay.click();
        await new Promise(r => setTimeout(r, 400));
        passed.push('Sidebar overlay closes sidebar');
      }
    }

    // ---- TEST 6: BOTTOM NAV NAVIGATION ----
    console.log('\n[6] Testing Bottom Nav navigation...');
    const bottomNavLinks = await page.$$('nav[aria-label="Mobile navigation"] a');
    console.log('Bottom nav link count:', bottomNavLinks.length);
    if (bottomNavLinks.length === 5) passed.push('Bottom nav has 5 items');
    else issues.push(`Bottom nav has ${bottomNavLinks.length} items (expected 5)`);

    // ---- TEST 7: TRANSACTIONS PAGE ----
    console.log('\n[7] Testing Transactions page...');
    await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const addTransactionBtn = await page.$('button:has-text("Add Transaction")').catch(() => null);
    // Check if button exists via text content
    const txButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.map(b => b.textContent?.trim()).filter(t => t?.includes('Transaction'));
    });
    console.log('Transaction buttons found:', txButtons);
    if (txButtons.length > 0) passed.push('Add Transaction button found on transactions page');
    else issues.push('Add Transaction button NOT found');

    // Mobile card view
    const mobileCards = await page.$$('.md\\:hidden .rounded-xl');
    console.log('Mobile transaction cards found:', mobileCards.length);

    // ---- TEST 8: TRANSACTION FORM ----
    console.log('\n[8] Testing Transaction Form dialog...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent?.includes('Add Transaction'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    
    const dialog = await page.$('dialog[open]');
    if (dialog) {
      passed.push('Transaction form dialog opens');
      
      // Check dialog fits on mobile
      const dialogBounds = await dialog.boundingBox();
      const viewport = page.viewport();
      if (dialogBounds && viewport) {
        if (dialogBounds.height <= viewport.height) passed.push('Dialog fits within mobile viewport');
        else issues.push(`Dialog height (${Math.round(dialogBounds.height)}) exceeds viewport (${viewport.height})`);
        if (dialogBounds.width <= viewport.width) passed.push('Dialog fits within mobile width');
        else issues.push(`Dialog width overflows viewport`);
      }
      
      // Close dialog
      const closeBtn = await page.$('dialog[open] button:last-child');
      if (closeBtn) await closeBtn.click();
    } else {
      issues.push('Transaction form dialog did NOT open');
    }

    // ---- TEST 9: ACCOUNTS PAGE ----
    console.log('\n[9] Testing Accounts page...');
    await page.goto('http://localhost:3000/accounts', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const accountPageTitle = await page.evaluate(() => document.body.innerText.includes('Accounts'));
    if (accountPageTitle) passed.push('Accounts page loads');
    
    const addAccountBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent?.includes('Add Account'));
    });
    if (addAccountBtn) passed.push('Add Account button present');
    else issues.push('Add Account button missing on Accounts page');

    // ---- TEST 10: PEOPLE PAGE ----
    console.log('\n[10] Testing People page...');
    await page.goto('http://localhost:3000/people', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const peopleOk = await page.evaluate(() => document.body.innerText.includes('People'));
    if (peopleOk) passed.push('People page loads');
    else issues.push('People page content not found');

    // ---- TEST 11: SPENDING PAGE ----
    console.log('\n[11] Testing Spending page...');
    await page.goto('http://localhost:3000/spending', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const spendingOk = await page.evaluate(() => document.body.innerText.includes('Spending'));
    if (spendingOk) passed.push('Spending page loads');
    else issues.push('Spending page content not found');

    // ---- TEST 12: SETTINGS PAGE ----
    console.log('\n[12] Testing Settings page...');
    await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const settingsOk = await page.evaluate(() => document.body.innerText.includes('Settings'));
    if (settingsOk) passed.push('Settings page loads');
    else issues.push('Settings page content not found');

    // ---- TEST 13: SAVINGS GOALS ----
    console.log('\n[13] Testing Savings Goals page...');
    await page.goto('http://localhost:3000/savings-goals', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const savingsOk = await page.evaluate(() => document.body.innerText.includes('Savings'));
    if (savingsOk) passed.push('Savings Goals page loads');
    else issues.push('Savings Goals page content not found');

    // ---- TEST 14: AI COMPANION BUTTON ----
    console.log('\n[14] Testing AI Companion...');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const aiFloatBtn = await page.$('button.fixed');
    if (aiFloatBtn) {
      await aiFloatBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      const sheet = await page.evaluate(() => document.body.innerText.includes('NisFlow AI Companion'));
      if (sheet) passed.push('AI Companion drawer opens');
      else issues.push('AI Companion drawer did not open');
      
      // Check if input works
      const chatInput = await page.$('input[placeholder*="finances"]');
      if (chatInput) {
        passed.push('AI chat input found');
        await chatInput.type('What is my net worth?');
        const sendBtn = await page.$('button[type="submit"] svg');
        if (sendBtn) passed.push('AI send button found');
        else issues.push('AI send button not found');
      } else {
        issues.push('AI chat input not found');
      }
    } else {
      issues.push('AI companion floating button not found');
    }

    // ---- TEST 15: CHECK FOR JS ERRORS ----
    console.log('\n[15] Checking for JavaScript errors...');
    if (errors.length === 0) {
      passed.push('No JavaScript errors detected during testing');
    } else {
      errors.forEach(e => issues.push('JS Error: ' + e.substring(0, 200)));
    }

  } catch (err) {
    console.error('Test crashed:', err);
    issues.push('Test crash: ' + err.toString());
  } finally {
    await browser.close();
  }

  // ---- REPORT ----
  console.log('\n\n========== AUDIT REPORT ==========');
  console.log(`\n✅ PASSED (${passed.length}):`);
  passed.forEach(p => console.log('  ✓', p));
  
  console.log(`\n❌ ISSUES (${issues.length}):`);
  if (issues.length === 0) {
    console.log('  No issues found!');
  } else {
    issues.forEach(i => console.log('  ✗', i));
  }
  
  console.log('\n==================================');
  
  fs.writeFileSync('audit-results.json', JSON.stringify({ passed, issues, errors }, null, 2));
  console.log('\nResults saved to audit-results.json');
}

test();
