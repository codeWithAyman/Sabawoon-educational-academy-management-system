/* Captures page exceptions/console errors while opening the Add Student dialog. */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const BACKEND = "http://127.0.0.1:5478";
const CDP = "http://127.0.0.1:9222";

let cdpId = 0;
const pending = new Map();
const problems = [];

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
      } else if (message.method === "Runtime.exceptionThrown") {
        const d = message.params.exceptionDetails;
        problems.push(`EXCEPTION: ${d.text} ${d.exception?.description || ""}`.slice(0, 500));
      } else if (message.method === "Runtime.consoleAPICalled") {
        if (["error", "warning"].includes(message.params.type)) {
          const text = message.params.args
            .map((a) => a.value ?? a.description ?? "")
            .join(" ")
            .slice(0, 300);
          if (text) problems.push(`console.${message.params.type}: ${text}`);
        }
      } else if (message.method === "Log.entryAdded") {
        if (["error", "warning"].includes(message.params.entry.level)) {
          problems.push(`log: ${message.params.entry.text}`.slice(0, 300));
        }
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(ws, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(ws, expression)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
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
  await cdp(ws, "Log.enable");
  await cdp(ws, "Page.enable");

  await evaluate(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: user.id, email: user.email, role: user.role,
      name: user.full_name, phone: user.phone || "",
    }))});
    location.reload();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 4000));

  await evaluate(ws, `(() => {
    history.pushState({}, '', '/app/students');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);

  const hasButton = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`);
  console.log("has Add Student button:", hasButton);

  problems.length = 0;

  // Watch for ANY overlay appearing/disappearing.
  await evaluate(ws, `(() => {
    window.__watch = [];
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.className && String(n.className).includes('fixed')) {
            window.__watch.push({ at: Date.now(), kind: 'added', cls: String(n.className).slice(0, 60) });
          }
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.className && String(n.className).includes('fixed')) {
            window.__watch.push({ at: Date.now(), kind: 'removed', cls: String(n.className).slice(0, 60) });
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__observer = observer;
    return true;
  })()`);

  // Trusted click at the button's coordinates (exactly like a real user).
  const coords = await evaluate(ws, `(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Add Student'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: btn.disabled };
  })()`);
  console.log("button coords:", JSON.stringify(coords));

  if (coords) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await cdp(ws, "Input.dispatchMouseEvent", {
        type, x: coords.x, y: coords.y, button: "left", clickCount: 1,
      });
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  console.log("watch log:", JSON.stringify(await evaluate(ws, `window.__watch || []`)));

  const state = await evaluate(ws, `(() => ({
    overlays: document.querySelectorAll('.fixed.inset-0').length,
    inputs: [...document.querySelectorAll('input')].map((e) => e.placeholder),
    bodyHasCreate: document.body.innerText.includes('Create Class Time Slot') || document.body.innerText.includes('Add Student') ,
  }))()`);
  console.log("state:", JSON.stringify(state));
  console.log("problems:", JSON.stringify(problems, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error("PROBE CRASH:", e.message, JSON.stringify(problems.slice(0, 5)));
  process.exit(1);
});
