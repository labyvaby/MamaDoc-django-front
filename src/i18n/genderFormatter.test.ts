import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import i18n from "./index";
import { getGlossary } from "./glossary";
import { genderForm } from "./formatters";
import type { Glossary } from "./types";

/**
 * Форматтер `gender` подставляет окончание слова по роду термина прямо в
 * шаблоне: {{visit.gender, gender(m: ...; f: ...; n: ...)}}. Клиника и салон
 * говорят «приём» / «визит» (м. р.), «Проектная компания» — «встреча» (ж. р.).
 */

const clinic = getGlossary("clinic");
const beauty = getGlossary("beauty");
const projects = getGlossary("projects");

const render = (key: string, glossary: Glossary, vars: Record<string, unknown> = {}): string =>
  i18n.t(key, { ...glossary, ...vars }) as unknown as string;

describe("genderForm (модульный уровень)", () => {
  const forms = { m: "создан", f: "создана", n: "создано" };

  it("m/f/n — выбирает форму по роду", () => {
    expect(genderForm("m", forms)).toBe("создан");
    expect(genderForm("f", forms)).toBe("создана");
    expect(genderForm("n", forms)).toBe("создано");
  });

  it("неизвестный род — мужская форма", () => {
    expect(genderForm("x", forms)).toBe("создан");
    expect(genderForm(undefined, forms)).toBe("создан");
  });

  it("форма для рода не задана — мужская форма", () => {
    expect(genderForm("f", { m: "создан" })).toBe("создан");
  });
});

/** [ключ, переменные t(), ожидание для клиники, для «Проектной компании», необязательно для салона]. */
type Case = [key: string, vars: Record<string, unknown>, clinic: string, projects: string, beauty?: string];

const CASES: Case[] = [
  ["appointments:addDrawer.created", {}, "Приём успешно создан!", "Встреча успешно создана!"],
  ["appointments:editDrawer.updated", {}, "Приём обновлён", "Встреча обновлена", "Визит обновлён"],
  ["appointments:confirm.deleteText", {}, "Приём будет удалён без возможности восстановления.", "Встреча будет удалена без возможности восстановления."],
  ["appointments:overlapDialog.newVisit", {}, "Новый приём:", "Новая встреча:", "Новый визит:"],
  ["appointments:details.nightVisit", {}, "Ночной приём", "Ночная встреча"],
  ["appointments:details.deleteText", {}, "Удалить можно только ошибочно созданный приём без оплат, возвратов и медицинских заключений.", "Удалить можно только ошибочно созданную встречу без оплат, возвратов и медицинских отчётов."],
  ["appointments:editDrawer.productsLocked", {}, "Изменить товары созданного приёма пока нельзя. Дополнительные расходники оформляются отдельной продажей в разделе «Продажи».", "Изменить товары созданной встречи пока нельзя. Дополнительные расходники оформляются отдельной продажей в разделе «Продажи»."],
  ["appointments:editDrawer.productsHint", {}, "Товары добавляются при создании приёма. К созданному приёму расходники (шприц, зонд и т.п.) оформляются отдельной продажей в разделе «Продажи».", "Товары добавляются при создании встречи. К созданной встрече расходники (шприц, зонд и т.п.) оформляются отдельной продажей в разделе «Продажи»."],
  ["appointments:cashDateDialog.text", {}, "Дата приёма отличается от сегодняшней. Выберите, каким числом оплата картой/страховкой попадёт в кассу и отчёты — это не влияет на дату самого приёма.", "Дата встречи отличается от сегодняшней. Выберите, каким числом оплата картой/страховкой попадёт в кассу и отчёты — это не влияет на дату самой встречи."],
  ["appointments:payment.cancelledNotice", {}, "Приём отменён или помечен как неявка — оплата недоступна.", "Встреча отменена или помечена как неявка — оплата недоступна."],
  ["appointments:payment.cashlessBranchNote", { branch: "Восток" }, "Способы филиала «Восток» — приём заведён там", "Способы филиала «Восток» — встреча заведена там"],
  ["appointments:payment.noAppointment", {}, "Нет выбранного приёма", "Нет выбранной встречи"],
  ["appointments:payment.errors.balanceAlreadyUsed", {}, "Этот приём уже оплачивался с баланса или бонусами. Изменение состава оплаты недоступно без возврата.", "Эта встреча уже оплачивалась с баланса или бонусами. Изменение состава оплаты недоступно без возврата."],
  ["appointments:conclusionSlots.empty", {}, "Для этого приёма нет врачебных заключений", "Для этой встречи нет врачебных отчётов"],
  ["appointments:conclusion.errors.serviceLineGone", { service: "УЗИ" }, "Состав услуг приёма изменился, пока форма была открыта: услуги «УЗИ» в нём больше нет. Скопируйте текст, обновите карточку приёма и создайте заключение заново.", "Состав услуг встречи изменился, пока форма была открыта: услуги «УЗИ» в ней больше нет. Скопируйте текст, обновите карточку встречи и создайте отчёт заново."],
  ["appointments:bankConfirmation.usedElsewhere", {}, "Уже привязаны к другому приёму", "Уже привязаны к другой встрече"],
  ["settings:organization.overlapMode.sectionHint", {}, "Как поступать, когда новый приём пересекается по времени с другим приёмом сотрудника.", "Как поступать, когда новая встреча пересекается по времени с другой встречей сотрудника."],
  ["settings:organization.overlapMode.forbid.hint", {}, "Если приём пересекается с другим приёмом сотрудника, сохранить нельзя.", "Если встреча пересекается с другой встречей сотрудника, сохранить нельзя."],
  ["deals:subtitle", {}, "Обращения от первого звонка до оплаченного приёма", "Обращения от первого звонка до оплаченной встречи"],
  ["bookings:detail.cancelInVisitHint", {}, "Онлайн-запись закреплена за приёмом — отменить её можно только в самом приёме, там же оформляется возврат.", "Онлайн-запись закреплена за встречей — отменить её можно только в самой встрече, там же оформляется возврат."],
  ["bookings:missed.rebookTooltip", {}, "Открыть форму записи с пациентом и врачом из онлайн-записи. Она закроется, когда приём будет создан", "Открыть форму записи с клиентом и специалистом из онлайн-записи. Она закроется, когда встреча будет создана"],
  ["bookings:cancelConfirm.message", {}, "Пациент получит отмену онлайн-записи. Приём по этой онлайн-записи ещё не создан, отменять в CRM нечего.", "Пациент получит отмену онлайн-записи. Встреча по этой онлайн-записи ещё не создана, отменять в CRM нечего."],
  ["vaccinations:recordDrawer.visitIdHelperLinked", {}, "Указан — строка вакцины попадёт в счёт этого приёма", "Указан — строка вакцины попадёт в счёт этой встречи"],
  ["patients:card.lastVisit", {}, "Последний приём", "Последняя встреча", "Последний визит"],
  ["publicBooking:byCode.statusTitleCompleted", {}, "Приём состоялся", "Встреча состоялась"],
  ["publicBooking:byCode.statusTitleNoShow", {}, "Приём пропущен", "Встреча пропущена"],
  ["reviews:public.rateYourVisit", {}, "Оцените ваш приём", "Оцените вашу встречу", "Оцените ваш визит"],
];

