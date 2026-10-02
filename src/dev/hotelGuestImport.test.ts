import { describe, expect, it } from "vitest";

import {
  buildGuestRow,
  extractTable,
  guessField,
  guessMapping,
  markFileDuplicates,
  normalizeDate,
  normalizeGender,
  normalizeImportPhone,
  parseCsv,
} from "./hotelGuestImport";

describe("guessField / guessMapping", () => {
  it("узнаёт колонки по русским и английским заголовкам", () => {
    expect(guessField("ФИО")).toBe("fullName");
    expect(guessField("Телефон гостя")).toBe("phone");
    expect(guessField("Дата рождения")).toBe("dob");
    expect(guessField("Номер паспорта")).toBe("documentNumber");
    expect(guessField("E-mail")).toBe("email");
    expect(guessField("ИНН")).toBe("inn");
    expect(guessField("Сумма")).toBe("skip");
  });

  it("одно поле — на одну колонку", () => {
    expect(guessMapping(["Телефон", "Тел.", "ФИО"])).toEqual(["phone", "skip", "fullName"]);
  });
});

describe("parseCsv", () => {
  it("разделитель «;» из русского Excel и кавычки", () => {
    expect(parseCsv('﻿ФИО;Телефон\r\n"Иванов; Иван";0700123456\r\n\r\n')).toEqual([
      ["ФИО", "Телефон"],
      ["Иванов; Иван", "0700123456"],
    ]);
  });

  it("запятая и экранированные кавычки", () => {
    expect(parseCsv('name,note\nAnna,"say ""hi"""')).toEqual([
      ["name", "note"],
      ["Anna", 'say "hi"'],
    ]);
  });
});

describe("normalizeDate", () => {
  it("строки, Date и серийный номер Excel", () => {
    expect(normalizeDate("01.02.1990")).toBe("1990-02-01");
    expect(normalizeDate("1990-02-01")).toBe("1990-02-01");
    expect(normalizeDate("5/7/1985")).toBe("1985-07-05");
    expect(normalizeDate(new Date(Date.UTC(1990, 1, 1)))).toBe("1990-02-01");
    expect(normalizeDate(32874)).toBe("1990-01-01");
  });

  it("несуществующие даты и мусор — null", () => {
    expect(normalizeDate("31.02.1990")).toBeNull();
    expect(normalizeDate("вчера")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("normalizeGender / normalizeImportPhone", () => {
  it("пол по-русски и по-английски", () => {
    expect(normalizeGender("Ж")).toBe("female");
    expect(normalizeGender("male")).toBe("male");
    expect(normalizeGender("—")).toBe("");
  });

  it("местный номер получает код Кыргызстана", () => {
    expect(normalizeImportPhone("0700 123 456")).toBe("+996700123456");
    expect(normalizeImportPhone("+7 701 123 45 67")).toBe("+77011234567");
    expect(normalizeImportPhone("нет")).toBe("");
  });
});

describe("buildGuestRow", () => {
  const mapping = guessMapping(["Фамилия", "Имя", "Телефон", "Паспорт", "Гражданство", "Дата рождения"]);

  it("собирает ФИО из частей, резидента — по ID-карте", () => {
    const row = buildGuestRow(["асанов", "асан", "0700123456", "ID1234567", "", "01.02.1990"], mapping, 2);
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      fullName: "Асанов Асан",
      phone: "+996700123456",
      guestType: "resident",
      documentType: "id_card",
      documentNumber: "ID1234567",
      dob: "1990-02-01",
    });
    expect(row.key).toBe("p:+996700123456");
  });

  it("иностранец с паспортом, предупреждения вместо ошибок", () => {
    const row = buildGuestRow(["Smith", "John", "", "p 1234567", "UK", "1990/13/45"], mapping, 3);
    expect(row.data).toMatchObject({ fullName: "Smith John", guestType: "foreign", citizenship: "UK", documentType: "passport", documentNumber: "P1234567" });
    expect(row.warnings.some((w) => w.includes("Дата рождения"))).toBe(true);
  });

  it("без ФИО — ошибка, данных нет", () => {
    const row = buildGuestRow(["", "", "0700123456", "", "", ""], mapping, 4);
    expect(row.data).toBeNull();
    expect(row.errors).toEqual(["Нет ФИО"]);
  });
});

describe("markFileDuplicates", () => {
  it("второй гость с тем же телефоном — повтор", () => {
    const mapping = guessMapping(["ФИО", "Телефон"]);
    const rows = markFileDuplicates([
      buildGuestRow(["Иванов Иван", "0700123456"], mapping, 2),
      buildGuestRow(["Иванов И.", "+996 700 123 456"], mapping, 3),
    ]);
    expect(rows[0].data).not.toBeNull();
    expect(rows[1].data).toBeNull();
    expect(rows[1].errors).toEqual(["Повтор строки 2"]);
  });
});

describe("extractTable", () => {
  it("пропускает заголовок и пояснения над шапкой", () => {
    const t = extractTable([
      { line: 1, cells: ["Шаблон импорта гостей"] },
      { line: 2, cells: ["Заполните строки ниже"] },
      { line: 3, cells: [] },
      { line: 4, cells: ["ФИО", "Телефон", "Email"] },
      { line: 5, cells: ["Асанов Асан", "0700123456", null] },
      { line: 6, cells: [null, null, null] },
      { line: 7, cells: ["Бекова Айгерим", "0555123456", "a@b.kg"] },
    ]);
    expect(t.headers).toEqual(["ФИО", "Телефон", "Email"]);
    expect(t.rows.map((r) => r.line)).toEqual([5, 7]);
  });
});
