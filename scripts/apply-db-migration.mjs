/**
 * NisFlow Finance - Apply DB Migration via Supabase Dashboard
 * Run: node scripts/apply-db-migration.mjs
 * Opens a browser, log in with Supabase credentials, SQL is applied automatically.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local so this script can be run locally without exporting vars manually
loadEnv({ path: join(__dirname, '..', '.env.local') });

// Derive project ref from NEXT_PUBLIC_SUPABASE_URL — never hardcode it in source.
// e.g. https://qyjhicibrciqcznsdevk.supabase.co → qyjhicibrciqcznsdevk
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
const PROJECT_REF = new URL(supabaseUrl).hostname.split('.')[0];

const SQL = readFileSync(join(__dirname, "..", "docs", "E2E_SETUP.sql"), "utf-8");

const browser = await chromium.launch({ headless: false, slowMo: 50 });
const page = await (await browser.newContext()).newPage();

console.log("Opening Supabase SQL Editor — log in with your credentials.");
await page.goto(`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
await page.waitForURL(`**/project/${PROJECT_REF}/**`, { timeout: 120000 });
await page.waitForSelector(".monaco-editor, textarea", { timeout: 30000 });
await page.waitForTimeout(2000);

const monacoCount = await page.locator(".monaco-editor").count();
if (monacoCount > 0) {
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  for (const chunk of SQL.match(/.{1,200}/gs) || [SQL]) {
    await page.keyboard.type(chunk, { delay: 0 });
  }
} else {
  await page.locator("textarea").first().fill(SQL);
}

console.log("SQL loaded. Clicking Run...");
await page.waitForTimeout(500);
const runBtn = page.locator("button").filter({ hasText: /^run$/i }).or(page.getByRole("button", { name: /run/i })).first();
if (await runBtn.count() > 0) {
  await runBtn.click();
  await page.waitForTimeout(8000);
  console.log("Done. Check browser for results. Ctrl+C to exit.");
} else {
  console.log("Run button not found — click it manually in the browser.");
}
await new Promise(() => {});
