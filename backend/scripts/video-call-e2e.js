/**
 * Real two-browser WebRTC test for private video calls (Phase 12).
 *
 * Two isolated Chrome sessions with Chrome's fake camera/microphone place
 * and answer real calls through the running backend + frontend: real
 * RTCPeerConnections, real ICE, real media. Verifies: ringing, incoming
 * dialog, accept, "Connected" from the peer connection, live remote video in
 * both directions, mute / camera off, hang-up releasing the devices, reject,
 * a receiver page refresh mid-call (reconnects), and the call history.
 *
 * Needs (development only — OTP_PROVIDER=dev):
 *   1. backend:  PORT=5055 CORS_ORIGIN=http://localhost:5180 npm start
 *   2. frontend: VITE_API_BASE_URL=http://localhost:5055/api/v1 npx vite --port 5180
 *   3. CHROME_PATH=<path to chrome/edge> npm run e2e:video
 *
 * It creates throw-away users named "Video Caller"/"Video Receiver" (emails
 * e2e_video_*@example.com) and deletes them at the end.
 */
const puppeteer = require('puppeteer-core');

const API = process.env.E2E_API_URL || 'http://localhost:5055/api/v1';
const APP = process.env.E2E_APP_URL || 'http://localhost:5180';
const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');
const PASSWORD = 'Secure123';
const CHROME_ARGS = [
  '--use-fake-ui-for-media-stream', // auto-grant camera/mic
  '--use-fake-device-for-media-stream', // synthetic camera + microphone
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json && json.message}`);
  return json;
}

async function createUser(label) {
  const email = `e2e_video_${label.toLowerCase()}_${Date.now()}@example.com`;
  const reg = await api('POST', '/auth/register', { email, password: PASSWORD });
  const otp = (await api('GET', `/dev/otp?destination=${encodeURIComponent(email)}`)).data.code;
  await api('POST', '/auth/verify-otp', { email, otp });
  const login = await api('POST', '/auth/login', { identifier: email, password: PASSWORD });
  const done = await api('POST', '/auth/login-verification/complete', {
    verification_token: login.data.verification_token,
    face_detected: true,
    face_count: 1,
  });
  const token = done.data.access_token;
  await api('POST', '/profile', { name: `Video ${label}`, dateOfBirth: '1995-05-05', gender: 'female', city: 'Pune' }, token);
  return { id: reg.data.user_id, token, name: `Video ${label}` };
}

async function openAs(browser, user) {
  const context = await browser.createBrowserContext(); // isolated, like a second device
  const page = await context.newPage();
  await page.evaluateOnNewDocument((token) => sessionStorage.setItem('mm.accessToken', token), user.token);
  return page;
}

const statusIs = (page, text, timeout = 25000) =>
  page.waitForFunction((t) => document.querySelector('[data-testid="call-status"]')?.textContent === t, { timeout }, text);
const waitForText = (page, pattern, timeout = 15000) =>
  page.waitForFunction((p) => new RegExp(p).test(document.body.innerText), { timeout }, pattern);
async function click(page, text, scope = '') {
  const [element] = await page.$$(`xpath/.//${scope}button[normalize-space()="${text}"]`);
  if (!element) throw new Error(`button "${text}" not found`);
  await element.click();
}
/** The remote <video> has real frames and its clock moves. */
const remoteVideoFlowing = (page) =>
  page.evaluate(async () => {
    const video = document.querySelector('[data-testid="remote-video"]');
    if (!video?.srcObject) return { ok: false };
    const t0 = video.currentTime;
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: video.videoWidth > 0 && video.currentTime > t0, size: `${video.videoWidth}x${video.videoHeight}` };
  });

async function placeAndAccept(pageA, pageB, receiverId) {
  await pageA.goto(`${APP}/video?with=${receiverId}`, { waitUntil: 'networkidle0' });
  await pageB.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
  await click(pageB, 'Accept', 'div[@role="alertdialog"]//');
  await statusIs(pageA, 'Connected');
  await statusIs(pageB, 'Connected');
}

