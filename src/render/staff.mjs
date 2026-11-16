// Coaching and management card for a team page. The head coach comes from the NHL's game feed (current as of the last game),
// the GM from CapWages, and any further staff (assistants, goalie coach...) with photos from config/staff.json.
import { esc, attr } from "./html.mjs";

const initials = (n) => String(n).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const person = (name, role, photo, note = "") => `<li class="stf"><span class="stf-ph">${photo ? `<img src="${attr(photo)}" alt="" width="44" height="44" loading="lazy" onerror="this.remove()">` : ""}<i>${esc(initials(name))}</i></span><span class="stf-who"><b>${esc(name)}</b><span class="muted small">${esc(role)}${note ? ` · ${esc(note)}` : ""}</span></span></li>`;

export function staffCard(ctx, t) {
  const cd = ctx.coachData ?? {}, head = cd.coaches?.[t.abbrev], gm = ctx.capTeams?.[t.abbrev]?.gm, extra = cd.staff?.[t.abbrev] ?? [];
  const head0 = head ? person(head.name, "Head coach", cd.staff?.heads?.[head.name], head.midSeason ? "hired this season" : "") : "";
  if (!head0 && !gm && !extra.length) return "";
  const rows = [head0, gm ? person(gm, "General manager", null) : "", ...extra.map((p) => person(p.name, p.role ?? "Staff", p.photo))].join("");
  return `<section class="card"><h2>Coaching &amp; management</h2><ul class="stf-list">${rows}</ul>
    <p class="muted small stf-note">Head coach: NHL game feed. GM: CapWages.${extra.length ? "" : " The NHL doesn't publish assistant coaches or staff photos; they appear here once added to the site's staff list."}</p></section>`;
}
