import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import i18n from "./index";
import { getGlossary } from "./glossary";
import { genderForm, prepForm } from "./formatters";
import type { Glossary } from "./types";

/**
 * `gender` подставляет окончание слова по роду термина прямо в шаблоне:
 * {{visit.gender, gender(m: ...; f: ...; n: ...)}}. Клиника и салон говорят
 * «приём» / «визит» (м. р.), «Проектная компания» — «встреча» (ж. р.).
 *
 * `prep` подставляет предлог «с»/«в» с чередованием «со»/«во» перед
 * стечением согласных: {{visit.ins, prep(p: с)}} → «со встречей» / «с приёмом».
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

describe("prepForm (модульный уровень)", () => {
  it("«в»→«во» перед в/ф + согласная", () => {
    expect(prepForm("встрече", { p: "в" })).toBe("во встрече");
    expect(prepForm("враче", { p: "в" })).toBe("во враче");
    expect(prepForm("флаконе", { p: "в" })).toBe("во флаконе");
  });

  it("«в» не меняется перед гласной или другой согласной", () => {
    expect(prepForm("мастере", { p: "в" })).toBe("в мастере");
    expect(prepForm("приёме", { p: "в" })).toBe("в приёме");
    expect(prepForm("филиале", { p: "в" })).toBe("в филиале");
  });

  it("«с»→«со» перед с/з/ш/ж/щ + согласная, и перед вс-/вз-", () => {
    expect(prepForm("специалистом", { p: "с" })).toBe("со специалистом");
    expect(prepForm("зданием", { p: "с" })).toBe("со зданием");
    expect(prepForm("жгутом", { p: "с" })).toBe("со жгутом");
    expect(prepForm("встречей", { p: "с" })).toBe("со встречей");
    expect(prepForm("взносом", { p: "с" })).toBe("со взносом");
  });

  it("«с» не меняется перед гласной или другой согласной", () => {
    expect(prepForm("приёмом", { p: "с" })).toBe("с приёмом");
    expect(prepForm("мастером", { p: "с" })).toBe("с мастером");
  });

  it("регистр предлога сохраняется", () => {
    expect(prepForm("встречей", { p: "С" })).toBe("Со встречей");
    expect(prepForm("враче", { p: "В" })).toBe("Во враче");
    expect(prepForm("приёмом", { p: "С" })).toBe("С приёмом");
  });

  it("неизвестный предлог — без изменений, просто через пробел", () => {
    expect(prepForm("приёмом", { p: "у" })).toBe("у приёмом");
    expect(prepForm("приёмом", {})).toBe("приёмом");
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
  ["reviews:public.howWasVisit", {}, "Как прошёл ваш приём?", "Как прошла ваша встреча?", "Как прошёл ваш визит?"],
];

describe(`{{visit.gender, gender(...)}} — ${CASES.length} ключей: было (клиника/салон) → стало (компания)`, () => {
  it.each(CASES)("%s", (key, vars, clinicText, projectsText, beautyText) => {
    expect(render(key, clinic, vars)).toBe(clinicText);
    expect(render(key, projects, vars)).toBe(projectsText);
    if (beautyText) expect(render(key, beauty, vars)).toBe(beautyText);
  });
});

/**
 * Ключи, переведённые на {{term.form, prep(p: с|в)}} ради чередования
 * «со/во» — клиника и салон не меняются («приёмами», «визитами»), у
 * «Проектной компании» слово «встреча» требует чередования.
 */
const PREP_CASES: Case[] = [
  ["appointments:overlapDialog.text", {}, "Пересекается с приёмами:", "Пересекается со встречами:", "Пересекается с визитами:"],
  ["reports:productsInVisits", {}, "Товары в приёмах", "Товары во встречах"],
  ["reports:soldInVisits", {}, "Продано в приёмах", "Продано во встречах"],
  ["sales:details.fromVisitChip", {}, "С приёма", "Со встречи"],
  ["sales:list.fromVisitChip", {}, "С приёма", "Со встречи"],
  ["services:relatedProducts.extraInVisit", {}, "Платные товары в приёме", "Платные товары во встрече"],
];

