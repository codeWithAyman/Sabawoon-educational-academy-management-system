/* Correct GitHub release-asset upload: non-zero Content-Length on the
   start call, chunked PATCH body with retries, then finalize. */
const fs = require("fs");
const { execSync } = require("child_process");

const REPO = "codeWithAyman/Sabawoon-educational-academy-management-system";
const TAG = "v1.0.1";
const FILE = "release/Sabawoon Educational Academy Setup 1.0.1.exe";
const NAME = "Sabawoon Educational Academy Setup 1.0.1.exe";
const CHUNK = 4 * 1024 * 1024; // 4MB

const token = execSync("gh auth token", { encoding: "utf8" }).trim();
const total = fs.statSync(FILE).size;

function api(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
}

async function main() {
  const rel = await api(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`);
  const release = await rel.json();
  if (!release.upload_url) {
    console.error("release not found:", release.message);
    process.exit(1);
  }

  for (const a of release.assets || []) {
    if (a.name === NAME) {
      await api(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE" });
      console.log("deleted stale asset", a.id);
    }
  }

  const base = release.upload_url.replace(/\{.*$/, "");

  // START: must send a NON-ZERO Content-Length matching the total file size.
  let sdata = null;
  for (let attempt = 1; attempt <= 6 && !sdata?.id; attempt++) {
    const r = await api(`${base}?name=${encodeURIComponent(NAME)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(total),
      },
    });
    sdata = await r.json().catch(() => ({}));
    if (!sdata.id) {
      console.log(`  start attempt ${attempt} -> ${r.status} ${JSON.stringify(sdata).slice(0, 200)}`);
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
  if (!sdata?.id) {
    console.error("could not start upload after retries");
    process.exit(1);
  }
  const uploadId = sdata.id;
  console.log("upload session:", uploadId, "total bytes:", total);

  let uploaded = 0;
  const fd = fs.openSync(FILE, "r");
  const buf = Buffer.alloc(CHUNK);

  while (uploaded < total) {
    const { bytesRead } = fs.readSync(fd, buf, 0, CHUNK, uploaded);
    const chunk = Buffer.from(buf.subarray(0, bytesRead));
    const startB = uploaded;
    const endB = uploaded + bytesRead - 1;
    let ok = false;
    for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
      const r = await api(`${base}?name=${encodeURIComponent(NAME)}&upload_id=${uploadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytesRead),
          "Content-Range": `bytes ${startB}-${endB}/${total}`,
        },
        body: chunk,
      });
      if (r.status === 200 || r.status === 201) {
        ok = true;
      } else {
        const txt = await r.text();
        console.log(`  chunk ${startB}-${endB} attempt ${attempt} -> ${r.status} ${txt.slice(0, 120)}`);
        await new Promise((res) => setTimeout(res, 2500 * attempt));
      }
    }
    if (!ok) {
      console.error("chunk failed after retries:", startB, endB);
      process.exit(1);
    }
    uploaded += bytesRead;
    console.log(`uploaded ${((uploaded / total) * 100).toFixed(0)}%`);
  }
  fs.closeSync(fd);

  // FINALIZE
  const fin = await api(`${base}?name=${encodeURIComponent(NAME)}&upload_id=${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Content-Length": "0" },
  });
  const fdata = await fin.json().catch(() => ({}));
  console.log("UPLOAD COMPLETE — finalized:", fin.status, fdata.state || fdata.name || "");
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
