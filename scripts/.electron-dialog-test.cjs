/*
  Tests the reported Electron dialog problem in the REAL Electron app:
  dialog inputs must accept clicks, focus and keyboard input.

  Requires: backend on :5478 and Electron started with
  --remote-debugging-port=9222 (loading the backend-served frontend).
  Credentials come from the environment, never printed.
*/
const fs = require("fs");
const path = require("path");

const BACKEND = "http://127.0.0.1:5478";
const CDP = "http://127.0.0.1:9222";

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env"),
});

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login() {
  const response = await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`login failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  return { token: data.token, user: data.user };
}

let cdpId = 0;
const pending = new Map();

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => resolve(ws);
    ws.onerror = (error) => reject(new Error(`ws error: ${error.message || error}`));

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
    throw new Error(result.exceptionDetails.text || "evaluate failed");
  }

  return result.result?.value;
}

async function waitFor(ws, expression, timeoutMs = 20000, everyMs = 400) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await evaluate(ws, expression)) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }

  return false;
}

async function realClick(ws, selector) {
  const point = await evaluate(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  if (!point) return false;

  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  }

  return true;
}

async function typeText(ws, text) {
  for (const char of text) {
    await cdp(ws, "Input.insertText", { text: char });
  }
}

async function hitTest(ws, selector) {
  return evaluate(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const chain = [];
    let node = hit;
    while (node && chain.length < 5) {
      chain.push(node.tagName + (node.className && typeof node.className === 'string' ? '.' + node.className.split(' ').slice(0,3).join('.') : ''));
      node = node.parentElement;
    }
    return {
      found: true,
      hitIsSelfOrChild: hit === el || el.contains(hit),
      hitTag: hit ? hit.tagName : null,
      chain,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      pointerEvents: getComputedStyle(el).pointerEvents,
      elDisabled: el.disabled === true,
    };
  })()`);
}

async function main() {
  const { token, user } = await login();

  const targetList = await (await fetch(`${CDP}/json/list`)).json();

  const page = targetList.find((t) => t.type === "page" && /^http:\/\/127\.0\.0\.1:5478/.test(t.url))
    || targetList.find((t) => t.type === "page");

  if (!page) throw new Error("no Electron page target found");

  const ws = await connect(page.webSocketDebuggerUrl);

  await cdp(ws, "Page.enable");
  await cdp(ws, "Runtime.enable");

  const isElectron = await evaluate(ws, "navigator.userAgent.includes('Electron')");
  record("running inside Electron", isElectron === true, await evaluate(ws, "navigator.userAgent"));

  // Seed the session and open the Students page.
  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name,
      phone: user.phone || "",
    }))});
    location.hash = '';
    location.reload();
    return true;
  })()`);

  // Let the app reboot with the seeded session.
  await new Promise((r) => setTimeout(r, 3500));

  // SPA navigation: Electron's will-navigate guard blocks full loads of
  // inner routes, so move through React Router instead.
  await evaluate(ws, `(() => {
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);
  await waitFor(ws, `!!document.querySelector('button') && [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`, 25000);

  /* ---------------- Add Student dialog ---------------- */

  const opened = await evaluate(ws, `(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => b.innerText.trim() === 'Add Student');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);

  record("Add Student dialog opened", opened === true);

  await waitFor(ws, `!!document.querySelector('input')`, 8000);

  const inputs = await evaluate(ws, `[...document.querySelectorAll('input')].map((el, i) => ({
    i, type: el.type, id: el.id, name: el.name, placeholder: el.placeholder,
    disabled: el.disabled, readOnly: el.readOnly,
  }))`);

  console.log("dialog inputs:", JSON.stringify(inputs));

  // The student-name field: first enabled text-ish input inside the dialog.
  const nameSelector = await evaluate(ws, `(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], .fixed.inset-0')];
    const scope = dialogs[dialogs.length - 1] || document;
    const el = [...scope.querySelectorAll('input')].find((e) =>
      !e.disabled && !e.readOnly && ['text',''].includes(e.type));
    if (!el) return null;
    if (!el.id) el.setAttribute('data-dialog-test', 'name-input');
    return el.id ? '#' + el.id : '[data-dialog-test="name-input"]';
  })()`);

  record("found a name input in the dialog", Boolean(nameSelector), nameSelector || "none");

  if (nameSelector) {
    const hit = await hitTest(ws, nameSelector);
    console.log("hit test:", JSON.stringify(hit));
    record("click reaches the input (hit test)", hit?.hitIsSelfOrChild === true,
      `hit=${hit?.hitTag} pointer-events=${hit?.pointerEvents}`);

    await realClick(ws, nameSelector);

    const focused = await evaluate(ws, `document.activeElement === document.querySelector(${JSON.stringify(nameSelector)})`);
    record("input accepts focus (real mouse click)", focused === true);

    await typeText(ws, "DialogTest");
    const value = await evaluate(ws, `document.querySelector(${JSON.stringify(nameSelector)})?.value`);
    record("input accepts keyboard typing", value === "DialogTest", `value=${JSON.stringify(value)}`);

    // Escape/close the dialog without saving (never writes a test student).
    await evaluate(ws, `(() => {
      const btns = [...document.querySelectorAll('button')];
      const close = btns.find((b) => b.querySelector('svg.lucide-x') || b.getAttribute('aria-label') === 'Close');
      if (close) close.click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await evaluate(ws, `(() => {
      const shell = [...document.querySelectorAll('.fixed.inset-0')].pop();
      if (shell) shell.remove();
      return true;
    })()`);
  }

  /* ---------------- Password confirmation dialog ---------------- */

  // Students page uses the password confirmation modal when deleting a
  // student. We open it and cancel — nothing is deleted.
  await waitFor(ws, `document.body.innerText.length > 100`, 8000);

  const openDelete = await evaluate(ws, `(() => {
    const rows = [...document.querySelectorAll('button')].filter((b) =>
      (b.getAttribute('title') || '').toLowerCase().includes('delete'));
    if (!rows.length) return false;
    rows[0].click();
    return true;
  })()`);

  console.log("delete button clicked:", openDelete);

  await new Promise((r) => setTimeout(r, 900));

  const pwVisible = await evaluate(ws, `(() => {
    const inputs = [...document.querySelectorAll('input')].filter((e) => e.type === 'password');
    return inputs.length > 0;
  })()`);

  console.log("password input visible after delete click:", pwVisible);

  if (pwVisible) {
    const pwSelector = 'input[type="password"]';
    const hit = await hitTest(ws, pwSelector);
    console.log("pw hit test:", JSON.stringify(hit));
    record("click reaches the password field (hit test)", hit?.hitIsSelfOrChild === true,
      `hit=${hit?.hitTag} pointer-events=${hit?.pointerEvents}`);

    await realClick(ws, pwSelector);
    const focused = await evaluate(ws, `document.activeElement?.type === 'password'`);
    record("password field accepts focus", focused === true);

    await typeText(ws, "irrelevant");
    const value = await evaluate(ws, `document.querySelector('input[type="password"]')?.value`);
    record("password field accepts typing", value === "irrelevant", `len=${(value || "").length}`);

    // Cancel — never submit.
    await evaluate(ws, `(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Cancel');
      if (btn) btn.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    await evaluate(ws, `[...document.querySelectorAll('.fixed.inset-0')].forEach((el) => el.remove()); true`);
  } else {
    record("password dialog opened for inspection", false, "could not trigger it on this page");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("DIALOG TEST CRASH:", error.message);
  process.exit(1);
});
