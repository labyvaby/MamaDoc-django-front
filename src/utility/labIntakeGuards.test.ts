import { describe, it, expect } from "vitest";

import { intakeBlockReason, type IntakeState } from "./labIntakeGuards";

const ready = (over: Partial<IntakeState> = {}): IntakeState => ({
  patientId: 9622,
  patientInn: "12345678901234",
  patientBirthDate: "1990-05-17",
  patientGender: "female",
  lineCount: 1,
  requiredQuestionIds: [],
  answers: {},
  total: 250,
  paidCash: 250,
  paidCard: 0,
  cashlessMethodId: null,
  cashlessMethodRequired: false,
  settingsLoading: false,
  settingsFailed: false,
  sectionConfigured: true,
  referralRequiredFor: [],
  referringDoctorId: null,
  personalDataConsent: true,
  ...over,
});

describe("intakeBlockReason", () => {
  it("полный набор данных не блокирует", () => {
    expect(intakeBlockReason(ready())).toBeNull();
  });

  it("настройки раздела ещё грузятся — блокирует", () => {
    expect(intakeBlockReason(ready({ settingsLoading: true }))).toBe(
      "Загружаем настройки раздела…",
    );
  });

  it("запрос настроек не удался — блокирует другим текстом", () => {
    expect(intakeBlockReason(ready({ settingsFailed: true }))).toBe(
      "Не удалось загрузить настройки раздела — обновите страницу",
    );
  });

  it("раздел лаборатории не настроен у организации", () => {
    expect(intakeBlockReason(ready({ sectionConfigured: false }))).toBe(
      "Раздел лаборатории не настроен — обратитесь к администратору",
    );
  });

  it("порядок причин: не настроенный раздел важнее отсутствующего пациента", () => {
    // Регистратор может выбрать пациента сам, а завести организации
    // конфигурацию раздела — нет; причина, которую он не может закрыть сам,
    // обязана называться первой.
    expect(
      intakeBlockReason(ready({ sectionConfigured: false, patientId: null })),
    ).toBe("Раздел лаборатории не настроен — обратитесь к администратору");
  });

  it("порядок причин: загрузка настроек важнее их отсутствия", () => {
    expect(
      intakeBlockReason(
        ready({ settingsLoading: true, sectionConfigured: false }),
      ),
    ).toBe("Загружаем настройки раздела…");
  });

  it("без пациента", () => {
    expect(intakeBlockReason(ready({ patientId: null }))).toBe(
      "Выберите пациента",
    );
  });

  it("без ИНН", () => {
    expect(intakeBlockReason(ready({ patientInn: "" }))).toBe(
      "Заполните ИНН пациента",
    );
  });

  it("пробельный ИНН считается пустым", () => {
    expect(intakeBlockReason(ready({ patientInn: "   " }))).toBe(
      "Заполните ИНН пациента",
    );
  });

  it("без даты рождения", () => {
    expect(intakeBlockReason(ready({ patientBirthDate: null }))).toBe(
      "Заполните дату рождения пациента",
    );
  });

  it("пол unknown блокирует", () => {
    // В ЛИС пол принимает только два значения; unknown — значение по
    // умолчанию в карте пациента, и отправить такой заказ нечем.
    expect(intakeBlockReason(ready({ patientGender: "unknown" }))).toBe(
      "Укажите пол пациента",
    );
  });

  it("пустая корзина", () => {
    expect(intakeBlockReason(ready({ lineCount: 0 }))).toBe(
      "Добавьте хотя бы один анализ",
    );
  });

  it("вопрос без ответа", () => {
    expect(
      intakeBlockReason(ready({ requiredQuestionIds: [9], answers: {} })),
    ).toBe("Ответьте на все вопросы");
  });

  it("пробельный ответ считается отсутствующим", () => {
    expect(
      intakeBlockReason(
        ready({ requiredQuestionIds: [9], answers: { 9: "   " } }),
      ),
    ).toBe("Ответьте на все вопросы");
  });

  it("отвеченный вопрос не блокирует", () => {
    expect(
      intakeBlockReason(
        ready({ requiredQuestionIds: [9], answers: { 9: "FIRST_TERM" } }),
      ),
    ).toBeNull();
  });

  it("оплата меньше суммы", () => {
    expect(intakeBlockReason(ready({ paidCash: 100 }))).toBe(
      "Оплата не совпадает с суммой заказа",
    );
  });

  it("оплата больше суммы тоже блокирует", () => {
    // Долг по анализам не допускается ни в одну сторону: переплату бэкенд
    // отвергнет так же, как недоплату.
    expect(intakeBlockReason(ready({ paidCash: 300 }))).toBe(
      "Оплата не совпадает с суммой заказа",
    );
  });

  it("смешанная оплата в сумме совпадает", () => {
    expect(
      intakeBlockReason(ready({ paidCash: 150, paidCard: 100 })),
    ).toBeNull();
  });

  it("оплата картой без выбранного способа безнала блокирует, когда способ обязателен", () => {
    // Прецедент — warehouse.services._resolve_sale_cashless_method и
    // соседние денежные формы (DjangoAddExpenseDrawer): оплата картой без
    // способа — дыра в кассовом учёте, хотя сам бэкенд приёма анализов это
    // пропустит (ensure_cashless_method_valid при None ничего не проверяет).
    expect(
      intakeBlockReason(
        ready({
          paidCash: 0,
          paidCard: 250,
          cashlessMethodId: null,
          cashlessMethodRequired: true,
        }),
      ),
    ).toBe("Выберите способ безналичной оплаты");
  });

  it("оплата картой с выбранным способом не блокирует", () => {
    expect(
      intakeBlockReason(
        ready({
          paidCash: 0,
          paidCard: 250,
          cashlessMethodId: 7,
          cashlessMethodRequired: true,
        }),
      ),
    ).toBeNull();
  });

  it("справочник способов пуст — оплата картой без способа не блокируется", () => {
    // Организации нечего предложить (справочник загружен и пуст, либо
    // способ безнала как класс отключён) — требовать выбор было бы тупиком,
    // как и в DjangoAddExpenseDrawer (cashlessMethodRequired = isRequired).
    expect(
      intakeBlockReason(
        ready({
          paidCash: 0,
          paidCard: 250,
          cashlessMethodId: null,
          cashlessMethodRequired: false,
        }),
      ),
    ).toBeNull();
  });

  it("оплата наличными не требует способа безнала", () => {
    expect(
      intakeBlockReason(
        ready({
          paidCash: 250,
          paidCard: 0,
          cashlessMethodId: null,
          cashlessMethodRequired: true,
        }),
      ),
    ).toBeNull();
  });

  it("порядок причин: несовпадение суммы важнее невыбранного способа безнала", () => {
    expect(
      intakeBlockReason(
        ready({
          paidCash: 100,
          paidCard: 50,
          cashlessMethodId: null,
          cashlessMethodRequired: true,
        }),
      ),
    ).toBe("Оплата не совпадает с суммой заказа");
  });

  it("копеечная погрешность не блокирует", () => {
    // 0.1 + 0.2 в двоичной арифметике даёт 0.30000000000000004; сравнивать
    // деньги строгим равенством нельзя.
    expect(
      intakeBlockReason(ready({ total: 0.3, paidCash: 0.1, paidCard: 0.2 })),
    ).toBeNull();
  });

  it("порядок причин: пациент важнее корзины", () => {
    expect(intakeBlockReason(ready({ patientId: null, lineCount: 0 }))).toBe(
      "Выберите пациента",
    );
  });
});

