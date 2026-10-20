/* Diagnose §9: why does the click not focus the input? */
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
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const { resolve: res, reject: rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
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
async function ev(ws, expression) {
  const r = await cdp(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const login = await (await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  })).json();
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = await connect(page.webSocketDebuggerUrl);
  await cdp(ws, "Runtime.enable");
  await cdp(ws, "Page.enable");

  console.log("state before:", JSON.stringify(await ev(ws, `({
    vis: document.visibilityState, hasFocus: document.hasFocus(),
    path: location.pathname, title: document.title,
    active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null })`)));

  // Bring the page to front first — clicks on a background window don't move focus.
  await cdp(ws, "Page.bringToFront");
  await sleep(400);
  console.log("after bringToFront:", JSON.stringify(await ev(ws, `({ vis: document.visibilityState, hasFocus: document.hasFocus() })`)));

  // Ensure dialog open.
  let open = await ev(ws, `!!document.querySelector('input[placeholder="Enter full name"]')`);
  if (!open) {
    await ev(ws, `history.pushState({}, '', '/app/students'); window.dispatchEvent(new PopStateEvent('popstate')); true`);
    await sleep(1500);
    await ev(ws, `[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Add Student'))?.click(); true`);
    for (let i = 0; i < 30; i++) { open = await ev(ws, `!!document.querySelector('input[placeholder="Enter full name"]')`); if (open) break; await sleep(200); }
  }
  if (!open) { console.log("dialog not open"); process.exit(1); }
  await sleep(300);

  // Hit test + rect + event trace at click coords.
  const info = await ev(ws, `(() => {
    const inp = document.querySelector('input[placeholder="Enter full name"]');
    inp.scrollIntoView({ block: 'center' });
    const r = inp.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    window.__trace = [];
    for (const type of ['pointerdown','mousedown','pointerup','mouseup','click','focus','blur']) {
      inp.addEventListener(type, () => window.__trace.push(type), { once: true, capture: true });
    }
    document.addEventListener('mousedown', (e) => window.__trace.push('DOC-md target=' + (e.target.tagName + (e.target.placeholder ? ':' + e.target.placeholder : ''))), true);
    return { rect: { x: r.left, y: r.top, w: r.width, h: r.height }, cx: x, cy: y,
      hitTag: hit && hit.tagName, hitPh: hit && hit.placeholder, hitIsInput: hit === inp };
  })()`);
  console.log("geometry/hit:", JSON.stringify(info));

  // Real click.
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", { type, x: info.cx, y: info.cy, button: "left", clickCount: 1 });
    await sleep(50);
  }
  await sleep(250);
  const after = await ev(ws, `({
    trace: window.__trace,
    active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
    isInput: document.activeElement === document.querySelector('input[placeholder="Enter full name"]'),
    hasFocus: document.hasFocus(), vis: document.visibilityState })`);
  console.log("after click:", JSON.stringify(after));

  // Can the input focus AT ALL via JS?
  const jsFocus = await ev(ws, `(() => { const i = document.querySelector('input[placeholder="Enter full name"]'); i.focus(); return document.activeElement === i; })()`);
  console.log("js focus() works:", jsFocus);

  await ws.close();
  process.exit(0);
}
main().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
