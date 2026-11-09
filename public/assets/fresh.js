// Keeps every page current without the visitor doing anything. The site is rebuilt every few minutes; each page notices
// the newer build and reloads itself, unless you're typing, searching or just scrolled (then it offers a one-tap refresh).
(() => {
  if (location.pathname.startsWith("/game/")) return; // game pages refresh themselves, live
  const built = Date.parse(document.querySelector(".foot time[datetime]")?.getAttribute("datetime") ?? "");
  if (!built) return;
  let touched = Date.now(), asked = false;
  for (const e of ["pointerdown", "keydown", "scroll", "input", "wheel"]) addEventListener(e, () => (touched = Date.now()), { passive: true });
  function toast() {
    if (asked) return; asked = true;
    const b = document.createElement("button");
    b.className = "fresh-toast"; b.type = "button"; b.textContent = "New data available · Refresh";
    b.addEventListener("click", () => location.reload());
    document.body.append(b);
  }
  function apply() {
    const a = document.activeElement, busy = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName), search = document.getElementById("palette") && !document.getElementById("palette").hidden;
    if (!busy && !search && Date.now() - touched > 8000) location.reload(); else toast();
  }
  async function check() {
    if (document.hidden) return;
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const v = Date.parse((await r.json()).builtAt);
      if (v > built + 1000) apply();
    } catch {}
  }
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
})();
