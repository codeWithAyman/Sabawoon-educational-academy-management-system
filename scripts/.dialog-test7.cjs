/* §9 acceptance test v2 (raw WebSocket CDP, no npm deps) — EDIT-STUDENT flow.
   The live database currently has no ACTIVE class slot, so the Add flow
   (which must demand a class) cannot reach the password step; the edit flow
   reaches the exact component under test without mutating any records.

   1) Add-Student dialog: real click focuses the name input, typing works.
   2) Edit-Student dialog: real click focuses, typing works.
   3) PasswordConfirmModal: wrong password -> inline error -> input NODE
      IDENTITY must survive (no React churn), focus must survive, typing
      must work after the error AND while the error clears.
   4) Watches for dialog unmounts, console errors, focus/visibility interference.
   No record is ever written: the correct password is never typed. */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const BACKEND = process.env.TEST_BACKEND || "http://127.0.0.1:5478";
const CDP = "http://127.0.0.1:9222";

let cdpId = 0;
const pending = new Map();
const events = [];

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
        events.push("EXCEPTION: " + (d.exception?.description || d.text || "?").slice(0, 300));
      } else if (message.method === "Runtime.consoleAPICalled") {
        const t = message.params.type;
        if (t === "error" || t === "warning") {
          events.push("CONSOLE-" + t + ": " + (message.params.args || []).map((a) => a.value || a.description || "").join(" ").slice(0, 200));
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

async function ev(ws, expression) {
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
    if (await ev(ws, expression)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function clickSel(ws, selectorExpr) {
  const coords = await ev(ws, `(() => {
    const el = ${selectorExpr};
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!coords) return false;
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp(ws, "Input.dispatchMouseEvent", {
      type, x: coords.x, y: coords.y, button: "left", clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 40));
  }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : ""));
}

async function main() {
  const login = await (await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  })).json();
  if (!login.token) { console.log("login failed", JSON.stringify(login).slice(0, 200)); process.exit(1); }

  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = await connect(page.webSocketDebuggerUrl);
  await cdp(ws, "Runtime.enable");
  await cdp(ws, "Page.enable");

  await ev(ws, `(() => {
    localStorage.setItem('hm_token', ${JSON.stringify(login.token)});
    localStorage.setItem('hm_user', ${JSON.stringify(JSON.stringify({
      id: login.user.id, email: login.user.email, role: login.user.role,
      name: login.user.full_name, phone: login.user.phone || "",
    }))});
    return true;
  })()`);
  await sleep(300);

  await ev(ws, `history.pushState({}, '', '/app/students'); window.dispatchEvent(new PopStateEvent('popstate')); true`);
  const hasAdd = await waitFor(ws, `[...document.querySelectorAll('button')].some((b) => b.innerText.includes('Add Student'))`, 20000);
  if (!hasAdd) { console.log("FAIL nav: no Add Student button"); process.exit(1); }
  await sleep(800);

  // Interference watch.
  await ev(ws, `(() => {
    window.__w = { events: [], path: location.pathname, t0: Date.now() };
    document.addEventListener('visibilitychange', () => window.__w.events.push('visibility->' + document.visibilityState + '@' + Math.round(performance.now())));
    window.addEventListener('focus', () => window.__w.events.push('windowfocus@' + Math.round(performance.now())));
    window.addEventListener('blur', () => window.__w.events.push('windowblur@' + Math.round(performance.now())));
    window.__gone = [];
    const find = () => document.querySelector('input[placeholder="Enter full name"]');
    window.__ref = find();
    new MutationObserver(() => { if (window.__ref && !find()) window.__gone.push('NAME-INPUT-GONE@' + Math.round(performance.now())); }).observe(document.body, { childList: true, subtree: true });
    return true;
  })()`);

  // ---- Phase 1: Add-Student dialog — real click focus + typing ----
  await ev(ws, `[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Add Student'))?.click(); true`);
  const nameInputUp = await waitFor(ws, `!!document.querySelector('input[placeholder="Enter full name"]')`, 8000);
  check("Add Student dialog opens", nameInputUp);
  if (!nameInputUp) process.exit(1);
  await sleep(300);

  const clicked1 = await clickSel(ws, `document.querySelector('input[placeholder="Enter full name"]')`);
  await sleep(150);
  const focused1 = await ev(ws, `document.activeElement === document.querySelector('input[placeholder="Enter full name"]')`);
  check("add dialog: name input focuses on real mouse click", clicked1 && focused1);

  await ev(ws, `(() => {
    const i = document.querySelector('input[placeholder="Enter full name"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(80);
  await cdp(ws, "Input.insertText", { text: "RaceCheck" });
  await sleep(120);
  const v1 = await ev(ws, `document.querySelector('input[placeholder="Enter full name"]')?.value`);
  check("add dialog: typing reaches name input", v1 === "RaceCheck", "value=" + JSON.stringify(v1));

  // Close the add dialog again.
  await ev(ws, `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel'); if (b) b.click(); return true; })()`);
  const addClosed = await waitFor(ws, `!document.querySelector('input[placeholder="Enter full name"]')`, 5000);
  check("add dialog closes cleanly", addClosed);
  await sleep(500);

  // ---- Phase 2: Edit-Student dialog — real click focus + typing ----
  const editBtnUp = await waitFor(ws, `!!document.querySelector('button[title="Edit student"]')`, 8000);
  check("edit button listed for admin", editBtnUp);
  await ev(ws, `document.querySelector('button[title="Edit student"]')?.click(); true`);
  const editUp = await waitFor(ws, `!!document.querySelector('input[placeholder="Enter full name"]')`, 8000);
  check("Edit Student dialog opens", editUp);
  if (!editUp) process.exit(1);
  await sleep(400);

  const clickedE = await clickSel(ws, `document.querySelector('input[placeholder="Enter full name"]')`);
  await sleep(150);
  const focusedE = await ev(ws, `document.activeElement === document.querySelector('input[placeholder="Enter full name"]')`);
  check("edit dialog: name input focuses on real mouse click", clickedE && focusedE);

  await ev(ws, `(() => {
    const i = document.querySelector('input[placeholder="Enter full name"]');
    window.__origName = i.value;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, i.value + 'X'); i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.value;
  })()`);
  await cdp(ws, "Input.insertText", { text: "Z" });
  await sleep(150);
  const vE = await ev(ws, `document.querySelector('input[placeholder="Enter full name"]')?.value`);
  check("edit dialog: typing appends in focused input", (vE || "").endsWith("XZ"), "value=" + JSON.stringify(vE));

  // Restore the untouched original name so nothing is ever saved.
  await ev(ws, `(() => {
    const i = document.querySelector('input[placeholder="Enter full name"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, window.__origName); i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.value;
  })()`);

  // Re-tag the name input watcher for the edit dialog.
  await ev(ws, `(() => {
    const find = () => document.querySelector('input[placeholder="Enter full name"]');
    window.__ref = find();
    return true;
  })()`);

  // ---- Phase 3: submit edit -> PasswordConfirmModal ----
  await ev(ws, `(() => { const f = document.querySelector('input[placeholder="Enter full name"]')?.closest('form'); if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); return !!f; })()`);
  const pwdUp = await waitFor(ws, `!!document.querySelector('#password-confirm-input')`, 8000);
  check("PasswordConfirmModal opens from Save", pwdUp);
  if (!pwdUp) {
    console.log("name-input gone events:", await ev(ws, `JSON.stringify(window.__gone)`));
    process.exit(1);
  }
  await sleep(300);

  // ---- Phase 4: tag password input, submit wrong password, watch identity ----
  await ev(ws, `(() => {
    const inp = document.querySelector('#password-confirm-input');
    window.__pwdTag = 'p' + Math.random().toString(36).slice(2);
    inp.setAttribute('data-ptag', window.__pwdTag);
    window.__pwdNode = inp;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'definitely-wrong'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(150);
  await ev(ws, `(() => { const f = document.querySelector('#password-confirm-input')?.closest('form'); if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); return !!f; })()`);

  let errAt = null;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    const st = await ev(ws, `(() => {
      const alert = document.querySelector('#password-confirm-input')?.closest('form')?.querySelector('[role="alert"]');
      return !!alert && alert.innerText.trim().length > 0;
    })()`);
    if (st) { errAt = i * 200; break; }
  }
  check("wrong password shows inline error", errAt !== null, errAt === null ? "no alert" : "after~" + errAt + "ms");
  await sleep(400);

  const afterErr = await ev(ws, `(() => {
    const inp = document.querySelector('#password-confirm-input');
    return {
      exists: !!inp,
      sameNode: inp ? inp.getAttribute('data-ptag') === window.__pwdTag : null,
      oldConnected: window.__pwdNode ? window.__pwdNode.isConnected : null,
      focused: inp ? document.activeElement === inp : null,
      active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      value: inp ? inp.value : null,
      errText: (document.querySelector('[role="alert"]')?.innerText || '').slice(0, 80),
    };
  })()`);
  console.log("after-error state:", JSON.stringify(afterErr));
  check("input node survives error appearing (no churn)", afterErr.exists && afterErr.sameNode === true && afterErr.oldConnected === true);
  check("input keeps focus while error shows", afterErr.focused === true, "active=" + afterErr.active);
  check("failed attempt clears the field by design", (afterErr.value || "") === "", "value=" + JSON.stringify(afterErr.value));

  // ---- Phase 5: real mouse click + typing AFTER the error ----
  const clicked2 = await clickSel(ws, `document.querySelector('#password-confirm-input')`);
  await sleep(150);
  const focused2 = await ev(ws, `document.activeElement === document.querySelector('#password-confirm-input')`);
  check("click focuses password input after error", clicked2 && focused2);

  await cdp(ws, "Input.insertText", { text: "abc" });
  await sleep(150);
  const v2 = await ev(ws, `document.querySelector('#password-confirm-input')?.value`);
  check("typing works after error", (v2 || "").includes("abc"), "value=" + JSON.stringify(v2));
  const errCleared = await ev(ws, `!document.querySelector('[role="alert"]')`);
  const stillFocused = await ev(ws, `document.activeElement === document.querySelector('#password-confirm-input')`);
  const sameNode2 = await ev(ws, `document.querySelector('#password-confirm-input')?.getAttribute('data-ptag') === window.__pwdTag`);
  check("input survives error clearing (typing-clears-error cycle)", sameNode2 === true && stillFocused === true, "focused=" + stillFocused + " errCleared=" + errCleared);

  // ---- Phase 6: cancel both dialogs cleanly (nothing was saved) ----
  await ev(ws, `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel'); if (b) b.click(); return true; })()`);
  const pwdClosed = await waitFor(ws, `!document.querySelector('#password-confirm-input')`, 4000);
  check("password dialog cancels", pwdClosed);
  await sleep(500);

  await ev(ws, `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel'); b && b.click(); return true; })()`);
  const shellClosed = await waitFor(ws, `!document.querySelector('input[placeholder="Enter full name"]')`, 4000);
  check("edit dialog closes", shellClosed);

  const w = await ev(ws, `JSON.stringify(window.__w)`);
  const gone = await ev(ws, `JSON.stringify(window.__gone)`);
  console.log("interference watch:", w);
  console.log("name-input gone events:", gone);
  console.log("cdp events:", JSON.stringify(events.slice(0, 8)));

  const failed = results.filter((r) => !r.ok);
  console.log("\nRESULT: " + (results.length - failed.length) + "/" + results.length + " checks passed");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
