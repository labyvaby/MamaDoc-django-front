/**
 * Excel для гостей: выгрузка базы, шаблон для импорта и отчёт по
 * незагруженным строкам импорта. Оформление — общее (hotelXlsx.ts).
 */
import dayjs from "dayjs";

import type { HotelGuest } from "../api/hotel";
import { HOTEL_BOOKING_SOURCE_LABELS, HOTEL_GENDER_LABELS, HOTEL_GUEST_TYPE_LABELS } from "./hotelDisplay";
import type { ImportCell } from "./hotelGuestImport";
import { downloadXlsx } from "./hotelXlsx";

const DOC_LABELS: Record<string, string> = { id_card: "ID-карта", passport: "Паспорт" };

export async function exportGuestsXlsx(guests: HotelGuest[], query: string): Promise<void> {
  await downloadXlsx(`Гости ${dayjs().format("DD.MM.YYYY")}.xlsx`, [
    {
      name: "Гости",
      title: "База гостей",
      meta: [query ? `Поиск: «${query}»` : "Все гости", `Гостей: ${guests.length}`],
      tables: [
        {
          columns: [
            { header: "ФИО", width: 30 },
            { header: "Телефон", width: 16 },
            { header: "Email", width: 24 },
            { header: "Дата рождения", kind: "date" },
            { header: "Пол" },
            { header: "Тип гостя" },
            { header: "Гражданство" },
            { header: "Документ" },
            { header: "Номер документа" },
            { header: "ИНН / ПИН" },
            { header: "Срок действия", kind: "date" },
            { header: "Адрес прописки", width: 30 },
            { header: "Откуда узнал" },
            { header: "Проживаний", kind: "int" },
            { header: "Последний визит", kind: "date" },
            { header: "VIP" },
            { header: "Чёрный список" },
            { header: "Согласие на рассылку" },
            { header: "Предпочтения", width: 30 },
          ],
          rows: guests.map((g) => [
            g.fullName,
            g.phone,
            g.email,
            g.dob,
            HOTEL_GENDER_LABELS[g.gender] ?? "",
            HOTEL_GUEST_TYPE_LABELS[g.guestType] ?? "",
            g.citizenship,
            g.documentType ? (DOC_LABELS[g.documentType] ?? g.documentType) : "",
            g.documentNumber ?? "",
            g.inn ?? "",
            g.documentExpiry,
            g.registrationAddress ?? "",
            HOTEL_BOOKING_SOURCE_LABELS[g.source] ?? g.source,
            g.staysCount,
            g.lastStay,
            g.isVip ? "да" : "",
            g.isBlacklisted ? `да${g.blacklistReason ? ` — ${g.blacklistReason}` : ""}` : "",
            g.marketingConsent ? "да" : "",
            g.preferences,
          ]),
        },
      ],
    },
  ]);
}

/** Шаблон с правильными заголовками и одной строкой-примером. */
export async function downloadGuestImportTemplate(): Promise<void> {
  await downloadXlsx("Шаблон импорта гостей.xlsx", [
    {
      name: "Гости",
      title: "Шаблон импорта гостей",
      meta: [
        "Заполните строки ниже шапки таблицы. Обязательно — ФИО; телефон можно без +996.",
        "Даты — ДД.ММ.ГГГГ. Колонки можно переставлять и удалять: при загрузке их можно сопоставить вручную.",
      ],
      tables: [
        {
          columns: [
            { header: "ФИО", width: 30 },
            { header: "Телефон", width: 16 },
            { header: "Email", width: 24 },
            { header: "Дата рождения", width: 14 },
            { header: "Пол" },
            { header: "Гражданство" },
            { header: "Номер документа", width: 16 },
            { header: "ИНН", width: 16 },
            { header: "Срок действия", width: 14 },
            { header: "Адрес прописки", width: 30 },
            { header: "Примечание", width: 30 },
          ],
          rows: [["Асанов Асан Асанович", "0700 123 456", "asan@example.com", "01.02.1990", "М", "Кыргызстан", "ID1234567", "21234567890123", "01.02.2030", "г. Бишкек, ул. Киевская, 1", "Предпочитает тихий номер"]],
        },
      ],
    },
  ]);
}

/** Строки, которые не загрузились (ошибка, повтор, уже в базе) — чтобы поправить и загрузить снова. */
export async function downloadImportReport(headers: string[], items: { line: number; reason: string; cells: ImportCell[] }[]): Promise<void> {
  await downloadXlsx(`Импорт гостей — не загружено ${dayjs().format("DD.MM.YYYY HH-mm")}.xlsx`, [
    {
      name: "Не загружено",
      title: "Импорт гостей: строки, которые не загрузились",
      meta: [`Строк: ${items.length}`, "Исправьте и загрузите этот файл снова — колонки «Строка файла» и «Причина» при загрузке пропустятся."],
      tables: [
        {
          columns: [{ header: "Строка файла", kind: "int" }, { header: "Причина", width: 36 }, ...headers.map((h) => ({ header: h || "—" }))],
          rows: items.map((r) => [r.line, r.reason, ...r.cells.map((c) => (c instanceof Date ? dayjs(c).format("DD.MM.YYYY") : c))]),
        },
      ],
    },
  ]);
}
