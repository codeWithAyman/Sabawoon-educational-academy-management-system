/* temp CDP probe: dump page state. No regex literals (they mangle through the template). Delete after use. */
const http = require("http");

const expression = [
  "JSON.stringify({",
  "  path: location.pathname,",
  "  titled: [...document.querySelectorAll('button')].map((b) => ({ t: b.title, txt: (b.innerText || '').trim().slice(0, 25) })).filter((x) => x.t),",
  "  tableRows: document.querySelectorAll('table tbody tr').length,",
  "  rowTexts: [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.split(String.fromCharCode(10)).join(' | ').slice(0, 200)),",
  "  rowButtons: [...document.querySelectorAll('table tbody tr button')].map((b) => ({ t: b.title, txt: (b.innerText || '').trim().slice(0, 20) })),",
  "  bodyHead: document.body.innerText.slice(0, 200)",
  "})",
].join("\n");

http.get("http://127.0.0.1:9222/json/list", (r) => {
  let b = "";
  r.on("data", (d) => (b += d));
  r.on("end", () => {
    const page = JSON.parse(b).find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { returnByValue: true, expression } }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        console.log(m.result?.result?.value || JSON.stringify(m));
        process.exit(0);
      }
    };
  });
});

setTimeout(() => process.exit(1), 8000);
