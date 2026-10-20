/*
  Diagnoses WHY a real mouse click does not focus a dialog input in the
  Electron app: records the event sequence, defaultPrevented flags, focus
  theft and programmatic-focus behavior.
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
      type, x: point.x, y: point.y, button: "left", clickCount: 1,
    });
  }
  return true;
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

  await evaluate(ws, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Add Student'));
    b.click();
    return true;
  })()`);

  await waitFor(ws, `[...document.querySelectorAll('input')].some((e) => e.placeholder === 'Enter full name')`);

  // Instrument: capture-phase listeners + defaultPrevented + focus trail.
  await evaluate(ws, `(() => {
    window.__diag = { events: [], focusLog: [], stolen: [] };

    const target = [...document.querySelectorAll('input')].find((e) => e.placeholder === 'Enter full name');
    if (!target) return 'no-input';
    target.setAttribute('data-diag', '1');

    const describe = (e) => ({
      type: e.type,
      target: e.target.tagName + '.' + String(e.target.className || '').split(' ').slice(0, 2).join('.'),
      defaultPrevented: e.defaultPrevented,
      detail: e.detail,
      timeStamp: Math.round(e.timeStamp),
    });

    ['mousedown', 'mouseup', 'click', 'focus', 'blur'].forEach((type) => {
      target.addEventListener(type, (e) => {
        window.__diag.events.push(describe(e));
        if (type === 'blur') {
          window.__diag.stolen.push({
            to: document.activeElement
              ? document.activeElement.tagName + '.' + String(document.activeElement.className || '').slice(0, 60)
              : 'null',
          });
        }
      }, true);
    });

    // Document-level capture: who preventDefaults mousedown?
    document.addEventListener('mousedown', (e) => {
      const record = describe(e);
      record.onDoc = true;
      // detect propagation end state
      queueMicrotask(() => {
        record.preventedBySomething = e.defaultPrevented;
        window.__diag.events.push(record);
      });
    }, true);

    // window-level capture (first in chain)
    window.addEventListener('mousedown', (e) => {
      window.__diag.events.push({ type: 'window-mousedown-capture', willPrevent: e.defaultPrevented });
    }, true);

    return 'instrumented';
  })()`);

  await realClick(ws, '[data-diag="1"]');
  await new Promise((r) => setTimeout(r, 500));

  const afterClick = await evaluate(ws, `(() => ({
    active: document.activeElement
      ? document.activeElement.tagName + '|' + (document.activeElement.getAttribute('placeholder') || '') + '|' + String(document.activeElement.className).slice(0, 50)
      : 'none',
    diag: window.__diag,
    value: document.querySelector('[data-diag="1"]')?.value,
  }))()`);

  console.log("=== after real click ===");
  console.log(JSON.stringify(afterClick, null, 2));

  // Programmatic focus then typing: does the input itself work?
  await evaluate(ws, `document.querySelector('[data-diag="1"]').focus(); true`);
  const focusedNow = await evaluate(ws, `document.activeElement === document.querySelector('[data-diag="1"]')`);
  console.log("programmatic focus works:", focusedNow);

  await cdp(ws, "Input.insertText", { text: "PROGRAMMATIC" });
  const value = await evaluate(ws, `document.querySelector('[data-diag="1"]')?.value`);
  console.log("typing after programmatic focus:", JSON.stringify(value));

  // Does an immediate refocus survive? (focus theft detector)
  const stealCheck = await evaluate(ws, `(() => {
    const el = document.querySelector('[data-diag="1"]');
    el.focus();
    const immediate = document.activeElement === el;
    return new Promise((resolve) => setTimeout(() => {
      resolve({ immediate, after100ms: document.activeElement === el,
        nowActive: document.activeElement?.tagName + '.' + String(document.activeElement?.className || '').slice(0,60) });
    }, 300));
  })()`);
  console.log("focus persistence:", JSON.stringify(stealCheck));

  process.exit(0);
}

main().catch((e) => {
  console.error("DIAG CRASH:", e.message);
  process.exit(1);
});
