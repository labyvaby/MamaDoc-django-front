/**
 * Проверка терминологического слоя: `npm run i18n:check`
 *
 * 1. Все профили глоссария (src/locales/glossary/*.json) имеют одинаковый
 *    набор терминов и одинаковый набор словоформ у каждого термина.
 * 2. Каждый ключ каждого неймспейса (src/locales/ru/*.json) рендерится
 *    в каждом профиле без нерасшитых {{...}} — то есть все переменные,
 *    на которые ссылаются строки, в глоссарии действительно есть.
 *
 * Падает с кодом 1, если что-то не так. Запускать после правки JSON.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import i18next from "i18next";

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(here, "..", "src", "locales");
const glossaryDir = path.join(localesDir, "glossary");
const ruDir = path.join(localesDir, "ru");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const problems = [];
const verbose = process.argv.includes("--verbose");

// ── 1. Полнота профилей ──────────────────────────────────────────────────────
const profiles = Object.fromEntries(
  fs
    .readdirSync(glossaryDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [path.basename(f, ".json"), readJson(path.join(glossaryDir, f))])
);

const profileNames = Object.keys(profiles);
if (profileNames.length === 0) {
  console.error("Не найдено ни одного профиля глоссария в", glossaryDir);
  process.exit(1);
}

const [refName, ...restNames] = profileNames;
const refTerms = Object.keys(profiles[refName]).sort();

for (const name of restNames) {
  const terms = Object.keys(profiles[name]).sort();
  for (const term of refTerms) {
    if (!terms.includes(term)) problems.push(`профиль «${name}»: нет термина «${term}» (есть в «${refName}»)`);
  }
  for (const term of terms) {
    if (!refTerms.includes(term)) problems.push(`профиль «${refName}»: нет термина «${term}» (есть в «${name}»)`);
  }
}

for (const term of refTerms) {
  const refForms = Object.keys(profiles[refName][term] ?? {}).sort();
  for (const name of profileNames) {
    const forms = Object.keys(profiles[name][term] ?? {}).sort();
    for (const form of refForms) {
      if (!forms.includes(form)) problems.push(`профиль «${name}», термин «${term}»: нет формы «${form}»`);
    }
    const empty = forms.filter((f) => !String(profiles[name][term][f] ?? "").trim());
    for (const f of empty) problems.push(`профиль «${name}», термин «${term}»: пустая форма «${f}»`);
  }
}

// ── 2. Рендер всех ключей в каждом профиле ───────────────────────────────────
const namespaces = Object.fromEntries(
  fs
    .readdirSync(ruDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [path.basename(f, ".json"), readJson(path.join(ruDir, f))])
);

const capitalize = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);
const lower = (v) => (v ? v.charAt(0).toLowerCase() + v.slice(1) : v);

await i18next.init({
  resources: { ru: namespaces },
  lng: "ru",
  fallbackLng: "ru",
  defaultNS: "common",
  nsSeparator: ":",
  keySeparator: ".",
  interpolation: { escapeValue: false },
  returnNull: false,
});
i18next.services.formatter.add("capitalize", (v) => (typeof v === "string" ? capitalize(v) : String(v)));
i18next.services.formatter.add("lower", (v) => (typeof v === "string" ? lower(v) : String(v)));

const PLURAL_SUFFIX = /_(one|few|many|other)$/;

/** Плоский список [ключ, исходная строка] — строка нужна, чтобы понять,
 *  требует ли ключ переменной count (плюрализация или явное {{count}}). */
const flatten = (obj, prefix = "") => {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...flatten(v, key));
    else out.push([key, String(v)]);
  }
  return out;
};

for (const profileName of profileNames) {
  const glossary = profiles[profileName];
  if (verbose) console.log(`\n${"=".repeat(72)}\n  ПРОФИЛЬ: ${profileName}\n${"=".repeat(72)}`);

  for (const [ns, dict] of Object.entries(namespaces)) {
    const seen = new Set();
    for (const [rawKey, rawValue] of flatten(dict)) {
      const base = rawKey.replace(PLURAL_SUFFIX, "");
      // count нужен и плюрализованным ключам, и обычным строкам с {{count}}
      const needsCount = PLURAL_SUFFIX.test(rawKey) || rawValue.includes("{{count}}");
      const counts = needsCount ? [1, 2, 5] : [undefined];

      // Прикладные переменные ({{id}}, {{name}}, {{total}}) приходят из кода,
      // а не из глоссария — подставляем заглушку, иначе они выглядели бы как
      // «нерасшитые» и заслоняли настоящую проблему: отсутствующий термин.
      const appVars = {};
      for (const m of rawValue.matchAll(/\{\{\s*([\w.]+)/g)) {
        const name = m[1];
        const rootName = name.split(".")[0];
        if (rootName in glossary || rootName === "count") continue;
        appVars[name] = `«${name}»`;
      }

      for (const count of counts) {
        const label = count === undefined ? base : `${base} (count=${count})`;
        if (seen.has(label)) continue;
        seen.add(label);
        const opts = { ...glossary, ...appVars, ns };
        if (count !== undefined) opts.count = count;
        const out = i18next.t(base, opts);
        if (verbose) console.log(`  ${`${ns}:${label}`.padEnd(52)} → ${out}`);
        if (/\{\{|\}\}/.test(out)) problems.push(`профиль «${profileName}», ${ns}:${label} → нерасшитая переменная: ${out}`);
        if (out === base) problems.push(`профиль «${profileName}»: ключ ${ns}:${base} не найден`);
      }
    }
  }
}

// ── Итог ─────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(72));
if (problems.length) {
  console.log(`Найдено проблем: ${problems.length}\n`);
  problems.forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log(
  `✓ Профили (${profileNames.join(", ")}) полны и согласованы; ` +
    `все ключи ${Object.keys(namespaces).length} неймспейсов рендерятся без нерасшитых переменных`
);
