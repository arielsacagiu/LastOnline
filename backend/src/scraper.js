const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

let browser = null;
let sessionPage = null;
let browserManagedExternally = false;
const contactPages = new Map();

const SESSION_DIR = path.join(__dirname, '..', 'wa_session');
const WHATSAPP_HOME_URL = 'https://web.whatsapp.com/';
const REMOTE_BROWSER_URL = process.env.WHATSAPP_BROWSER_URL;
const REMOTE_BROWSER_WS_ENDPOINT = process.env.WHATSAPP_BROWSER_WS_ENDPOINT;
const DEFAULT_SETTLE_MS = 500;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60000;
const DEFAULT_SELECTOR_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const PRESENCE_RENDER_DELAY_MS = 1500;
const HIDDEN_READ_ATTEMPTS = 4;
const HIDDEN_RETRY_DELAY_MS = 1000;
const CONTACT_REFRESH_INTERVAL_MS = 30000;
const HIDDEN_RELOAD_ATTEMPTS = 2;
const WHATSAPP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const parsedSettleMs = Number(process.env.WHATSAPP_SETTLE_MS);
const SETTLE_MS = Number.isFinite(parsedSettleMs) && parsedSettleMs >= 0
  ? parsedSettleMs
  : DEFAULT_SETTLE_MS;

const HEBREW_LOGIN_SCAN_TEXT = '\u05db\u05d3\u05d9 \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8 \u05e6\u05e8\u05d9\u05da \u05dc\u05e1\u05e8\u05d5\u05e7';
const HEBREW_LOGIN_PHONE_TEXT = '\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea \u05e2\u05dd \u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df';
const HEBREW_LOADING_TEXT = '\u05d1\u05d4\u05e6\u05e4\u05e0\u05d4 \u05de\u05e7\u05e6\u05d4 \u05dc\u05e7\u05e6\u05d4';
const HEBREW_INVALID_NUMBER_TEXT = '\u05de\u05e1\u05e4\u05e8 \u05d4\u05d8\u05dc\u05e4\u05d5\u05df \u05d0\u05d9\u05e0\u05d5 \u05ea\u05e7\u05d9\u05df';
const HEBREW_ONLINE_TEXTS = [
  '\u05de\u05d7\u05d5\u05d1\u05e8/\u05ea',
  '\u05de\u05d7\u05d5\u05d1\u05e8',
  '\u05de\u05d7\u05d5\u05d1\u05e8\u05ea',
];
const HEBREW_LAST_SEEN_PREFIXES = [
  '\u05e0\u05e8\u05d0\u05d4 \u05dc\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4',
  '\u05e0\u05e8\u05d0\u05d4/\u05ea\u05d4 \u05dc\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4',
];
const HEBREW_TODAY_AT = '\u05d4\u05d9\u05d5\u05dd \u05d1';
const HEBREW_YESTERDAY_AT = '\u05d0\u05ea\u05de\u05d5\u05dc \u05d1';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber || '').replace(/[^0-9]/g, '');
}

function isOnlinePresenceText(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'online' || HEBREW_ONLINE_TEXTS.includes(text);
}

async function getBrowser() {
  if (!browser || !browser.connected) {
    browserManagedExternally = Boolean(
      REMOTE_BROWSER_URL || REMOTE_BROWSER_WS_ENDPOINT
    );

    if (REMOTE_BROWSER_WS_ENDPOINT) {
      browser = await puppeteer.connect({
        browserWSEndpoint: REMOTE_BROWSER_WS_ENDPOINT,
      });
    } else if (REMOTE_BROWSER_URL) {
      browser = await puppeteer.connect({
        browserURL: REMOTE_BROWSER_URL,
      });
    } else {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      browser = await puppeteer.launch({
        headless: true,
        userDataDir: SESSION_DIR,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }

    browser.on('disconnected', () => {
      browser = null;
      sessionPage = null;
      browserManagedExternally = false;
      contactPages.clear();
    });
  }

  return browser;
}

async function configurePage(page) {
  page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(DEFAULT_SELECTOR_TIMEOUT_MS);
  await page.setUserAgent(WHATSAPP_USER_AGENT);
}

async function createPage() {
  const activeBrowser = await getBrowser();
  const page = await activeBrowser.newPage();
  await configurePage(page);
  return page;
}

async function navigate(page, url) {
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
  });

  if (SETTLE_MS > 0) {
    await delay(SETTLE_MS);
  }
}

async function ensureSessionPage() {
  if (browserManagedExternally) {
    const activeBrowser = await getBrowser();
    const pages = await activeBrowser.pages();
    const existingPage = pages.find(
      (page) => !page.isClosed() && page.url().includes('web.whatsapp.com')
    );

    if (existingPage) {
      await configurePage(existingPage).catch(() => {});
      return existingPage;
    }

    return createPage();
  }

  if (sessionPage && !sessionPage.isClosed()) {
    return sessionPage;
  }

  sessionPage = await createPage();

  sessionPage.on('close', () => {
    if (sessionPage && sessionPage.isClosed()) {
      sessionPage = null;
    }
  });

  return sessionPage;
}

