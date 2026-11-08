// World Juniors "build your own lineup": tap-to-place (mobile) + drag and drop (desktop),
// saved on this device, shareable as a link or a PNG.
(() => {
  const root = document.getElementById("builder");
  const dataEl = document.getElementById("page-data");
  if (!root || !dataEl) return;
  const { team, projection, pool } = JSON.parse(dataEl.textContent);
  const P = pool;
  const KEY = `wjc-lineup-${team.code}`;
  const SHAPE = { F: [4, 3], D: [3, 2], G: [1, 2] };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const short = (p) => (p ? `${p.first?.[0] ?? ""}. ${p.last}` : "");

  const blank = () => ({ F: Array.from({ length: 4 }, () => [null, null, null]), D: Array.from({ length: 3 }, () => [null, null]), G: [[null, null]] });
  const fromProjection = () => {
    const l = blank();
    projection.lines.forEach((ids, i) => ids.forEach((id, j) => { if (l.F[i]) l.F[i][j] = id; }));
    projection.pairs.forEach((ids, i) => ids.forEach((id, j) => { if (l.D[i]) l.D[i][j] = id; }));
    projection.goalies.slice(0, 2).forEach((id, j) => (l.G[0][j] = id));
    return l;
  };
  const valid = (id) => id != null && P[id] ? id : null;
  const encode = (l) => ["F", "D", "G"].map((k) => l[k].map((row) => row.map((id) => (id == null ? "_" : encodeURIComponent(id))).join(".")).join("~")).join("|");
  const decode = (s) => {
    try {
      const l = blank();
      s.split("|").forEach((part, ki) => {
        const k = ["F", "D", "G"][ki];
        part.split("~").forEach((row, i) => row.split(".").forEach((v, j) => {
          if (l[k][i] && j < l[k][i].length) { const id = v === "_" ? null : decodeURIComponent(v); l[k][i][j] = valid(/^\d+$/.test(id) ? Number(id) : id); }
        }));
      });
      return l;
    } catch { return null; }
  };
  const fromHash = () => { const m = location.hash.match(/l=([^&]+)/); return m ? decode(m[1]) : null; };
  let lineup = fromHash() ?? (window.LC?.store.get(KEY) && decode(window.LC.store.get(KEY))) ?? fromProjection();
  let selected = null; // { id } from pool or { k, i, j } from a slot

  const used = () => new Set(["F", "D", "G"].flatMap((k) => lineup[k].flat()).filter((x) => x != null));
  const save = () => window.LC?.store.set(KEY, encode(lineup));
  const posOk = (k, id) => {
    const p = P[id]; if (!p) return false;
    return k === "G" ? p.pos === "G" : k === "D" ? p.pos === "D" : !["D", "G"].includes(p.pos);
  };

  function place(id, k, i, j) {
    if (!posOk(k, id)) { flash(`${short(P[id])} is a ${P[id].pos === "G" ? "goalie" : P[id].pos === "D" ? "defenceman" : "forward"}`); return; }
    // If already placed elsewhere, swap.
    for (const kk of ["F", "D", "G"]) lineup[kk].forEach((row, ii) => row.forEach((x, jj) => { if (x === id) lineup[kk][ii][jj] = lineup[k][i][j]; }));
    lineup[k][i][j] = id;
    selected = null; save(); render();
  }

  let flashT;
  function flash(msg) {
    const el = root.querySelector(".b-msg"); if (!el) return;
    el.textContent = msg; clearTimeout(flashT); flashT = setTimeout(() => (el.textContent = ""), 2500);
  }

  function slotHtml(k, i, j) {
    const id = lineup[k][i][j], p = P[id];
    const isSel = selected && selected.k === k && selected.i === i && selected.j === j;
    return `<div class="b-slot${p ? " filled" : ""}${isSel ? " target" : ""}" data-k="${k}" data-i="${i}" data-j="${j}" ${p ? `draggable="true" data-id="${esc(id)}"` : ""}>
      ${p ? `<b>${esc(short(p))}</b><small>${esc(p.club?.league ?? p.pos)}</small>` : `<small>${k === "G" ? (j ? "Backup" : "Starter") : k === "D" ? "D" : ["LW", "C", "RW"][j]}</small>`}</div>`;
  }

  function render() {
    const u = used();
    const filter = (root.querySelector(".b-pool input")?.value ?? "").toLowerCase();
    const list = Object.values(P).sort((a, b) => (a.pos === "G") - (b.pos === "G") || (a.pos === "D") - (b.pos === "D") || b.score - a.score)
      .filter((p) => !filter || `${p.first} ${p.last} ${p.pos}`.toLowerCase().includes(filter));
    root.innerHTML = `
      <div>
        <div class="b-slots">
          ${lineup.F.map((row, i) => `<div class="b-row"><span class="slot">L${i + 1}</span>${row.map((_, j) => slotHtml("F", i, j)).join("")}</div>`).join("")}
          ${lineup.D.map((row, i) => `<div class="b-row pair"><span class="slot">D${i + 1}</span>${row.map((_, j) => slotHtml("D", i, j)).join("")}</div>`).join("")}
          <div class="b-row pair"><span class="slot">G</span>${slotHtml("G", 0, 0)}${slotHtml("G", 0, 1)}</div>
        </div>
        <div class="b-actions">
          <button class="btn" data-act="share">Share link</button>
          <button class="btn ghost" data-act="png">Save image</button>
          <button class="btn ghost" data-act="reset">Reset to projection</button>
          <button class="btn ghost" data-act="clear">Clear</button>
        </div>
        <p class="b-msg muted small" aria-live="polite"></p>
      </div>
      <div class="b-pool">
        <input type="search" placeholder="Filter ${Object.keys(P).length} players" value="${esc(filter)}" aria-label="Filter players">
        ${list.map((p) => `<div class="b-p${u.has(p.id) ? " used" : ""}${selected?.id === p.id ? " sel" : ""}" draggable="true" data-id="${esc(p.id)}"><span>${esc(p.first)} ${esc(p.last)}</span><span class="muted">${esc(p.pos)}${p.inNhl ? " · NHL" : ""}</span></div>`).join("") || `<p class="empty" style="padding:10px">No players.</p>`}
      </div>`;
    const inp = root.querySelector(".b-pool input");
    inp.addEventListener("input", () => { const pos = inp.selectionStart; render(); const n = root.querySelector(".b-pool input"); n.focus(); n.setSelectionRange(pos, pos); });
  }

  const idOf = (v) => (/^\d+$/.test(v) ? Number(v) : v);
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act) return actions[act]();
    const pp = e.target.closest(".b-p");
    if (pp) { const id = idOf(pp.dataset.id); selected = selected?.id === id ? null : { id }; render(); if (selected) flash(`Now tap a slot for ${short(P[id])}`); return; }
    const slot = e.target.closest(".b-slot");
    if (!slot) return;
    const k = slot.dataset.k, i = +slot.dataset.i, j = +slot.dataset.j;
    if (selected?.id != null) return place(selected.id, k, i, j);
    if (selected?.k) {
      const from = lineup[selected.k][selected.i][selected.j];
      if (from != null && selected.k === k) { lineup[k][selected.i][selected.j] = lineup[k][i][j]; lineup[k][i][j] = from; save(); }
      selected = null; return render();
    }
    if (lineup[k][i][j] != null) { selected = { k, i, j }; render(); flash("Tap another slot to swap, or tap the same slot to cancel"); }
  });
  root.addEventListener("dblclick", (e) => {
    const slot = e.target.closest(".b-slot.filled");
    if (slot) { lineup[slot.dataset.k][+slot.dataset.i][+slot.dataset.j] = null; selected = null; save(); render(); }
  });
  root.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-id]"); if (!el) return;
    e.dataTransfer.setData("text/plain", el.dataset.id);
  });
  root.addEventListener("dragover", (e) => { if (e.target.closest(".b-slot")) e.preventDefault(); });
  root.addEventListener("drop", (e) => {
    const slot = e.target.closest(".b-slot"); if (!slot) return;
    e.preventDefault();
    place(idOf(e.dataTransfer.getData("text/plain")), slot.dataset.k, +slot.dataset.i, +slot.dataset.j);
  });

  const actions = {
    reset() { lineup = fromProjection(); save(); history.replaceState(null, "", location.pathname + "#build"); render(); flash("Reset to our projection"); },
    clear() { lineup = blank(); save(); render(); },
    async share() {
      const url = `${location.origin}${location.pathname}#l=${encode(lineup)}`;
      history.replaceState(null, "", url);
      try {
        if (navigator.share) await navigator.share({ title: `My ${team.name} World Juniors lineup`, url });
        else { await navigator.clipboard.writeText(url); flash("Link copied"); }
      } catch { flash("Link is in the address bar"); }
    },
    png() {
      const W = 1200, H = 675, c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#0a1a33"); grad.addColorStop(1, "#0a5bd3");
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff"; g.font = "800 44px Inter, sans-serif"; g.fillText(`My ${team.name} lineup`, 60, 90);
      g.font = "600 22px Inter, sans-serif"; g.fillStyle = "rgba(255,255,255,.75)"; g.fillText("World Juniors 2027 · Edmonton & Red Deer", 60, 128);
      const cell = (x, y, w, text) => {
        g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, 46, 10) : g.rect(x, y, w, 46); g.fill();
        g.fillStyle = "#fff"; g.font = "600 21px Inter, sans-serif"; g.fillText(text || "—", x + 14, y + 30, w - 24);
      };
      let y = 170;
      lineup.F.forEach((row, i) => { g.fillStyle = "rgba(255,255,255,.6)"; g.font = "700 18px Inter, sans-serif"; g.fillText(`L${i + 1}`, 60, y + 30); row.forEach((id, j) => cell(110 + j * 250, y, 236, short(P[id]))); y += 58; });
      y = 170;
      lineup.D.forEach((row, i) => { g.fillStyle = "rgba(255,255,255,.6)"; g.font = "700 18px Inter, sans-serif"; g.fillText(`D${i + 1}`, 880 - 50, y + 30); row.forEach((id, j) => cell(880 + j * 150 - 0, y, 140, P[id]?.last ?? "")); y += 58; });
      g.fillStyle = "rgba(255,255,255,.6)"; g.font = "700 18px Inter, sans-serif"; g.fillText("G", 840, y + 30); cell(880, y, 290, short(P[lineup.G[0][0]]));
      g.fillStyle = "rgba(255,255,255,.7)"; g.font = "600 20px Inter, sans-serif"; g.fillText(`Build yours: ${location.host}${location.pathname}`, 60, H - 40);
      const a = document.createElement("a");
      a.download = `${team.code.toLowerCase()}-wjc-lineup.png`; a.href = c.toDataURL("image/png"); a.click();
      flash("Image saved");
    },
  };

  render();
})();