describe(`{{visit.gender, gender(...)}} — ${CASES.length} ключей: было (клиника/салон) → стало (компания)`, () => {
  it.each(CASES)("%s", (key, vars, clinicText, projectsText, beautyText) => {
    expect(render(key, clinic, vars)).toBe(clinicText);
    expect(render(key, projects, vars)).toBe(projectsText);
    if (beautyText) expect(render(key, beauty, vars)).toBe(beautyText);
  });
});

// ── Страж: {{term.gender, gender(m: ...; f: ...; n: ...)}} нигде не сломан ──

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "locales", "ru");
const glossaryKeys = new Set(Object.keys(clinic));

const flattenStrings = (node: unknown, prefix = ""): [string, string][] =>
  typeof node === "string"
    ? [[prefix, node]]
    : node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) => flattenStrings(v, prefix ? `${prefix}.${k}` : k))
      : [];

describe("страж: {{term.gender, gender(...)}} в src/locales/ru", () => {
  for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
    const ns = path.basename(file, ".json");
    const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
    for (const [key, value] of flattenStrings(dict)) {
      const genderReadCount = (value.match(/\.gender\b/g) ?? []).length;
      const genderCallCount = (value.match(/\bgender\(/g) ?? []).length;
      if (genderReadCount === 0 && genderCallCount === 0) continue;
      it(`${ns}:${key}`, () => {
        // Полные, корректные вызовы {{term.gender, gender(...)}}. Каждое
        // отдельное чтение «.gender» и каждый отдельный вызов «gender(»
        // обязаны быть частью ОДНОГО ТАКОГО матча — иначе gender( повешен
        // не на .gender (например, {{visit.nom, gender(...)}}) или скобки
        // сломаны (например, одна «}» вместо «}}») проскочат незамеченными.
        const wellFormed = [...value.matchAll(/\{\{\s*(\w+)\.gender\s*,\s*gender\(([^)]*)\)\s*\}\}/g)];
        expect(genderReadCount, `${ns}:${key} — «.gender» не в составе корректного вызова: ${value}`).toBe(
          wellFormed.length,
        );
        expect(genderCallCount, `${ns}:${key} — gender( не на .gender или скобки сломаны: ${value}`).toBe(
          wellFormed.length,
        );

        for (const m of wellFormed) {
          const [, term, paramsStr] = m;
          expect(glossaryKeys.has(term), `неизвестный термин «${term}» в ${m[0]}`).toBe(true);
          const rawKeys = paramsStr.split(";").map((p) => p.slice(0, p.indexOf(":")).trim());
          expect(new Set(rawKeys).size, `дублирующийся ключ формы в ${m[0]}`).toBe(rawKeys.length);
          const params = Object.fromEntries(
            paramsStr.split(";").map((p) => {
              const i = p.indexOf(":");
              return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
            }),
          );
          expect(Object.keys(params).sort(), m[0]).toEqual(["f", "m", "n"]);
          for (const v of Object.values(params)) expect(/^[^();]+$/.test(v), `${m[0]} → «${v}»`).toBe(true);
        }

        if (genderCallCount > 0) {
          const collisions = [...value.matchAll(/\{\{\s*(m|f|n)\s*(?:,[^}]*)?\}\}/g)].map((mm) => mm[1]);
          expect(collisions, `${ns}:${key} — «${value}»`).toEqual([]);
        }
      });
    }
  }
});
