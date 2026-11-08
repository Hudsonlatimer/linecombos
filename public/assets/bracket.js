// Stanley Cup bracket builder: projected matchups, model odds for every series, tap to advance.
(() => {
  const root = document.getElementById("bracket");
  const dataEl = document.getElementById("page-data");
  if (!root || !dataEl) return;
  const { bracket, R, home, teams } = JSON.parse(dataEl.textContent);
  const KEY = "cup-bracket";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- model: same maths as the simulator ----
  const pmf = (l) => { const out = [Math.exp(-l)]; for (let k = 1; k < 16; k++) out.push((out[k - 1] * l) / k); return out; };
  const gameP = (h, a) => { // P(home team wins a playoff game)
    const lh = R.lg * R.teams[h].att * R.teams[a].def * home, la = (R.lg * R.teams[a].att * R.teams[h].def) / home;
    const ph = pmf(lh), pa = pmf(la);
    let win = 0, tie = 0;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const p = ph[i] * pa[j]; if (i > j) win += p; else if (i === j) tie += p; }
    return win + tie * (0.5 + 0.5 * (lh / (lh + la) - 0.5));
  };
  const memo = {};
  const seriesP = (hi, lo) => { // P(hi wins), hi has home ice (games 1, 2, 5, 7)
    const k = hi + lo; if (k in memo) return memo[k];
    const pH = gameP(hi, lo), pA = 1 - gameP(lo, hi), homeG = [1, 1, 0, 0, 1, 0, 1];
    const f = (w, l, g) => (w === 4 ? 1 : l === 4 ? 0 : (homeG[g] ? pH : pA) * f(w + 1, l, g + 1) + (1 - (homeG[g] ? pH : pA)) * f(w, l + 1, g + 1));
    return (memo[k] = f(0, 0, 0));
  };
  const order = (a, b) => (teams[a].pts >= teams[b].pts ? [a, b] : [b, a]);
  const winP = (a, b) => { const [hi, lo] = order(a, b); const p = seriesP(hi, lo); return a === hi ? p : 1 - p; };

  // ---- bracket structure ----
  const confs = Object.keys(bracket);
  const slots = {}; // slot id -> [teamA, teamB] (null until decided)
  let picks = {}; // slot id -> winner
  try { picks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const fromHash = location.hash.match(/b=([A-Z,:0-9]+)/);
  if (fromHash) picks = Object.fromEntries(fromHash[1].split(",").map((x) => x.split(":")));

  function resolve() {
    for (const k of Object.keys(slots)) delete slots[k];
    const w = (id) => (slots[id] && slots[id].includes(picks[id]) ? picks[id] : null);
    const finals = [];
    confs.forEach((c, ci) => {
      const sides = bracket[c].map((d, di) => {
        slots[`${ci}${di}a`] = [d.d1, d.wc];
        slots[`${ci}${di}b`] = [d.d2, d.d3];
        slots[`${ci}${di}r2`] = [w(`${ci}${di}a`), w(`${ci}${di}b`)];
        return w(`${ci}${di}r2`);
      });
      slots[`${ci}cf`] = sides;
      finals.push(w(`${ci}cf`));
    });
    slots.final = finals;
    for (const k of Object.keys(picks)) if (!slots[k] || !slots[k].includes(picks[k])) delete picks[k];
  }

  const team = (id, a, b, slot) => {
    if (!id) return `<div class="bt empty">TBD</div>`;
    const t = teams[id], other = id === a ? b : a;
    const p = other ? winP(id, other) : null;
    const on = picks[slot] === id, off = picks[slot] && picks[slot] !== id;
    return `<button class="bt${on ? " win" : ""}${off ? " out" : ""}" data-slot="${slot}" data-team="${id}"><img src="${esc(t.logo)}" data-dark="${esc(t.dark)}" alt="" width="20" height="20"><span>${esc(t.name)}</span>${p != null ? `<em>${Math.round(p * 100)}%</em>` : ""}</button>`;
  };
  const series = (slot, label) => { const [a, b] = slots[slot]; return `<div class="bs"><small>${label}</small>${team(a, a, b, slot)}${team(b, a, b, slot)}</div>`; };

  function render() {
    resolve();
    const champ = picks.final;
    root.innerHTML = `
      ${confs.map((c, ci) => `<div class="b-conf"><h3>${esc(c)}</h3><div class="b-rounds">
        <div class="b-col"><span class="b-rl">First round</span>${bracket[c].map((d, di) => series(`${ci}${di}a`, `${d.div} 1 v WC`) + series(`${ci}${di}b`, `${d.div} 2 v 3`)).join("")}</div>
        <div class="b-col"><span class="b-rl">Second round</span>${bracket[c].map((d, di) => series(`${ci}${di}r2`, `${d.div} final`)).join("")}</div>
        <div class="b-col"><span class="b-rl">Conference final</span>${series(`${ci}cf`, c)}</div>
      </div></div>`).join("")}
      <div class="b-final"><span class="b-rl">Stanley Cup Final</span>${series("final", "Final")}
        <div class="b-champ">${champ ? `<img src="${esc(teams[champ].logo)}" data-dark="${esc(teams[champ].dark)}" alt="" width="44" height="44"><b>${esc(teams[champ].name)}</b><span>your Stanley Cup champion</span>` : `<span class="muted">Pick every series to crown a champion.</span>`}</div>
      </div>
      <div class="b-actions"><button class="btn" data-act="fav">Fill with favourites</button><button class="btn ghost" data-act="sim">Simulate</button><button class="btn ghost" data-act="share">Share bracket</button><button class="btn ghost" data-act="reset">Reset</button></div>
      <p class="b-msg muted small" aria-live="polite"></p>`;
    try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch {}
    window.LC?.swapLogos?.();
  }

  const fill = (chooser) => {
    for (let pass = 0; pass < 5; pass++) { resolve(); for (const [k, [a, b]] of Object.entries(slots)) if (a && b && !picks[k]) picks[k] = chooser(a, b); }
    render();
  };
  root.addEventListener("click", async (e) => {
    const b = e.target.closest(".bt[data-team]");
    if (b) { picks[b.dataset.slot] = b.dataset.team; return render(); }
    const act = e.target.closest("[data-act]")?.dataset.act;
    const msg = (m) => { const el = root.querySelector(".b-msg"); if (el) el.textContent = m; };
    if (act === "fav") { picks = {}; fill((a, c) => (winP(a, c) >= 0.5 ? a : c)); }
    if (act === "sim") { picks = {}; fill((a, c) => (Math.random() < winP(a, c) ? a : c)); msg("One possible playoffs, drawn from the model's odds."); }
    if (act === "reset") { picks = {}; history.replaceState(null, "", location.pathname + "#build"); render(); }
    if (act === "share") {
      const url = `${location.origin}${location.pathname}#b=${Object.entries(picks).map(([k, v]) => `${k}:${v}`).join(",")}`;
      history.replaceState(null, "", url);
      try { if (navigator.share) await navigator.share({ title: "My Stanley Cup bracket", url }); else { await navigator.clipboard.writeText(url); msg("Link copied"); } } catch { msg("Link is in the address bar"); }
    }
  });
  render();
})();
