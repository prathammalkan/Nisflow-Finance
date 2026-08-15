const puppeteer = require('puppeteer');

async function test() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Manifest')) {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('BROWSER PAGE ERROR:', err.toString());
    errors.push(err.toString());
  });

  try {
    console.log('Navigating to /register...');
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle0' });
    
    console.log('Filling form...');
    const email = 'test_browser_' + Date.now() + '@example.com';
    
    await page.type('input[type="email"]', email);
    await page.type('input[id="password"]', 'Password123!');
    await page.type('input[id="confirm-password"]', 'Password123!');
    
    console.log('Submitting...');
    await page.click('button[type="submit"]');
    
    console.log('Waiting for navigation to /dashboard...');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(e => console.log('Navigation timeout, but checking state...'));
    
    console.log('Current URL:', page.url());
    
    // Check if error overlay exists
    const overlayExists = await page.evaluate(() => {
      return !!document.querySelector('nextjs-portal');
    });
    
    if (overlayExists) {
      console.log('NEXT.JS ERROR OVERLAY DETECTED!');
      const overlayText = await page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        return portal ? portal.innerText : 'Unknown error';
      });
      console.log('Overlay content:', overlayText.substring(0, 500) + '...');
    }
    
    // Wait for Onboarding Wizard
    console.log('Checking for Onboarding Wizard...');
    await new Promise(r => setTimeout(r, 2000));
    
    const wizardExists = await page.evaluate(() => {
      return document.body.innerText.includes('Welcome to NisFlow');
    });
    console.log('Wizard exists?', wizardExists);
    
    if (wizardExists) {
      console.log('Completing wizard...');
      // Click through the wizard
      await page.click('button:has-text("Get Started")').catch(()=>null);
      await new Promise(r => setTimeout(r, 1000));
      await page.type('input[name="name"]', 'Browser Test Bank').catch(()=>null);
      await page.type('input[name="opening_balance"]', '5000').catch(()=>null);
      await page.click('button:has-text("Save Account")').catch(()=>null);
      await new Promise(r => setTimeout(r, 3000));
      await page.click('button:has-text("Go to Dashboard")').catch(()=>null);
    }
    
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Final URL:', page.url());
    const finalOverlayExists = await page.evaluate(() => {
      return !!document.querySelector('nextjs-portal');
    });
    console.log('Final error overlay exists?', finalOverlayExists);
    if (finalOverlayExists) {
      const overlayText = await page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        return portal ? portal.innerText : 'Unknown error';
      });
      console.log('Final overlay content:', overlayText.substring(0, 1000) + '...');
    }
    
    console.log('Test finished. Total errors caught:', errors.length);
  } catch (err) {
    console.error('Test script crashed:', err);
  } finally {
    await browser.close();
  }
}

test();
