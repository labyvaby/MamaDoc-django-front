import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import common from "../locales/ru/common.json";
import patients from "../locales/ru/patients.json";
import appointments from "../locales/ru/appointments.json";
import settings from "../locales/ru/settings.json";
import employees from "../locales/ru/employees.json";
import salaryReports from "../locales/ru/salaryReports.json";
import sales from "../locales/ru/sales.json";
import vaccinations from "../locales/ru/vaccinations.json";
import reviews from "../locales/ru/reviews.json";
import cashbox from "../locales/ru/cashbox.json";
import load from "../locales/ru/load.json";
import doctor from "../locales/ru/doctor.json";
import reports from "../locales/ru/reports.json";
import sidebar from "../locales/ru/sidebar.json";
import bookings from "../locales/ru/bookings.json";
import client from "../locales/ru/client.json";
import publicBooking from "../locales/ru/publicBooking.json";
import { capitalize, lower } from "./formatters";

/**
 * Неймспейсы = модули приложения. Один JSON на модуль, чтобы файлы
 * оставались обозримыми и правки разных команд не конфликтовали.
 * Новый модуль: добавить JSON в src/locales/ru/ и ключ сюда.
 */
export const resources = {
  ru: { common, patients, appointments, settings, employees, salaryReports, sales, vaccinations, reviews, cashbox, load, doctor, reports, sidebar, bookings, client, publicBooking },
} as const;

export type Namespace = keyof (typeof resources)["ru"];

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "ru",
    fallbackLng: "ru",
    defaultNS: "common",
    // Строки живут в JSON, а не в коде: ключ «patients.title» — это ключ,
    // а не текст по умолчанию.
    nsSeparator: ":",
    keySeparator: ".",
    interpolation: {
      // React экранирует сам; двойное экранирование ломает кавычки и «…».
      escapeValue: false,
    },
    returnNull: false,
    // В деве отсутствующий ключ должен быть заметен, а не молча пуст.
    saveMissing: false,
    debug: false,
  });

i18n.services.formatter?.add("capitalize", (value) =>
  typeof value === "string" ? capitalize(value) : String(value)
);
i18n.services.formatter?.add("lower", (value) =>
  typeof value === "string" ? lower(value) : String(value)
);

export default i18n;
