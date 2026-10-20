/*
  Diagnosis v2 — answers three questions in the real Electron app:
    1. Do document-level listeners see the mouse events of a real click on
       a dialog input? (event delivery)
    2. Does the dialog DOM node get replaced while open? (focus theft)
    3. Do modal BUTTONS respond to the same real-click mechanism? (scope)
*/
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
});

const BACKEND = "http://127.0.0.1:5478";
const CDP = "http://127.0.0.1:9222";

let cdpId = 0;
const pending = new Map();

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("ws error"));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: res, reject: rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(message.error.message));
        else res(message.result);
      }
    };
  });
}

function cdp(ws, method, params = {}) {
  const id = ++cdpId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await cdp(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(ws, expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(ws, expression)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function realClickAt(ws, x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", {
      type, x, y, button: "left", clickCount: 1,
    });
  }
}

async function main() {
  const loginResponse = await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  const { token, user } = await loginResponse.json();

  const targetList = await (await fetch(`${CDP}/json/list`)).json();
  const page = targetList.find((t) => t.type === "page");
  const ws = await connect(page.webSocketDebuggerUrl);
  await cdp(ws, "Page.enable");
  await cdp(ws, "Runtime.enable");

  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: user.id, email: user.email, role: user.role,
      name: user.full_name, phone: user.phone || "",
    }))});
    location.reload();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 3500));

  await evaluate(ws, `(() => {
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);
  await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);

  const okButton = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);
  if (!okButton) {
    console.log('NO Add Student button. body:', (await evaluate(ws, `document.body.innerText.slice(0, 300)`)));
    process.exit(1);
  }

  await evaluate(ws, `(() => {
    [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Add Student')).click();
    return true;
  })()`);
  const okInput = await waitFor(ws, `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`);
  if (!okInput) {
    console.log('NO dialog input. inputs:', JSON.stringify(await evaluate(ws, `[...document.querySelectorAll('input')].map((e) => e.placeholder)`)));
    process.exit(1);
  }

  // ---- 1. document-level capture listeners (survive element replacement)
  await evaluate(ws, `(() => {
    window.__log = [];
    ['mousedown', 'mouseup', 'click'].forEach((type) => {
      document.addEventListener(type, (e) => {
        window.__log.push({
          type,
          on: e.target.tagName + '|' + (e.target.getAttribute('placeholder') || '') + '|' + String(e.target.className).slice(0, 40),
          prevented: e.defaultPrevented,
        });
      }, true);
    });
    // DOM stability probe: same node?
    const input = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    window.__nodeRef = input;
    window.__nodeReplaced = false;
    new MutationObserver(() => {
      const now = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
      if (now && window.__nodeRef && now !== window.__nodeRef) window.__nodeReplaced = true;
    }).observe(document.body, { childList: true, subtree: true });
    return true;
  })()`);

  // ---- click the input by fresh coordinates
  const coords = await evaluate(ws, `(() => {
    const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  console.log("input coords:", JSON.stringify(coords));

  await realClickAt(ws, coords.x, coords.y);
  await new Promise((r) => setTimeout(r, 400));

  const state1 = await evaluate(ws, `(() => ({
    log: window.__log,
    active: document.activeElement.tagName + '|' + (document.activeElement.getAttribute?.('placeholder') || ''),
    nodeReplaced: window.__nodeReplaced,
    hitNow: (() => { const el = document.elementFromPoint(${coords.x}, ${coords.y}); return el ? el.tagName + '|' + (el.getAttribute('placeholder')||'') : 'null'; })(),
    inputVisible: (() => { const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
      if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
  }))()`);
  console.log("=== after clicking input ===");
  console.log(JSON.stringify(state1, null, 2));

  // ---- 3. real-click a modal button (Cancel / close X) for comparison
  await evaluate(ws, `(() => { window.__log = []; return true; })()`);
  const btnCoords = await evaluate(ws, `(() => {
    const shell = [...document.querySelectorAll('.fixed.inset-0')].pop();
    if (!shell) return null;
    const btn = [...shell.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close')
      || [...shell.querySelectorAll('button')].pop();
    if (!btn) return null;
    btn.setAttribute('data-diag-close', '1');
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  console.log("close button coords:", JSON.stringify(btnCoords));

  if (btnCoords) {
    await realClickAt(ws, btnCoords.x, btnCoords.y);
    await new Promise((r) => setTimeout(r, 400));

    const state2 = await evaluate(ws, `(() => ({
      log: window.__log,
      dialogStillOpen: !!document.querySelector('[data-diag-close]'),
    }))()`);
    console.log("=== after clicking button ===");
    console.log(JSON.stringify(state2, null, 2));
  }

  // ---- 4. check GPU / compositing hints
  const env = await evaluate(ws, `(() => ({
    backdropFilterSupported: CSS.supports('backdrop-filter', 'blur(2px)') || CSS.supports('-webkit-backdrop-filter', 'blur(2px)'),
    gpu: navigator.gpu ? 'webgpu' : 'none',
  }))()`);
  console.log("env:", JSON.stringify(env));

  process.exit(0);
}

main().catch((e) => {
  console.error("DIAG2 CRASH:", e.message);
  process.exit(1);
});