async function navigateToSessionHome(page) {
  await navigate(page, WHATSAPP_HOME_URL);
}

async function waitForWhatsAppReady(page) {
  try {
    await page.waitForSelector(
      '#side, [data-testid="chat-list"], [data-testid="chat-list-search"]',
      { timeout: 60000 }
    );
    console.log('[Scraper] WhatsApp Web loaded (sidebar ready)');
    await delay(1000);
  } catch {
    console.log('[Scraper] WhatsApp Web sidebar did not appear within 60s');
  }
}

async function navigateToContact(entry) {
  const url = `https://web.whatsapp.com/send?phone=${entry.phone}`;
  await navigate(entry.page, url);
  await waitForWhatsAppReady(entry.page);
  entry.lastNavigationAt = Date.now();
}

async function createContactEntry(cleanedPhone) {
  const page = await createPage();

  const entry = {
    phone: cleanedPhone,
    page,
    lastNavigationAt: 0,
  };

  page.on('close', () => {
    const current = contactPages.get(cleanedPhone);
    if (current && current.page === page) {
      contactPages.delete(cleanedPhone);
    }
  });

  contactPages.set(cleanedPhone, entry);
  console.log(`[Scraper] Starting live monitor for ${cleanedPhone}`);
  await navigateToContact(entry);
  return entry;
}

async function getOrCreateContactEntry(phoneNumber) {
  const cleanedPhone = normalizePhoneNumber(phoneNumber);
  if (!cleanedPhone) {
    throw new Error('Invalid phone number');
  }

  const existing = contactPages.get(cleanedPhone);
  if (existing && !existing.page.isClosed()) {
    return existing;
  }

  contactPages.delete(cleanedPhone);
  return createContactEntry(cleanedPhone);
}

async function readSessionState(page) {
  const result = await page.evaluate(
    ({
      hebrewLoginScanText,
      hebrewLoginPhoneText,
      hebrewLoadingText,
    }) => {
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const hasHeaders = document.querySelectorAll('header').length >= 2;

      return {
        hasQrCode: Boolean(
          document.querySelector('[data-testid="qrcode"]') ||
          document.querySelector('canvas')
        ),
        hasSidebar: Boolean(document.querySelector('#side')),
        hasHeaders,
        hasInputField: Boolean(document.querySelector('[contenteditable="true"]')),
        loginTextVisible:
          bodyText.includes('scan to log in') ||
          bodyText.includes('log in with phone number') ||
          bodyText.includes('link with phone number instead') ||
          bodyText.includes(hebrewLoginScanText) ||
          bodyText.includes(hebrewLoginPhoneText),
        loadingTextVisible:
          bodyText.includes('loading your chats') ||
          bodyText.includes('getting your messages') ||
          bodyText.includes('downloading recent messages') ||
          bodyText.includes(hebrewLoadingText),
      };
    },
    {
      hebrewLoginScanText: HEBREW_LOGIN_SCAN_TEXT,
      hebrewLoginPhoneText: HEBREW_LOGIN_PHONE_TEXT,
      hebrewLoadingText: HEBREW_LOADING_TEXT,
    }
  );

  if (result.loginTextVisible) {
    return {
      status: 'login_required',
      connected: false,
      message: 'WhatsApp Web is not linked yet',
    };
  }

  if (result.hasSidebar || result.hasHeaders || result.hasInputField) {
    return {
      status: 'connected',
      connected: true,
      message: 'WhatsApp Web session is active',
    };
  }

  if (result.loadingTextVisible) {
    return {
      status: 'loading',
      connected: false,
      message: 'WhatsApp Web is still loading',
    };
  }

  if (result.hasQrCode) {
    return {
      status: 'login_required',
      connected: false,
      message: 'WhatsApp Web is not linked yet',
    };
  }

  return {
    status: 'unknown',
    connected: false,
    message: 'Could not determine WhatsApp Web session state',
  };
}

