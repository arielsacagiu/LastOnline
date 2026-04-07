const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SESSION_DIR = path.join(__dirname, 'wa_session');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function setup() {
  console.log('');
  console.log('┌──────────────────────────────────────────┐');
  console.log('│  WhatsApp Web – One-Time Link Setup      │');
  console.log('└──────────────────────────────────────────┘');
  console.log('');
  console.log('This opens a visible Chrome window so you can');
  console.log('link your WhatsApp account. Once linked, the');
  console.log('backend will run headless and reuse the session.');
  console.log('');

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: SESSION_DIR,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
    ],
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('Opening WhatsApp Web...');
  await page.goto('https://web.whatsapp.com', {
    waitUntil: 'networkidle2',
    timeout: 60_000,
  });

  // Detect current state
  const state = await detectState(page);

  if (state === 'connected') {
    console.log('');
    console.log('✅  Already connected! Session is valid.');
    console.log('    You can close this window and start the backend:');
    console.log('    npm start');
    console.log('');
    await ask('Press Enter to close the browser...');
    await browser.close();
    return;
  }

  console.log('');
  console.log('🔗  WhatsApp Web login screen detected.');
  console.log('');
  console.log('In the browser window that just opened:');
  console.log('');
  console.log('  1. Click "Link with phone number" (below the QR code)');
  console.log('  2. Enter your phone number');
  console.log('  3. Open WhatsApp on your phone');
  console.log('  4. Go to Settings → Linked Devices → Link a Device');
  console.log('  5. Enter the 8-digit code shown in the browser');
  console.log('');
  console.log('Waiting for you to complete linking...');
  console.log('');

  // Poll until connected (up to 3 minutes)
  const deadline = Date.now() + 180_000;
  let linked = false;

  while (Date.now() < deadline) {
    await delay(3000);
    const currentState = await detectState(page);
    if (currentState === 'connected') {
      linked = true;
      break;
    }
    if (currentState === 'loading') {
      console.log('  ⏳ Loading chats...');
    }
  }

  if (linked) {
    // Give WhatsApp a moment to fully sync
    await delay(3000);
    console.log('');
    console.log('✅  WhatsApp linked successfully!');
    console.log('    Session saved to wa_session/');
    console.log('');
    console.log('    Now start the backend:');
    console.log('    npm start');
    console.log('');
  } else {
    console.log('');
    console.log('⏰  Timed out waiting for link.');
    console.log('    You can keep the browser open and finish manually,');
    console.log('    or re-run this script.');
    console.log('');
  }

  await ask('Press Enter to close the browser...');
  await browser.close();
}

async function detectState(page) {
  try {
    return await page.evaluate(() => {
      const body = (document.body?.innerText || '').toLowerCase();
      if (document.querySelector('#side') ||
          document.querySelector('[data-testid="chat-list"]') ||
          document.querySelector('[aria-label="Chat list"]') ||
          document.querySelector('[data-testid="chat-list-search"]')) {
        return 'connected';
      }
      if (body.includes('loading your chats') ||
          body.includes('getting your messages') ||
          body.includes('downloading recent messages')) {
        return 'loading';
      }
      if (document.querySelector('[data-testid="qrcode"]') ||
          body.includes('scan to log in') ||
          body.includes('log in with phone number') ||
          body.includes('link with phone number')) {
        return 'login_required';
      }
      return 'unknown';
    });
  } catch {
    return 'unknown';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
