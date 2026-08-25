import { describe, expect, it } from "vitest";

import beauty from "../locales/glossary/beauty.json";
import clinic from "../locales/glossary/clinic.json";
import { declineTerm, guessGender } from "./declension";
import type { Gender, TermForms } from "./types";

const FORM_KEYS = [
  "nom",
  "gen",
  "dat",
  "acc",
  "ins",
  "pre",
  "nomPl",
  "genPl",
  "datPl",
  "accPl",
  "insPl",
  "prePl",
] as const;

/** Компактная запись ожидаемых форм: единственное и множественное через « / ». */
const line = (forms: TermForms, plural = false): string =>
  (plural
    ? [forms.nomPl, forms.genPl, forms.datPl, forms.accPl, forms.insPl, forms.prePl]
    : [forms.nom, forms.gen, forms.dat, forms.acc, forms.ins, forms.pre]
  ).join(" / ");

describe("declineTerm: эталонные профили", () => {
  // Главный инвариант движка: любой термин готового профиля должен
  // восстанавливаться из одного именительного падежа. Профили писались
  // вручную и независимо от склонятеля, поэтому это честная проверка,
  // а не подгонка теста под реализацию.
  for (const [profile, data] of [
    ["clinic", clinic],
    ["beauty", beauty],
  ] as const) {
    const terms = data as unknown as Record<string, TermForms>;
    for (const [key, term] of Object.entries(terms)) {
      it(`${profile}: ${key} «${term.nom}»`, () => {
        // Одушевлённость профиль не хранит явно — её выдаёт совпадение
        // винительного с родительным («пациента», но «приём»).
        const animate = term.acc === term.gen && term.gender !== "n";
        const { forms } = declineTerm(term.nom, {
          gender: term.gender as Gender,
          animate,
        });
        for (const formKey of FORM_KEYS) {
          expect(forms[formKey], formKey).toBe(term[formKey]);
        }
      });
    }
  }
});

describe("declineTerm: типы склонения", () => {
  it("мужской род, одушевлённый — винительный равен родительному", () => {
    const { forms } = declineTerm("косметолог", { animate: true });
    expect(line(forms)).toBe(
      "косметолог / косметолога / косметологу / косметолога / косметологом / косметологе",
    );
    expect(line(forms, true)).toBe(
      "косметологи / косметологов / косметологам / косметологов / косметологами / косметологах",
    );
  });

  it("мужской род, неодушевлённый — винительный равен именительному", () => {
    const { forms } = declineTerm("абонемент");
    expect(forms.acc).toBe("абонемент");
    expect(forms.accPl).toBe("абонементы");
  });

  it("женский род на -а с беглой гласной в родительном множественного", () => {
    const { forms } = declineTerm("стрижка");
    expect(line(forms)).toBe(
      "стрижка / стрижки / стрижке / стрижку / стрижкой / стрижке",
    );
    expect(forms.genPl).toBe("стрижек");
  });

  it("женский род на -ия", () => {
    const { forms } = declineTerm("косметология");
    expect(line(forms)).toBe(
      "косметология / косметологии / косметологии / косметологию / косметологией / косметологии",
    );
    expect(forms.genPl).toBe("косметологий");
  });

  it("средний род на -ие", () => {
    const { forms } = declineTerm("состояние");
    expect(forms.ins).toBe("состоянием");
    expect(forms.pre).toBe("состоянии");
    expect(forms.genPl).toBe("состояний");
  });

  it("беглая гласная в основе слов на -ец", () => {
    const { forms } = declineTerm("питомец", { animate: true });
    expect(line(forms)).toBe(
      "питомец / питомца / питомцу / питомца / питомцем / питомце",
    );
    expect(forms.genPl).toBe("питомцев");
  });

  it("словосочетание: прилагательное согласуется с главным словом", () => {
    const { forms } = declineTerm("рабочее место");
    expect(line(forms)).toBe(
      "рабочее место / рабочего места / рабочему месту / рабочее место / рабочим местом / рабочем месте",
    );
    expect(line(forms, true)).toBe(
      "рабочие места / рабочих мест / рабочим местам / рабочие места / рабочими местами / рабочих местах",
    );
  });

  it("ударное окончание прилагательного -ой сохраняется в именительном", () => {
    const { forms } = declineTerm("зубной врач", { animate: true });
    expect(forms.nom).toBe("зубной врач");
    expect(forms.gen).toBe("зубного врача");
    expect(forms.nomPl).toBe("зубные врачи");
  });

  it("несклоняемые заимствования остаются неизменными во всех формах", () => {
    const { forms, warnings } = declineTerm("такси");
    expect(new Set(FORM_KEYS.map((k) => forms[k]))).toEqual(new Set(["такси"]));
    expect(warnings).toContain("indeclinable");
  });
});

describe("declineTerm: словарные исключения", () => {
  it("профессии с множественным на -а", () => {
    expect(declineTerm("мастер", { animate: true }).forms.nomPl).toBe("мастера");
    expect(declineTerm("администратор", { animate: true }).forms.nomPl).toBe(
      "администраторы",
    );
  });

  it("чередование в корне: сестра → сёстры / сестёр", () => {
    const { forms } = declineTerm("медсестра", { animate: true });
    expect(forms.nomPl).toBe("медсёстры");
    expect(forms.genPl).toBe("медсестёр");
  });
});

describe("declineTerm: предупреждения", () => {
  it("шипящая в основе: ударение решает «-ом/-ем»", () => {
    expect(declineTerm("массаж").warnings).toContain("hushing");
  });

  it("слова на -ор/-ер вне словаря: множественное может быть на -а", () => {
    expect(declineTerm("инженер", { animate: true }).warnings).toContain(
      "pluralA",
    );
  });

  it("словосочетание помечается для ручной проверки", () => {
    expect(declineTerm("рабочее место").warnings).toContain("phrase");
  });

  it("регулярное слово не даёт предупреждений", () => {
    expect(declineTerm("кабинет").warnings).toEqual([]);
  });
});

describe("guessGender", () => {
  it.each([
    ["косметолог", "m"],
    ["клиентка", "f"],
    ["рабочее место", "n"],
    ["запись", "f"],
    ["случай", "m"],
  ])("%s → %s", (word, gender) => {
    expect(guessGender(word)).toBe(gender);
  });
});
