// Country codes (NHL uses ISO alpha-3), names, flags, and Canadian/US province abbreviations.
const C = {
  CAN: ["ca", "Canada"], USA: ["us", "United States"], SWE: ["se", "Sweden"], FIN: ["fi", "Finland"], CZE: ["cz", "Czechia"], SVK: ["sk", "Slovakia"],
  RUS: ["ru", "Russia"], DEU: ["de", "Germany"], GER: ["de", "Germany"], CHE: ["ch", "Switzerland"], SUI: ["ch", "Switzerland"], LVA: ["lv", "Latvia"], LAT: ["lv", "Latvia"],
  DNK: ["dk", "Denmark"], DEN: ["dk", "Denmark"], NOR: ["no", "Norway"], AUT: ["at", "Austria"], SVN: ["si", "Slovenia"], SLO: ["si", "Slovenia"], BLR: ["by", "Belarus"],
  KAZ: ["kz", "Kazakhstan"], UKR: ["ua", "Ukraine"], FRA: ["fr", "France"], GBR: ["gb", "Great Britain"], ITA: ["it", "Italy"], POL: ["pl", "Poland"],
  NLD: ["nl", "Netherlands"], HRV: ["hr", "Croatia"], LTU: ["lt", "Lithuania"], EST: ["ee", "Estonia"], KOR: ["kr", "South Korea"], JPN: ["jp", "Japan"],
  AUS: ["au", "Australia"], SRB: ["rs", "Serbia"], VEN: ["ve", "Venezuela"], LBN: ["lb", "Lebanon"], IRL: ["ie", "Ireland"], BRA: ["br", "Brazil"],
  ZAF: ["za", "South Africa"], TWN: ["tw", "Taiwan"], PRY: ["py", "Paraguay"], JAM: ["jm", "Jamaica"], HTI: ["ht", "Haiti"], NGA: ["ng", "Nigeria"],
  BEL: ["be", "Belgium"], BHR: ["bh", "Bahrain"], TZA: ["tz", "Tanzania"], BHS: ["bs", "Bahamas"], IDN: ["id", "Indonesia"], BGR: ["bg", "Bulgaria"],
  UZB: ["uz", "Uzbekistan"], CHN: ["cn", "China"], HUN: ["hu", "Hungary"], MDA: ["md", "Moldova"], ISR: ["il", "Israel"], MEX: ["mx", "Mexico"],
};
const BY_NAME = {};
for (const [, [iso, name]] of Object.entries(C)) BY_NAME[name.toLowerCase()] = [iso, name];
Object.assign(BY_NAME, { usa: ["us", "United States"], "united states": ["us", "United States"], "czech republic": ["cz", "Czechia"], czechoslovakia: ["cz", "Czechoslovakia"], "soviet union": ["ru", "Soviet Union"], ussr: ["ru", "Soviet Union"], "west germany": ["de", "West Germany"], "team canada": ["ca", "Canada"] });

const flagImg = (iso, label) => iso ? `<img class="flag" src="https://flagcdn.com/${iso}.svg" alt="" title="${label}" width="18" height="13" loading="lazy">` : "";
export const country = (code) => C[code] ? { iso: C[code][0], name: C[code][1] } : code ? { iso: null, name: code } : null;
export const countryByName = (name) => { const hit = BY_NAME[String(name ?? "").toLowerCase()]; return hit ? { iso: hit[0], name: hit[1] } : name ? { iso: null, name } : null; };
export const flag = (c) => (c ? flagImg(c.iso, c.name) : "");

/** A player's nation from a hometown string like "Calgary, AB" or "Zurich, ZH, Switzerland". Used for draft-class players. */
const PROV = new Set("ON QC BC AB MB SK NS NB PE NL YT NT NU".split(" "));
const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
export function nationFromHome(from) {
  const parts = String(from ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts.at(-1);
  if (PROV.has(last)) return country("CAN");
  if (STATES.has(last)) return country("USA");
  const byCode = country(last.toUpperCase());
  if (byCode?.iso) return byCode;
  return country({ canada: "CAN", usa: "USA", "united states": "USA", russia: "RUS", sweden: "SWE", finland: "FIN", czechia: "CZE", "czech republic": "CZE", slovakia: "SVK", switzerland: "CHE", germany: "DEU", latvia: "LVA", norway: "NOR", denmark: "DNK", belarus: "BLR", kazakhstan: "KAZ", austria: "AUT" }[last.toLowerCase()]) ?? null;
}

