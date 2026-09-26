import { describe, expect, it } from "vitest";

import i18n from "./index";
import { getGlossary } from "./glossary";
import { agree, capitalize, genderForm } from "./formatters";
import type { Glossary } from "./types";

/**
 * Форматтер `gender` подставляет окончание слова по роду термина прямо в
 * шаблоне: {{visit.gender, gender(m: ...; f: ...; n: ...)}}. Клиника и салон
 * говорят «приём» / «визит» (м. р.) — тексты не должны измениться ни на
 * букву. «Проектная компания» говорит «встреча» (ж. р.) — тексты должны
 * согласовываться в женском роде.
 */

const clinic = getGlossary("clinic");
const beauty = getGlossary("beauty");
const projects = getGlossary("projects");

const render = (key: string, glossary: Glossary, extra: Record<string, unknown> = {}): string =>
  i18n.t(key, { ...glossary, ...extra }) as unknown as string;

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
    expect(genderForm(null, forms)).toBe("создан");
    expect(genderForm(42, forms)).toBe("создан");
  });

  it("форма для рода не задана — мужская форма", () => {
    expect(genderForm("f", { m: "создан" })).toBe("создан");
    expect(genderForm("n", { m: "создан" })).toBe("создан");
  });
});

describe("{{visit.gender, gender(...)}} через настроенный i18next", () => {
  it("appointments: addDrawer.created — «успешно создан(а)»", () => {
    const key = "appointments:addDrawer.created";
    expect(render(key, clinic)).toBe(
      `${capitalize(clinic.visit.nom)} успешно ${agree(clinic.visit.gender, ["создан", "создана", "создано"])}!`,
    );
    expect(render(key, clinic)).toBe("Приём успешно создан!");
    expect(render(key, projects)).toBe("Встреча успешно создана!");
  });

  it("appointments: editDrawer.updated — «обновлён/обновлена»", () => {
    const key = "appointments:editDrawer.updated";
    expect(render(key, clinic)).toBe("Приём обновлён");
    expect(render(key, beauty)).toBe("Визит обновлён");
    expect(render(key, projects)).toBe("Встреча обновлена");
  });

  it("appointments: confirm.deleteText — «будет удалён/удалена»", () => {
    const key = "appointments:confirm.deleteText";
    expect(render(key, clinic)).toBe("Приём будет удалён без возможности восстановления.");
    expect(render(key, projects)).toBe("Встреча будет удалена без возможности восстановления.");
  });

  it("appointments: overlapDialog.newVisit — «Новый/Новая …:»", () => {
    const key = "appointments:overlapDialog.newVisit";
    expect(render(key, clinic)).toBe("Новый приём:");
    expect(render(key, beauty)).toBe("Новый визит:");
    expect(render(key, projects)).toBe("Новая встреча:");
  });

  it("appointments: details.nightVisit — «Ночной/Ночная …»", () => {
    const key = "appointments:details.nightVisit";
    expect(render(key, clinic)).toBe("Ночной приём");
    expect(render(key, projects)).toBe("Ночная встреча");
  });

  it("appointments: details.deleteText — «ошибочно созданный/созданную …»", () => {
    const key = "appointments:details.deleteText";
    const build = (g: Glossary) =>
      `Удалить можно только ошибочно ${agree(g.visit.gender, ["созданный", "созданную", "созданное"])} ${g.visit.acc} без оплат, возвратов и медицинских ${g.conclusion.genPl}.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: editDrawer.productsLocked — «созданного/созданной» (родительный)", () => {
    const key = "appointments:editDrawer.productsLocked";
    const build = (g: Glossary) =>
      `Изменить товары ${agree(g.visit.gender, ["созданного", "созданной", "созданного"])} ${g.visit.gen} пока нельзя. Дополнительные расходники оформляются отдельной продажей в разделе «Продажи».`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: editDrawer.productsHint — «К созданному/созданной» (дательный)", () => {
    const key = "appointments:editDrawer.productsHint";
    const build = (g: Glossary) =>
      `Товары добавляются при создании ${g.visit.gen}. К ${agree(g.visit.gender, ["созданному", "созданной", "созданному"])} ${g.visit.dat} расходники (шприц, зонд и т.п.) оформляются отдельной продажей в разделе «Продажи».`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: cashDateDialog.text — «самого/самой» (родительный)", () => {
    const key = "appointments:cashDateDialog.text";
    const build = (g: Glossary) =>
      `Дата ${g.visit.gen} отличается от сегодняшней. Выберите, каким числом оплата картой/страховкой попадёт в кассу и отчёты — это не влияет на дату ${agree(g.visit.gender, ["самого", "самой", "самого"])} ${g.visit.gen}.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: payment.cancelledNotice — «отменён/отменена» + «помечен/помечена»", () => {
    const key = "appointments:payment.cancelledNotice";
    const build = (g: Glossary) =>
      `${capitalize(g.visit.nom)} ${agree(g.visit.gender, ["отменён", "отменена", "отменено"])} или ${agree(g.visit.gender, ["помечен", "помечена", "помечено"])} как неявка — оплата недоступна.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: payment.cashlessBranchNote — «заведён/заведена»", () => {
    const key = "appointments:payment.cashlessBranchNote";
    const extra = { branch: "Восток" };
    const build = (g: Glossary) =>
      `Способы филиала «Восток» — ${g.visit.nom} ${agree(g.visit.gender, ["заведён", "заведена", "заведено"])} там`;
    expect(render(key, clinic, extra)).toBe(build(clinic));
    expect(render(key, projects, extra)).toBe(build(projects));
  });

  it("appointments: payment.noAppointment — «выбранного/выбранной» (родительный)", () => {
    const key = "appointments:payment.noAppointment";
    const build = (g: Glossary) =>
      `Нет ${agree(g.visit.gender, ["выбранного", "выбранной", "выбранного"])} ${g.visit.gen}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: payment.errors.balanceAlreadyUsed — «Этот/Эта» + «оплачивался/оплачивалась»", () => {
    const key = "appointments:payment.errors.balanceAlreadyUsed";
    const build = (g: Glossary) =>
      `${agree(g.visit.gender, ["Этот", "Эта", "Это"])} ${g.visit.nom} уже ${agree(g.visit.gender, ["оплачивался", "оплачивалась", "оплачивалось"])} с баланса или бонусами. Изменение состава оплаты недоступно без возврата.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
    expect(render(key, projects)).toBe(
      "Эта встреча уже оплачивалась с баланса или бонусами. Изменение состава оплаты недоступно без возврата.",
    );
  });

  it("appointments: conclusionSlots.empty — «этого/этой» (родительный)", () => {
    const key = "appointments:conclusionSlots.empty";
    const build = (g: Glossary) =>
      `Для ${agree(g.visit.gender, ["этого", "этой", "этого"])} ${g.visit.gen} нет врачебных ${g.conclusion.genPl}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("appointments: conclusion.errors.serviceLineGone — «в нём/ней» (предложный, местоимение)", () => {
    const key = "appointments:conclusion.errors.serviceLineGone";
    const extra = { service: "УЗИ" };
    const build = (g: Glossary) =>
      `Состав услуг ${g.visit.gen} изменился, пока форма была открыта: услуги «УЗИ» в ${agree(g.visit.gender, ["нём", "ней", "нём"])} больше нет. Скопируйте текст, обновите карточку ${g.visit.gen} и создайте ${g.conclusion.acc} заново.`;
    expect(render(key, clinic, extra)).toBe(build(clinic));
    expect(render(key, projects, extra)).toBe(build(projects));
  });

  it("appointments: bankConfirmation.usedElsewhere — «другому/другой» (дательный)", () => {
    const key = "appointments:bankConfirmation.usedElsewhere";
    const build = (g: Glossary) =>
      `Уже привязаны к ${agree(g.visit.gender, ["другому", "другой", "другому"])} ${g.visit.dat}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("settings: когда новый … пересекается … с другим …", () => {
    const key = "settings:organization.overlapMode.sectionHint";
    const build = (g: Glossary) =>
      `Как поступать, когда ${agree(g.visit.gender, ["новый", "новая", "новое"])} ${g.visit.nom} пересекается по времени с ${agree(g.visit.gender, ["другим", "другой", "другим"])} ${g.visit.ins} ${g.employee.gen}.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("settings: если … пересекается с другим …", () => {
    const key = "settings:organization.overlapMode.forbid.hint";
    const build = (g: Glossary) =>
      `Если ${g.visit.nom} пересекается с ${agree(g.visit.gender, ["другим", "другой", "другим"])} ${g.visit.ins} ${g.employee.gen}, сохранить нельзя.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("deals: subtitle — «оплаченного/оплаченной» (родительный)", () => {
    const key = "deals:subtitle";
    const build = (g: Glossary) =>
      `Обращения от первого звонка до ${agree(g.visit.gender, ["оплаченного", "оплаченной", "оплаченного"])} ${g.visit.gen}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("bookings: detail.cancelInVisitHint — «в самом/самой» (предложный)", () => {
    const key = "bookings:detail.cancelInVisitHint";
    const build = (g: Glossary) =>
      `Онлайн-запись закреплена за ${g.visit.ins} — отменить её можно только в ${agree(g.visit.gender, ["самом", "самой", "самом"])} ${g.visit.pre}, там же оформляется возврат.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("bookings: missed.rebookTooltip — «будет создан/создана»", () => {
    const key = "bookings:missed.rebookTooltip";
    const build = (g: Glossary) =>
      `Открыть форму записи с ${g.patient.ins} и ${g.specialist.ins} из онлайн-записи. Она закроется, когда ${g.visit.nom} будет ${agree(g.visit.gender, ["создан", "создана", "создано"])}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("bookings: cancelConfirm.message — «ещё не создан/создана»", () => {
    const key = "bookings:cancelConfirm.message";
    const build = (g: Glossary) =>
      `Пациент получит отмену онлайн-записи. ${capitalize(g.visit.nom)} по этой онлайн-записи ещё не ${agree(g.visit.gender, ["создан", "создана", "создано"])}, отменять в CRM нечего.`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("vaccinations: recordDrawer.visitIdHelperLinked — «этого/этой» (родительный)", () => {
    const key = "vaccinations:recordDrawer.visitIdHelperLinked";
    const build = (g: Glossary) =>
      `Указан — строка вакцины попадёт в счёт ${agree(g.visit.gender, ["этого", "этой", "этого"])} ${g.visit.gen}`;
    expect(render(key, clinic)).toBe(build(clinic));
    expect(render(key, projects)).toBe(build(projects));
  });

  it("patients: card.lastVisit — «Последний/Последняя …»", () => {
    const key = "patients:card.lastVisit";
    expect(render(key, clinic)).toBe("Последний приём");
    expect(render(key, beauty)).toBe("Последний визит");
    expect(render(key, projects)).toBe("Последняя встреча");
  });

  it("publicBooking: byCode.statusTitleCompleted — «… состоялся/состоялась»", () => {
    const key = "publicBooking:byCode.statusTitleCompleted";
    expect(render(key, clinic)).toBe("Приём состоялся");
    expect(render(key, projects)).toBe("Встреча состоялась");
  });

  it("publicBooking: byCode.statusTitleNoShow — «… пропущен/пропущена»", () => {
    const key = "publicBooking:byCode.statusTitleNoShow";
    expect(render(key, clinic)).toBe("Приём пропущен");
    expect(render(key, projects)).toBe("Встреча пропущена");
  });

  it("reviews: public.rateYourVisit — «ваш/вашу»", () => {
    const key = "reviews:public.rateYourVisit";
    expect(render(key, clinic)).toBe("Оцените ваш приём");
    expect(render(key, beauty)).toBe("Оцените ваш визит");
    expect(render(key, projects)).toBe("Оцените вашу встречу");
  });
});

/**
 * Сверка «было / стало» для клиники и салона: 27 ключей, где правился текст
 * ради рода «Проектной компании», должны рендериться СЛОВО В СЛОВО как до
 * правки — сравнение идёт с текстом, зафиксированным до задачи 7б (не через
 * agree()/genderForm(), а буквальной строкой), чтобы поймать любую опечатку
 * в форме "m:" внутри JSON-шаблонов, а не только рассогласование с тестом.
 */
const UNCHANGED_FOR_MASCULINE: Record<string, string> = {
  "appointments:confirm.deleteText":
    "{{visit.nom, capitalize}} будет удалён без возможности восстановления.",
  "appointments:details.nightVisit": "Ночной {{visit.nom}}",
  "appointments:details.deleteText":
    "Удалить можно только ошибочно созданный {{visit.acc}} без оплат, возвратов и медицинских {{conclusion.genPl}}.",
  "appointments:addDrawer.created": "{{visit.nom, capitalize}} успешно создан!",
  "appointments:editDrawer.productsLocked":
    "Изменить товары созданного {{visit.gen}} пока нельзя. Дополнительные расходники оформляются отдельной продажей в разделе «Продажи».",
  "appointments:editDrawer.productsHint":
    "Товары добавляются при создании {{visit.gen}}. К созданному {{visit.dat}} расходники (шприц, зонд и т.п.) оформляются отдельной продажей в разделе «Продажи».",
  "appointments:editDrawer.updated": "{{visit.nom, capitalize}} обновлён",
  "appointments:overlapDialog.newVisit": "Новый {{visit.nom}}:",
  "appointments:cashDateDialog.text":
    "Дата {{visit.gen}} отличается от сегодняшней. Выберите, каким числом оплата картой/страховкой попадёт в кассу и отчёты — это не влияет на дату самого {{visit.gen}}.",
  "appointments:payment.cancelledNotice":
    "{{visit.nom, capitalize}} отменён или помечен как неявка — оплата недоступна.",
  "appointments:payment.cashlessBranchNote": "Способы филиала «{{branch}}» — {{visit.nom}} заведён там",
  "appointments:payment.noAppointment": "Нет выбранного {{visit.gen}}",
  "appointments:payment.errors.balanceAlreadyUsed":
    "Этот {{visit.nom}} уже оплачивался с баланса или бонусами. Изменение состава оплаты недоступно без возврата.",
  "appointments:conclusionSlots.empty": "Для этого {{visit.gen}} нет врачебных {{conclusion.genPl}}",
  "appointments:conclusion.errors.serviceLineGone":
    "Состав услуг {{visit.gen}} изменился, пока форма была открыта: услуги «{{service}}» в нём больше нет. Скопируйте текст, обновите карточку {{visit.gen}} и создайте {{conclusion.acc}} заново.",
  "appointments:bankConfirmation.usedElsewhere": "Уже привязаны к другому {{visit.dat}}",
  "settings:organization.overlapMode.sectionHint":
    "Как поступать, когда новый {{visit.nom}} пересекается по времени с другим {{visit.ins}} {{employee.gen}}.",
  "settings:organization.overlapMode.forbid.hint":
    "Если {{visit.nom}} пересекается с другим {{visit.ins}} {{employee.gen}}, сохранить нельзя.",
  "deals:subtitle": "Обращения от первого звонка до оплаченного {{visit.gen}}",
  "bookings:detail.cancelInVisitHint":
    "Онлайн-запись закреплена за {{visit.ins}} — отменить её можно только в самом {{visit.pre}}, там же оформляется возврат.",
  "bookings:missed.rebookTooltip":
    "Открыть форму записи с {{patient.ins}} и {{specialist.ins}} из онлайн-записи. Она закроется, когда {{visit.nom}} будет создан",
  "bookings:cancelConfirm.message":
    "Пациент получит отмену онлайн-записи. {{visit.nom, capitalize}} по этой онлайн-записи ещё не создан, отменять в CRM нечего.",
  "vaccinations:recordDrawer.visitIdHelperLinked": "Указан — строка вакцины попадёт в счёт этого {{visit.gen}}",
  "patients:card.lastVisit": "Последний {{visit.nom}}",
  "publicBooking:byCode.statusTitleCompleted": "{{visit.nom, capitalize}} состоялся",
  "publicBooking:byCode.statusTitleNoShow": "{{visit.nom, capitalize}} пропущен",
  "reviews:public.rateYourVisit": "Оцените ваш {{visit.acc}}",
};

/** {{term.form}} → значение формы термина в глоссарии, для «ручного» рендера образца до правки. */
const renderTemplate = (template: string, glossary: Glossary, extra: Record<string, unknown>): string =>
  template.replace(/\{\{\s*([\w.]+)(?:,\s*capitalize)?\s*\}\}/g, (whole, path: string) => {
    if (path in extra) return String(extra[path]);
    const [term, form] = path.split(".");
    const value =
      form && term in glossary
        ? (glossary as unknown as Record<string, Record<string, string>>)[term][form]
        : undefined;
    const raw = value ?? whole;
    return whole.includes(", capitalize") ? capitalize(raw) : raw;
  });

describe("клиника и салон: текст не изменился ни на букву", () => {
  const extrasByKey: Record<string, Record<string, unknown>> = {
    "appointments:payment.cashlessBranchNote": { branch: "Восток" },
    "appointments:conclusion.errors.serviceLineGone": { service: "УЗИ" },
  };

  for (const [key, original] of Object.entries(UNCHANGED_FOR_MASCULINE)) {
    it.each([
      ["clinic", clinic],
      ["beauty", beauty],
    ] as const)(`${key} — %s совпадает с текстом до правки`, (_name, glossary) => {
      const extra = extrasByKey[key] ?? {};
      const expected = renderTemplate(original, glossary, extra);
      expect(render(key, glossary, extra)).toBe(expected);
    });
  }
});