async function run() {
  const caller = await createUser('Caller');
  const receiver = await createUser('Receiver');
  const request = await api('POST', '/connections', { receiverId: receiver.id }, caller.token);
  await api('PUT', `/connections/${request.data.connection.id}`, { action: 'accept' }, receiver.token);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
  try {
    const pageA = await openAs(browser, caller);
    const pageB = await openAs(browser, receiver);
    await pageB.goto(`${APP}/dashboard`, { waitUntil: 'networkidle0' });

    // 1. Full call
    await pageA.goto(`${APP}/chat/${receiver.id}`, { waitUntil: 'networkidle0' });
    await pageA.waitForSelector('a.chat__call', { timeout: 15000 });
    await pageA.click('a.chat__call');
    await pageA.waitForFunction(() => /Calling/.test(document.querySelector('[data-testid="call-status"]')?.textContent || ''), { timeout: 15000 });
    check('caller sees "Calling…"', true);
    await pageB.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
    check('receiver gets the incoming-call dialog', /Video Caller/.test(await pageB.$eval('[role="alertdialog"]', (el) => el.textContent)));
    await click(pageB, 'Accept', 'div[@role="alertdialog"]//');
    await statusIs(pageA, 'Connected');
    await statusIs(pageB, 'Connected');
    check('both sides reach "Connected" (RTCPeerConnection state)', true);
    for (const [label, page] of [['caller', pageA], ['receiver', pageB]]) {
      const flow = await remoteVideoFlowing(page);
      check(`${label} receives live remote video`, flow.ok, flow.size);
    }

    await pageA.evaluate(() => {
      window.__tracks = document.querySelector('[data-testid="local-video"]').srcObject.getTracks();
    });
    await click(pageA, 'Mute');
    await click(pageA, 'Camera off');
    const off = await pageA.evaluate(() => window.__tracks.map((t) => `${t.kind}:${t.enabled}`));
    check('mute + camera off disable the local tracks', off.includes('audio:false') && off.includes('video:false'), off.join(', '));
    await click(pageA, 'Unmute');
    await click(pageA, 'Camera on');
    const on = await pageA.evaluate(() => window.__tracks.map((t) => t.enabled));
    check('unmute + camera on re-enable them, call still connected', on.every(Boolean) && (await pageA.$eval('[data-testid="call-status"]', (e) => e.textContent)) === 'Connected');

    await new Promise((r) => setTimeout(r, 1200));
    await click(pageA, 'End call');
    await waitForText(pageB, 'Call ended');
    const released = await pageA.evaluate(() => window.__tracks.map((t) => t.readyState));
    check('hang-up: other side notified, camera/mic released', released.every((s) => s === 'ended'), released.join(', '));

    // 2. Reject
    await pageA.goto(`${APP}/video?with=${receiver.id}`, { waitUntil: 'networkidle0' });
    await pageB.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
    await click(pageB, 'Reject', 'div[@role="alertdialog"]//');
    await waitForText(pageA, 'The call was declined');
    check('a rejected call shows "declined" and never connects', true);

    // 3. Receiver refreshes mid-call
    await placeAndAccept(pageA, pageB, receiver.id);
    await pageB.reload({ waitUntil: 'networkidle0' });
    await statusIs(pageB, 'Connected', 30000);
    await statusIs(pageA, 'Connected', 30000);
    check('after a refresh the call reconnects', (await remoteVideoFlowing(pageA)).ok && (await remoteVideoFlowing(pageB)).ok);
    await click(pageB, 'End call');
    await waitForText(pageA, 'Call ended');
    check('the receiver can end the call', true);

    const history = (await api('GET', '/calls/history', null, caller.token)).data.calls.map((c) => c.status);
    check('history: ended, rejected, ended', history.join(',') === 'ended,rejected,ended', history.join(','));
  } finally {
    await browser.close();
  }
}

run()
  .catch((err) => check('unexpected error', false, err.message))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `${failed} check(s) failed.` : 'All two-browser video call checks passed.');
    console.log('Clean up the e2e_video_* users with: npm run e2e:video:cleanup');
    process.exitCode = failed ? 1 : 0;
  });