describe(`{{term.form, prep(p: ...)}} — ${PREP_CASES.length} ключей: чередование «со/во»`, () => {
  it.each(PREP_CASES)("%s", (key, vars, clinicText, projectsText, beautyText) => {
    expect(render(key, clinic, vars)).toBe(clinicText);
    expect(render(key, projects, vars)).toBe(projectsText);
    if (beautyText) expect(render(key, beauty, vars)).toBe(beautyText);
  });
});

// ── Страж: {{term.gender, gender(...)}} и {{term.form, prep(...)}} нигде не сломаны ──

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "locales", "ru");
const glossaryKeys = new Set(Object.keys(clinic));

const flattenStrings = (node: unknown, prefix = ""): [string, string][] =>
  typeof node === "string"
    ? [[prefix, node]]
    : node && typeof node === "object"
      ? Object.entries(node).flatMap(([k, v]) => flattenStrings(v, prefix ? `${prefix}.${k}` : k))
      : [];

describe("страж: {{term.gender, gender(...)}} и {{term.form, prep(...)}} в src/locales/ru", () => {
  for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
    const ns = path.basename(file, ".json");
    const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
    for (const [key, value] of flattenStrings(dict)) {
      const genderReadCount = (value.match(/\.gender\b/g) ?? []).length;
      const genderCallCount = (value.match(/\bgender\(/g) ?? []).length;
      const prepCallCount = (value.match(/\bprep\(/g) ?? []).length;
      // Голый предлог прямо перед {{visit. / {{specialist. — не через prep(...) —
      // это именно то, что должно было стать prep(...), а не осталось текстом.
      const danglingPreps = [...value.matchAll(/\b([свСВ])\s+\{\{(visit|specialist)\./g)].map((m) => m[0]);
      if (genderReadCount === 0 && genderCallCount === 0 && prepCallCount === 0 && danglingPreps.length === 0) continue;
      it(`${ns}:${key}`, () => {
        expect(danglingPreps, `${ns}:${key} — предлог не через prep(...): ${value}`).toEqual([]);

        // Полные, корректные вызовы {{term.gender, gender(...)}}. Каждое
        // отдельное чтение «.gender» и каждый отдельный вызов «gender(»
        // обязаны быть частью ОДНОГО ТАКОГО матча — иначе gender( повешен
        // не на .gender (например, {{visit.nom, gender(...)}}) или скобки
        // сломаны (например, одна «}» вместо «}}») проскочат незамеченными.
        const wellFormedGender = [...value.matchAll(/\{\{\s*(\w+)\.gender\s*,\s*gender\(([^)]*)\)\s*\}\}/g)];
        expect(genderReadCount, `${ns}:${key} — «.gender» не в составе корректного вызова: ${value}`).toBe(
          wellFormedGender.length,
        );
        expect(genderCallCount, `${ns}:${key} — gender( не на .gender или скобки сломаны: ${value}`).toBe(
          wellFormedGender.length,
        );

        for (const m of wellFormedGender) {
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

        // То же самое для {{term.form, prep(p: с|в|С|В)}}: ровно один параметр
        // «p» с одним из четырёх допустимых значений.
        const wellFormedPrep = [...value.matchAll(/\{\{\s*(\w+)\.\w+\s*,\s*prep\(([^)]*)\)\s*\}\}/g)];
        expect(prepCallCount, `${ns}:${key} — prep( не на term.form или скобки сломаны: ${value}`).toBe(
          wellFormedPrep.length,
        );
        for (const m of wellFormedPrep) {
          const [, term, paramsStr] = m;
          expect(glossaryKeys.has(term), `неизвестный термин «${term}» в ${m[0]}`).toBe(true);
          const rawKeys = paramsStr.split(";").map((p) => p.slice(0, p.indexOf(":")).trim());
          expect(rawKeys, `${m[0]} — параметр должен быть один, «p»`).toEqual(["p"]);
          const pValue = paramsStr.slice(paramsStr.indexOf(":") + 1).trim();
          expect(["с", "в", "С", "В"].includes(pValue), `${m[0]} → p: «${pValue}»`).toBe(true);
        }
      });
    }
  }
});

/**
 * Аллоулист: ключи с {{visit.(nom|gen|dat|acc|ins|pre)}} в единственном
 * числе, где рядом сознательно НЕТ gender(...) — согласующегося слова там
 * нет (см. таблицу «было → стало» задачи 7б и её ревью), поэтому мужское
 * окончание в шаблоне не нужно чинить. Список зафиксирован намеренно: любая
 * НОВАЯ строка с {{visit.*}} в единственном числе без gender(...) уронит
 * этот тест, пока её не проверят и не впишут сюда явно (или не заменят
 * форматтером gender, если слово всё-таки согласуется).
 */
const REVIEWED_SINGULAR_VISIT_WITHOUT_GENDER = [
  "appointments:addDrawer.dateTimeSection",
  "appointments:addDrawer.discardText",
  "appointments:addDrawer.noBranchHowToTail",
  "appointments:addDrawer.noBranchText",
  "appointments:addDrawer.title",
  "appointments:bankConfirmation.noneFound",
  "appointments:cashDateDialog.appointmentDate",
  "appointments:chips.overdue",
  "appointments:conclusion.aiAssist.tooltip",
  "appointments:confirm.deleteTitle",
  "appointments:details.deleteTitle",
  "appointments:details.startVisit",
  "appointments:editDrawer.title",
  "appointments:editDrawer.titleLower",
  "appointments:invoice.visitDate",
  "appointments:journal.actions.edit",
  "appointments:journal.count.appointments_few",
  "appointments:journal.count.appointments_one",
  "appointments:journal.details.composition",
  "appointments:journal.details.sliceShare",
  "appointments:list.count_few",
  "appointments:list.count_one",
  "appointments:overlapDialog.title",
  "appointments:page.addVisit",
  "appointments:page.noSelection",
  "appointments:payment.cashDateAppointment",
  "appointments:payment.lockedBonuses",
  "appointments:payment.lockedRefund",
  "appointments:payment.title",
  "appointments:slots.visitsCount_few",
  "appointments:slots.visitsCount_one",
  "appointments:status.in_progress",
  "bookings:confirm.servicesRequired",
  "bookings:confirm.subtitle",
  "bookings:detail.openVisit",
  "bookings:detail.prepaymentNeedsAttention",
  "bookings:detail.visitNotCreated",
  "bookings:missed.hint",
  "bookings:missed.noShowConfirm.message",
  "bookings:missed.noShowTooltip",
  "bookings:visitInCrm",
  "cashbox:appointmentRef",
  "cashbox:typeLabelPayment",
  "client:visitDetailsTitle",
  "deals:detail.createAppointment",
  "doctor:selectVisitPrompt",
  "landing:reviews.subtitle",
  "load:count_few",
  "load:count_one",
  "patients:balance.visitRef",
  "print:visitDateTimeLabel",
  "publicBooking:brandSubtitle",
  "publicBooking:byCode.statusHintPending",
  "publicBooking:my.serviceOnVisit",
  "publicBooking:reminderOnTime",
  "publicBooking:selectDateRequired",
  "publicBooking:selectTimeRequired",
  "publicBooking:successHint",
  "reviews:public.visitLabel",
  "reviews:settings.delayLabel",
  "reviews:settings.pollerHint",
  "sales:details.fromVisitChip",
  "sales:details.fromVisitHint",
  "sales:details.noVisitPayment",
  "sales:details.paymentInVisit",
  "sales:details.visitTitle",
  "sales:list.fromVisitChip",
  "services:relatedProducts.autoWriteOffOn",
  "services:relatedProducts.extraInVisit",
  "settings:branches.description",
  "settings:notifications.columns.visit",
  "vaccinations:recordDrawer.visitIdLabel",
];

describe("страж: аллоулист {{visit.*}} в ед. числе без gender(...)", () => {
  it(`ровно ${REVIEWED_SINGULAR_VISIT_WITHOUT_GENDER.length} проверенных ключей`, () => {
    const found: string[] = [];
    for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
      const ns = path.basename(file, ".json");
      const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
      for (const [key, value] of flattenStrings(dict)) {
        if (/\{\{visit\.(nom|gen|dat|acc|ins|pre)\b/.test(value) && !/\bgender\(/.test(value)) {
          found.push(`${ns}:${key}`);
        }
      }
    }
    found.sort();
    expect(
      found,
      "Новый шаблон со словом визита в единственном числе и без gender(...): проверьте согласование рода " +
        "(при необходимости используйте форматтер gender) и затем впишите ключ в " +
        "REVIEWED_SINGULAR_VISIT_WITHOUT_GENDER.",
    ).toEqual(REVIEWED_SINGULAR_VISIT_WITHOUT_GENDER);
  });
});