describe("направивший врач", () => {
  it("анализ с требованием направления блокирует приём без врача", () => {
    // Признак приходит из каталога ЛИС (`requiresDoctor`): такой анализ
    // лаборатория делает только по направлению. Без имени в тексте
    // регистратор не поймёт, какую строку корзины убрать, если врача нет.
    expect(
      intakeBlockReason(
        ready({ referralRequiredFor: ["Гормоны Т4", "Кортизол"] }),
      ),
    ).toBe("Укажите направившего врача — его требуют: Гормоны Т4, Кортизол");
  });

  it("выбранный врач снимает блокировку", () => {
    expect(
      intakeBlockReason(
        ready({ referralRequiredFor: ["Гормоны Т4"], referringDoctorId: 12 }),
      ),
    ).toBeNull();
  });

  it("обычной корзине врач не нужен", () => {
    expect(intakeBlockReason(ready({ referringDoctorId: null }))).toBeNull();
  });
});

describe("согласие на обработку персональных данных", () => {
  it("без согласия приём заблокирован с понятной причиной", () => {
    // Заказ уезжает в стороннюю лабораторию вместе с ФИО, ИНН и датой
    // рождения — без зафиксированного согласия делать это нельзя.
    expect(intakeBlockReason(ready({ personalDataConsent: false }))).toBe(
      "Отметьте согласие пациента на обработку персональных данных",
    );
  });

  it("согласие проверяется после данных пациента, но до корзины", () => {
    // Порядок причин — от общего к частному: сначала кто пациент, потом его
    // согласие, потом что заказываем.
    expect(
      intakeBlockReason(ready({ personalDataConsent: false, lineCount: 0 })),
    ).toBe("Отметьте согласие пациента на обработку персональных данных");
  });
});
