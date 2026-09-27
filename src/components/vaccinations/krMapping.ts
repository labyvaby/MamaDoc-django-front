import type { KrPosition, Vaccine } from "../../api/vaccinations";

/** Слова в названии карточки, по которым угадываем антиген календаря КР. */
const HINTS: Record<string, string[]> = {
  vgv: ["гепатит в", "вгв", "гепатит b", "энджерикс", "эувакс"],
  bcg: ["бцж"],
  penta: ["пента", "акдс-вгв", "пентавакцин"],
  pcv: ["пкв", "пневмокок", "превенар", "синфлорикс"],
  bopv: ["бопв", "опв", "оральн"],
  ipv: ["ипв", "инактив", "имовакс"],
  rv: ["рв ", "рв—", "рв —", "ротавирус", "ротатек", "ротарикс", "ротасил"],
  kpk: ["кпк", "корь, паротит", "паротит", "приорикс", "mmr"],
  akds: ["акдс"],
  ads: ["адс "],
  adsm: ["адс-м", "адсм"],
  hpv: ["впч", "папиллом", "гардасил", "церварикс"],
};

/** Антигены календаря в порядке первой позиции. */
export function krAntigens(positions: KrPosition[]): { antigen: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const p of positions) if (!seen.has(p.antigen)) seen.set(p.antigen, p.antigenLabel);
  return [...seen].map(([antigen, label]) => ({ antigen, label }));
}

/**
 * Угадать карточку вакцины для антигена по названию. Гос. карточки в приоритете:
 * календарь КР — про бесплатные прививки. Совпадения по «акдс» не отдают карточку
 * пентавакцины, по «адс » — карточку АДС-М.
 */
export function guessVaccine(antigen: string, vaccines: Vaccine[]): number | null {
  const hints = HINTS[antigen] ?? [];
  const matches = vaccines.filter((v) => {
    const name = ` ${v.name.toLowerCase()} `;
    if (antigen === "akds" && /пента|вгв/.test(name)) return false;
    if (antigen === "ads" && /адс-м|адсм/.test(name)) return false;
    return hints.some((h) => name.includes(h));
  });
  if (matches.length === 0) return null;
  const state = matches.find((v) => v.funding === "state");
  return (state ?? matches[0]).id;
}
