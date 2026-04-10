const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SESSION_DIR = path.join(__dirname, 'wa_session');
const WHATSAPP_HOME_URL = 'https://web.whatsapp.com/';
const WHATSAPP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SETUP_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2_000;
const LOGIN_HINTS = [
  'scan to log in',
  'log in with phone number',
  'link with phone number',
];
const CODE_HINTS = [
  'enter the 8-digit code',
  'enter this code on your phone',
  'linked devices',
  'link a device',
];
const LOADING_HINTS = [
  'loading your chats',
  'getting your messages',
  'downloading recent messages',
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPairingCodeFromText(text) {
  const source = String(text || '');
  const matches = source.matchAll(/(^|[^\d])((?:\d[\s-]*){8})(?![\s-]*\d)/g);

  for (const match of matches) {
    const digits = match[2].replace(/\D/g, '');
    if (digits.length === 8) {
      return digits;
    }
  }

  return null;
}

function detectStateFromText(text) {
  const source = String(text || '').toLowerCase();

  if (
    source.includes('#side') ||
    source.includes('[data-testid="chat-list"]') ||
    source.includes('[aria-label="chat list"]')
  ) {
    return 'connected';
  }

  if (extractPairingCodeFromText(source) || CODE_HINTS.some((hint) => source.includes(hint))) {
    return 'phone_code';
  }

  if (LOADING_HINTS.some((hint) => source.includes(hint))) {
    return 'loading';
  }

  if (LOGIN_HINTS.some((hint) => source.includes(hint))) {
    return 'login_required';
  }

  return 'unknown';
}

async function readPageState(page) {
  try {
    return await page.evaluate(() => {
      const pageText = document.body?.innerText || '';

      return {
        hasSidebar: Boolean(
          document.querySelector('#side') ||
            document.querySelector('[data-testid="chat-list"]') ||
            document.querySelector('[aria-label="Chat list"]') ||
            document.querySelector('[data-testid="chat-list-search"]')
        ),
        pageText,
      };
    });
  } catch {
    return { hasSidebar: false, pageText: '' };
  }
}

async function setupWithPhoneCode() {
  const puppeteer = require('puppeteer');

  console.log('');
  console.log('WhatsApp Web Phone-Code Setup');
  console.log('=============================');
  console.log('');
  console.log('This opens a visible Chrome window using the same wa_session profile');
  console.log('the backend uses. Once WhatsApp shows the 8-digit phone code, this');
  console.log('script will print it here so you can enter it on your phone.');
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
  const page = pages[0] || (await browser.newPage());
  await page.setUserAgent(WHATSAPP_USER_AGENT);

  console.log('Opening WhatsApp Web...');
  await page.goto(WHATSAPP_HOME_URL, {
    waitUntil: 'networkidle2',
    timeout: 60_000,
  });
  await delay(3_000);

  let snapshot = await readPageState(page);
  if (snapshot.hasSidebar) {
    console.log('');
    console.log('Already connected. The saved session is valid.');
    console.log('');
    await ask('Press Enter to close the browser...');
    await browser.close();
    return;
  }

  console.log('');
  console.log('In the browser window:');
  console.log('1. Click "Log in with phone number"');
  console.log('2. Follow the WhatsApp instructions until the 8-digit code appears');
  console.log('3. Enter that code on your phone in Settings > Linked Devices > Link a Device');
  console.log('');
  console.log('This terminal will print the code as soon as it is visible.');
  console.log('');

  const deadline = Date.now() + SETUP_TIMEOUT_MS;
  let lastCode = null;
  let lastState = null;
  let lastReminderAt = 0;

  while (Date.now() < deadline) {
    snapshot = await readPageState(page);
    const state = snapshot.hasSidebar ? 'connected' : detectStateFromText(snapshot.pageText);
    const code = extractPairingCodeFromText(snapshot.pageText);

    if (state !== lastState) {
      if (state === 'loading') {
        console.log('Loading WhatsApp Web...');
      } else if (state === 'phone_code') {
        console.log('Phone-code screen detected.');
      } else if (state === 'login_required') {
        console.log('Waiting for the phone-code login screen...');
      }
      lastState = state;
    }

    if (code && code !== lastCode) {
      lastCode = code;
      console.log('');
      console.log(`Current code: ${code}`);
      console.log('');
    }

    if (state === 'connected') {
      console.log('');
      console.log('WhatsApp linked successfully.');
      console.log('Session saved to wa_session/.');
      console.log('');
      await ask('Press Enter to close the browser...');
      await browser.close();
      return;
    }

    if (
      state === 'login_required' &&
      !code &&
      Date.now() - lastReminderAt >= 20_000
    ) {
      console.log('Still waiting for the code screen. Click "Log in with phone number" in the browser if needed.');
      lastReminderAt = Date.now();
    }

    await delay(POLL_INTERVAL_MS);
  }

  console.log('');
  if (lastCode) {
    console.log(`Timed out waiting for the final link confirmation. Last code seen: ${lastCode}`);
  } else {
    console.log('Timed out before a phone code appeared.');
  }
  console.log('You can leave the browser open and finish manually, or run this script again.');
  console.log('');

  await ask('Press Enter to close the browser...');
  await browser.close();
}

module.exports = {
  detectStateFromText,
  extractPairingCodeFromText,
};

if (require.main === module) {
  setupWithPhoneCode().catch((err) => {
    console.error('Phone-code setup failed:', err.message);
    process.exit(1);
  });
}
