/* Finds WHAT closes the dialog ~2.5s after opening (route change? state?). */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

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
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(ws, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(ws, expression)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function clickElement(ws, expression) {
  const coords = await evaluate(ws, `(() => {
    const el = ${expression};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!coords) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", {
      type, x: coords.x, y: coords.y, button: "left", clickCount: 1,
    });
  }
  return true;
}

async function main() {
  const login = await (await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  })).json();

  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = await connect(page.webSocketDebuggerUrl);
  await cdp(ws, "Runtime.enable");

  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(login.token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: login.user.id, email: login.user.email, role: login.user.role,
      name: login.user.full_name, phone: login.user.phone || "",
    }))});
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);

  const hasAdd = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);
  if (!hasAdd) { console.log("no Add Student button"); process.exit(1); }

  // Watch route changes + dialog disappearance + axios errors.
  await evaluate(ws, `(() => {
    window.__log = [];

    const push = history.pushState.bind(history);
    const repl = history.replaceState.bind(history);
    history.pushState = (...a) => { window.__log.push('push:' + a[2] + '@' + Date.now()); return push(...a); };
    history.replaceState = (...a) => { window.__log.push('replace:' + a[2] + '@' + Date.now()); return repl(...a); };
    window.addEventListener('popstate', () => window.__log.push('popstate:' + location.pathname + '@' + Date.now()));

    const find = () => [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    window.__ref = find();
    window.__t0 = Date.now();

    new MutationObserver(() => {
      if (window.__ref && !find()) {
        window.__log.push('DIALOG-GONE path=' + location.pathname + ' t=' + (Date.now() - window.__t0));
      }
    }).observe(document.body, { childList: true, subtree: true });

    // Track axios/network failures (401 would redirect).
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      window.__log.push('REJ status=' + (r && r.response && r.response.status) + ' url=' +
        (r && r.config && r.config.url) + '@' + (Date.now() - window.__t0));
    });

    return true;
  })()`);

  await clickElement(ws, `[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Add Student'))`);
  const opened = await waitFor(ws, `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`, 6000);
  console.log("dialog opened:", opened);
  if (!opened) process.exit(1);

  await evaluate(ws, `(() => { window.__ref = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name'); window.__t0 = Date.now(); return true; })()`);

  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await evaluate(ws, `(() => ({
      path: location.pathname,
      hasInput: [...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name'),
      focus: document.activeElement.tagName + '|' +
        String(document.activeElement.innerText || document.activeElement.placeholder || '').slice(0, 18),
    }))()`);
    console.log(`t+${(i + 1) * 500}ms`, JSON.stringify(s));
  }

  console.log("log:", JSON.stringify(await evaluate(ws, `window.__log`), null, 1));
  process.exit(0);
}

main().catch((e) => {
  console.error("TEST5 CRASH:", e.message);
  process.exit(1);
});