async function getSessionStatus() {
  try {
    if (browser && browser.connected && contactPages.size > 0) {
      for (const [, entry] of contactPages) {
        if (
          entry.page &&
          !entry.page.isClosed() &&
          entry.page.url().includes('web.whatsapp.com')
        ) {
          try {
            const result = await readSessionState(entry.page);
            if (
              result.status === 'connected' ||
              result.status === 'login_required'
            ) {
              return { ...result, checkedAt: new Date().toISOString() };
            }
          } catch {
            // If the page is mid-navigation, the browser is still alive.
          }

          return {
            status: 'connected',
            connected: true,
            message: 'WhatsApp Web session is active (browser running)',
            checkedAt: new Date().toISOString(),
          };
        }
      }
    }

    const page = await ensureSessionPage();
    const isOnWhatsApp = page.url().includes('web.whatsapp.com');

    if (!browserManagedExternally || !isOnWhatsApp) {
      await navigateToSessionHome(page);
    } else if (SETTLE_MS > 0) {
      await delay(SETTLE_MS);
    }

    let result = await readSessionState(page);
    if (result.status === 'unknown') {
      await delay(Math.max(SETTLE_MS, 1000));
      result = await readSessionState(page);
    }

    return {
      ...result,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err.message || 'Unknown browser error';
    const profileInUse =
      message.toLowerCase().includes('user data directory is already in use') ||
      message.toLowerCase().includes('processsingleton');

    return {
      status: profileInUse ? 'profile_in_use' : 'error',
      connected: false,
      message: profileInUse
        ? 'WhatsApp session profile is open in another browser. Close it and retry.'
        : message,
      checkedAt: new Date().toISOString(),
    };
  }
}

async function readPresenceSnapshot(page) {
  return page.evaluate(
    ({
      hebrewInvalidNumberText,
      hebrewOnlineTexts,
      hebrewLastSeenPrefixes,
      hebrewTodayAt,
      hebrewYesterdayAt,
    }) => {
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const headers = Array.from(document.querySelectorAll('header'));
      const headerFound = headers.length >= 2;

      if (
        bodyText.includes('phone number shared via url is invalid') ||
        bodyText.includes('not on whatsapp') ||
        bodyText.includes('this person is not on whatsapp') ||
        bodyText.includes(hebrewInvalidNumberText)
      ) {
        return { headerFound: false, lastSeenText: null, invalidNumber: true };
      }

      const extractPresenceText = (value) => {
        const text = String(value || '').trim();
        const normalized = text.toLowerCase();
        if (!text || text.length > 100) {
          return null;
        }

        if (normalized === 'online') {
          return 'online';
        }

        if (hebrewOnlineTexts.includes(normalized)) {
          return text;
        }

        const englishLastSeenIndex = normalized.indexOf('last seen');
        if (englishLastSeenIndex >= 0) {
          return text.slice(englishLastSeenIndex).trim();
        }

        const englishTodayIndex = normalized.indexOf('today at');
        if (englishTodayIndex >= 0) {
          return text.slice(englishTodayIndex).trim();
        }

        const englishYesterdayIndex = normalized.indexOf('yesterday at');
        if (englishYesterdayIndex >= 0) {
          return text.slice(englishYesterdayIndex).trim();
        }

        for (const prefix of hebrewLastSeenPrefixes) {
          const hebrewLastSeenIndex = normalized.indexOf(prefix);
          if (hebrewLastSeenIndex >= 0) {
            return text.slice(hebrewLastSeenIndex).trim();
          }
        }

        const hebrewTodayIndex = normalized.indexOf(hebrewTodayAt);
        if (hebrewTodayIndex >= 0) {
          return text.slice(hebrewTodayIndex).trim();
        }

        const hebrewYesterdayIndex = normalized.indexOf(hebrewYesterdayAt);
        if (hebrewYesterdayIndex >= 0) {
          return text.slice(hebrewYesterdayIndex).trim();
        }

        return null;
      };

      const seen = new Set();
      const candidates = [];

      const addText = (value) => {
        const text = String(value || '').trim();
        const normalized = text.toLowerCase();
        if (!text || text.length > 100 || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        candidates.push(text);
      };

      const collectCandidates = (root) => {
        if (!root) {
          return;
        }

        const elements = root.querySelectorAll(
          'span, div, [title], [aria-label], [dir="auto"]'
        );
        for (const element of elements) {
          addText(element.getAttribute('title'));
          addText(element.getAttribute('aria-label'));
          addText(element.textContent);
        }
      };

      for (const header of headers) {
        collectCandidates(header);
      }

      if (candidates.length === 0) {
        collectCandidates(document.body);
      }

      const match =
        candidates
          .map((candidate) => extractPresenceText(candidate))
          .find(Boolean) || null;

      return {
        headerFound,
        lastSeenText: match,
        invalidNumber: false,
      };
    },
    {
      hebrewInvalidNumberText: HEBREW_INVALID_NUMBER_TEXT,
      hebrewOnlineTexts: HEBREW_ONLINE_TEXTS,
      hebrewLastSeenPrefixes: HEBREW_LAST_SEEN_PREFIXES,
      hebrewTodayAt: HEBREW_TODAY_AT,
      hebrewYesterdayAt: HEBREW_YESTERDAY_AT,
    }
  );
}

async function readPresenceFromPage(page) {
  const sessionState = await readSessionState(page);
  if (sessionState.status === 'login_required') {
    return {
      status: 'qr_required',
      lastSeen: null,
      message: 'WhatsApp Web login required on server',
      needsRefresh: false,
    };
  }

  if (sessionState.status === 'loading') {
    return {
      status: 'error',
      lastSeen: null,
      message: sessionState.message,
      needsRefresh: true,
    };
  }

  try {
    await page.waitForSelector('header', { timeout: 10000 });
  } catch {
    return {
      status: 'error',
      lastSeen: null,
      message: 'Page not ready (no header elements)',
      needsRefresh: true,
    };
  }

  for (let attempt = 0; attempt < HIDDEN_READ_ATTEMPTS; attempt++) {
    await delay(
      attempt === 0 ? PRESENCE_RENDER_DELAY_MS : HIDDEN_RETRY_DELAY_MS
    );

    const result = await readPresenceSnapshot(page);

    if (result.invalidNumber) {
      return {
        status: 'error',
        lastSeen: null,
        message: 'Phone number is not on WhatsApp',
        needsRefresh: false,
      };
    }

    if (!result.headerFound) {
      if (attempt < HIDDEN_READ_ATTEMPTS - 1) {
        continue;
      }

      return {
        status: 'error',
        lastSeen: null,
        message: 'Conversation header not ready',
        needsRefresh: true,
      };
    }

    if (result.lastSeenText) {
      return {
        status: isOnlinePresenceText(result.lastSeenText) ? 'online' : 'offline',
        lastSeen: result.lastSeenText,
        message: null,
        needsRefresh: false,
      };
    }
  }

  return {
    status: 'hidden',
    lastSeen: null,
    message: 'Last seen is hidden or unavailable',
    needsRefresh: false,
  };
}

async function checkLastSeen(phoneNumber) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const entry = await getOrCreateContactEntry(phoneNumber);

      if (entry.page.isClosed()) {
        contactPages.delete(normalizePhoneNumber(phoneNumber));
        continue;
      }

      const shouldRefreshPage =
        !entry.page.url().includes('web.whatsapp.com') ||
        Date.now() - entry.lastNavigationAt > CONTACT_REFRESH_INTERVAL_MS;

      if (shouldRefreshPage) {
        await navigateToContact(entry);
      }

      let result = await readPresenceFromPage(entry.page);

      if (result.needsRefresh) {
        await navigateToContact(entry);
        result = await readPresenceFromPage(entry.page);
      }

      if (result.status === 'hidden') {
        for (let hiddenAttempt = 0; hiddenAttempt < HIDDEN_RELOAD_ATTEMPTS; hiddenAttempt++) {
          await navigateToContact(entry);
          result = await readPresenceFromPage(entry.page);
          if (result.status !== 'hidden') {
            break;
          }
        }
      }

      if (result.status === 'error' && attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return {
        status: result.status,
        lastSeen: result.lastSeen,
        message: result.message,
      };
    } catch (err) {
      lastError = err;
      console.error(
        `[Scraper] Attempt ${attempt + 1} failed for ${phoneNumber}: ${err.message}`
      );

      const cleanedPhone = normalizePhoneNumber(phoneNumber);
      const broken = contactPages.get(cleanedPhone);
      if (broken && !broken.page.isClosed()) {
        await broken.page.close().catch(() => {});
      }
      contactPages.delete(cleanedPhone);

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  return {
    status: 'error',
    lastSeen: null,
    message: lastError?.message || 'Max retries exceeded',
  };
}

async function syncTrackedPhones(phoneNumbers) {
  const activePhones = new Set(
    Array.from(phoneNumbers, (phoneNumber) => normalizePhoneNumber(phoneNumber)).filter(Boolean)
  );

  for (const [phone, entry] of contactPages.entries()) {
    if (activePhones.has(phone)) {
      continue;
    }

    contactPages.delete(phone);
    console.log(`[Scraper] Stopping live monitor for ${phone}`);
    if (!entry.page.isClosed()) {
      await entry.page.close().catch(() => {});
    }
  }
}

async function shutdownScraper() {
  if (sessionPage && !sessionPage.isClosed()) {
    await sessionPage.close().catch(() => {});
  }
  sessionPage = null;

  for (const [phone, entry] of contactPages.entries()) {
    contactPages.delete(phone);
    if (!entry.page.isClosed()) {
      await entry.page.close().catch(() => {});
    }
  }

  if (browser && browser.connected) {
    if (browserManagedExternally) {
      await browser.disconnect();
    } else {
      await browser.close().catch(() => {});
    }
  }

  browser = null;
  browserManagedExternally = false;
}

module.exports = {
  checkLastSeen,
  getSessionStatus,
  normalizePhoneNumber,
  shutdownScraper,
  syncTrackedPhones,
};
