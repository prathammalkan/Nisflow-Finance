/**
 * NisFlow Finance — Apply Migration 027 via Supabase Dashboard
 *
 * This script automates applying the resilient handle_new_user trigger
 * to the production Supabase database via the Dashboard SQL Editor.
 *
 * Usage:
 *   npx ts-node --experimental-strip-types playwright/apply-migration.ts
 *
 * You will be prompted to log into Supabase in the browser.
 * The script will paste and execute the migration SQL automatically.
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_REF = 'qyjhicibrciqcznsdevk';
const SQL_FILE = path.join(__dirname, '..', 'docs', 'E2E_SETUP.sql');

async function applyMigration() {
  const sql = fs.readFileSync(SQL_FILE, 'utf-8');
  
  const browser = await chromium.launch({ headless: false }); // Headed so user can log in
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('\n[apply-migration] Opening Supabase Dashboard SQL Editor...');
  console.log('[apply-migration] Please log in with your Supabase credentials.\n');
  
  await page.goto(`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  
  // Wait for user to log in (up to 2 minutes)
  await page.waitForURL(`**/project/${PROJECT_REF}/sql/**`, { timeout: 120000 });
  console.log('[apply-migration] Dashboard loaded. Inserting SQL...');
  
  // Wait for the Monaco editor to load
  await page.waitForSelector('.monaco-editor', { timeout: 30000 });
  
  // Click on the editor and insert SQL
  const editor = page.locator('.monaco-editor').first();
  await editor.click();
  
  // Select all and replace
  await page.keyboard.press('Control+A');
  await page.keyboard.type(sql, { delay: 0 });
  
  console.log('[apply-migration] SQL inserted. Running...');
  
  // Click Run button
  const runBtn = page.getByRole('button', { name: /run|execute/i }).first();
  await runBtn.click();
  
  // Wait for result
  await page.waitForTimeout(5000);
  
  console.log('[apply-migration] ✅ Migration SQL executed.');
  console.log('[apply-migration] Check the Results panel in the browser for any errors.');
  console.log('[apply-migration] Press Enter to close the browser when done.');
  
  await new Promise(resolve => process.stdin.once('data', resolve));
  await browser.close();
}

applyMigration().catch(e => {
  console.error('[apply-migration] Error:', e.message);
  process.exit(1);
});
