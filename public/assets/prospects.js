// Filters for /prospects/nhl/: search, NHL team, country, league and position. Sorting comes from the shared table script.
(() => {
  const tbl = document.getElementById("pr-tbl");
  if (!tbl) return;
  const rows = [...tbl.tBodies[0].rows];
  const q = document.getElementById("pr-q"), team = document.getElementById("pr-team"), cty = document.getElementById("pr-country"), lg = document.getElementById("pr-lg");
  const count = document.getElementById("pr-count"), chips = [...document.querySelectorAll("#pr-pos .chip")];
  let pos = "";
  const params = new URLSearchParams(location.search);
  if (params.get("team")) team.value = params.get("team").toUpperCase();
  if (params.get("country")) cty.value = params.get("country").toUpperCase();
  function apply() {
    const s = q.value.trim().toLowerCase();
    let n = 0;
    for (const r of rows) {
      const d = r.dataset;
      const show = (!s || d.q.includes(s)) && (!team.value || d.team === team.value) && (!cty.value || d.country === cty.value) && (!lg.value || d.lg === lg.value) && (!pos || d.pos === pos);
      r.hidden = !show; if (show) n++;
    }
    count.textContent = `${n.toLocaleString()} shown`;
  }
  [q, team, cty, lg].forEach((el) => el.addEventListener("input", apply));
  chips.forEach((c) => c.addEventListener("click", () => { pos = c.dataset.pos; chips.forEach((x) => x.classList.toggle("on", x === c)); apply(); }));
  apply();
})();
