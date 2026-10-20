/*
  Race test — opens the dialog as soon as the button appears (while
  classes/subjects/students are still loading), clicks the name input
  immediately, types, and watches whether the input node is replaced
  (which would steal focus and swallow typing).
*/
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

async function waitFor(ws, expression, timeoutMs = 20000) {
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
  const loginResponse = await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const { token, user } = await loginResponse.json();

  const targetList = await (await fetch(`${CDP}/json/list`)).json();
  const page = targetList.find((t) => t.type === "page");
  const ws = await connect(page.webSocketDebuggerUrl);
  await cdp(ws, "Runtime.enable");

  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: user.id, email: user.email, role: user.role,
      name: user.full_name, phone: user.phone || "",
    }))});
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);

  const hasAdd = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);
  if (!hasAdd) { console.log("FAIL no Add Student button"); process.exit(1); }

  // Open immediately.
  await clickElement(ws, `[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Add Student'))`);

  const hasInput = await waitFor(ws, `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`, 6000);
  if (!hasInput) { console.log("FAIL dialog did not open"); process.exit(1); }

  // Instrument immediately — catch replacement the moment it happens.
  await evaluate(ws, `(() => {
    window.__events = [];
    window.__replacedAt = null;
    window.__focusLostAt = null;
    const find = () => [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    window.__ref = find();
    const t0 = Date.now();

    new MutationObserver(() => {
      const now = find();
      if (!now) { if (!window.__goneAt) window.__goneAt = Date.now() - t0; return; }
      if (window.__ref && now !== window.__ref && !window.__replacedAt) {
        window.__replacedAt = Date.now() - t0;
      }
      window.__ref = now;
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('focusout', (e) => {
      if (e.target === window.__ref && !window.__focusLostAt) {
        window.__focusLostAt = Date.now() - t0 + ' → ' +
          (document.activeElement ? document.activeElement.tagName : 'none');
      }
    }, true);

    return true;
  })()`);

  // Click the input IMMEDIATELY.
  const clicked = await clickElement(ws,
    `[...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name')`);
  console.log("immediate click dispatched:", clicked);

  await cdp(ws, "Input.insertText", { text: "RaceTest" });

  const samples = [];
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    samples.push(await evaluate(ws, `(() => {
      const find = () => [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
      const el = find();
      return {
        v: el ? el.value : null,
        focused: document.activeElement === el,
        focusedTag: document.activeElement ? document.activeElement.tagName : 'none',
      };
    })()`));
    console.log(`t+${(i + 1) * 500}ms:`, JSON.stringify(samples[i]));
  }

  const diag = await evaluate(ws, `({
    replacedAt: window.__replacedAt, focusLostAt: window.__focusLostAt, goneAt: window.__goneAt
  })`);
  console.log("replacement/focus diagnostics:", JSON.stringify(diag));

  const finalValue = samples[samples.length - 1].v;
  const typingSurvived = finalValue === "RaceTest";
  const focusSurvived = samples[samples.length - 1].focused;

  console.log(`\n${typingSurvived ? "PASS" : "FAIL"}  typing survived data loading (value=${JSON.stringify(finalValue)})`);
  console.log(`${focusSurvived ? "PASS" : "FAIL"}  focus survived data loading`);
  if (diag.replacedAt !== null && diag.replacedAt !== undefined) {
    console.log(`NOTE  input node was REPLACED ${diag.replacedAt}ms after open`);
  }

  // Cancel dialog.
  await evaluate(ws, `[...document.querySelectorAll('.fixed.inset-0 button')].find((b) => b.getAttribute('aria-label') === 'Close')?.click(); true`);

  process.exit(typingSurvived && focusSurvived ? 0 : 1);
}

main().catch((e) => {
  console.error("TEST4 CRASH:", e.message);
  process.exit(1);
});
