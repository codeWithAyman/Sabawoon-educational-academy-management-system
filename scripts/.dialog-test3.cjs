/*
  Single-shot dialog test in the real Electron app:
    - navigates and ASSERTS every step
    - opens Add Student, waits for data to settle
    - real mouse click on the name input, with document-level event
      capture and a MutationObserver detecting input node replacement
    - checks focus, typing, then cancels via the Cancel BUTTON with a
      real click (tests that modal buttons work too)
*/
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const BACKEND = "http://127.0.0.1:5478";
const CDP = "http://127.0.0.1:9222";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

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
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function clickCoords(ws, x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", {
      type, x, y, button: "left", clickCount: 1,
    });
  }
}

async function clickElement(ws, expression) {
  const coords = await evaluate(ws, `(() => {
    const el = ${expression};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!coords) return false;
  await clickCoords(ws, coords.x, coords.y);
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
  await cdp(ws, "Page.enable");

  // Fresh start with a valid session.
  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: user.id, email: user.email, role: user.role,
      name: user.full_name, phone: user.phone || "",
    }))});
    location.href = '/';
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 4500));

  const atApp = await waitFor(ws, `location.pathname !== '/' || !!document.querySelector('input')`, 15000);
  record("app booted", atApp === true, await evaluate(ws, `location.pathname`));

  // Navigate to Students via SPA.
  await evaluate(ws, `(() => {
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);

  const hasAdd = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);
  record("Students page + Add Student button", hasAdd === true);

  if (!hasAdd) {
    console.log("pathname:", await evaluate(ws, `location.pathname`));
    process.exit(1);
  }

  // Open the dialog with a REAL click on the button.
  const openedClick = await clickElement(ws,
    `[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Add Student'))`);
  record("real click dispatched on Add Student", openedClick === true);

  const dialogOpen = await waitFor(ws,
    `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`, 8000);
  record("Add Student dialog opened via real click", dialogOpen === true);

  if (!dialogOpen) process.exit(1);

  // Let async data settle so we observe a stable tree.
  await new Promise((r) => setTimeout(r, 2000));

  // Instrumentation.
  await evaluate(ws, `(() => {
    window.__log = [];
    window.__replaced = false;
    const find = () => [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    window.__ref = find();

    ['mousedown', 'mouseup', 'click', 'focus', 'blur'].forEach((type) => {
      document.addEventListener(type, (e) => {
        window.__log.push(type + '→' + e.target.tagName +
          (e.target === window.__ref ? '(INPUT)' : ''));
      }, true);
    });

    new MutationObserver(() => {
      const now = find();
      if (now && window.__ref && now !== window.__ref) window.__replaced = true;
    }).observe(document.body, { childList: true, subtree: true });

    return true;
  })()`);

  // Real click on the name input.
  const clicked = await clickElement(ws,
    `[...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name')`);
  record("real click dispatched on name input", clicked === true);
  await new Promise((r) => setTimeout(r, 500));

  const state = await evaluate(ws, `(() => {
    const find = () => [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    const el = find();
    return {
      log: window.__log,
      replaced: window.__replaced,
      activeIsInput: document.activeElement === el,
      activeTag: document.activeElement ? document.activeElement.tagName + '|' +
        (document.activeElement.getAttribute('placeholder') || '') : 'none',
      hasFocus: document.hasFocus(),
    };
  })()`);
  console.log("state after click:", JSON.stringify(state));

  record("mouse events reached the page", state.log.length > 0, JSON.stringify(state.log));
  record("input kept its DOM node (not re-created)", state.replaced === false);
  record("input focused after real click", state.activeIsInput === true, `active=${state.activeTag}`);

  // Typing.
  await cdp(ws, "Input.insertText", { text: "AymanTest" });
  await new Promise((r) => setTimeout(r, 300));
  const value = await evaluate(ws,
    `[...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name')?.value`);
  record("typing reaches the input", value === "AymanTest", `value=${JSON.stringify(value)}`);

  // Cancel via real click on the Cancel BUTTON (button usability check).
  const dialogHasCancel = await evaluate(ws,
    `[...document.querySelectorAll('.fixed.inset-0 button')].some((b) => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'Close')`);
  console.log("dialog has Cancel/Close button:", dialogHasCancel);

  const clickedCancel = await clickElement(ws,
    `[...document.querySelectorAll('.fixed.inset-0 button')].find((b) => b.innerText.trim() === 'Cancel' || b.getAttribute('aria-label') === 'Close')`);

  await new Promise((r) => setTimeout(r, 700));

  const stillOpen = await evaluate(ws,
    `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`);
  record("Cancel/Close button works with real click", clickedCancel && !stillOpen,
    `clicked=${clickedCancel} dialogStillOpen=${stillOpen}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("TEST3 CRASH:", e.message);
  process.exit(1);
});
