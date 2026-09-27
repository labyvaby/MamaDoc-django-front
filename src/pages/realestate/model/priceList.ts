import type { Project, Unit } from "../../../api/realestate";
import { formatRooms, outdoorLabel, unitStatusMeta } from "./units";

/** Прайс-лист корпуса в CSV (разделитель «;» — так Excel открывает его без мастера импорта). */
export function priceListCsv(units: Unit[]) {
  const header = [
    "Номер",
    "Секция",
    "Этаж",
    "Тип",
    "Площадь, м²",
    "Цена, сом",
    "Цена за м², сом",
    "Статус",
    "Сторона света",
    "Балкон / терраса",
  ];
  const rows = units
    .slice()
    .sort((a, b) => b.floor - a.floor || a.axis - b.axis)
    .map((u) => [
      u.number,
      u.section,
      u.floor,
      formatRooms(u.rooms),
      String(u.totalArea).replace(".", ","),
      u.price,
      u.pricePerSqm,
      unitStatusMeta[u.status].label,
      u.orientation,
      u.outdoor
        ? `${outdoorLabel[u.outdoor.type]} ${String(u.outdoor.area).replace(".", ",")}`
        : "",
    ]);
  const escape = (value: string | number) => {
    const text = String(value);
    return /[;"\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(escape).join(";")).join("\r\n");
}

/** Скачивает прайс-лист и возвращает имя файла. */
export function downloadPriceList(project: Project, units: Unit[], suffix = "") {
  const file = `price-${project.id}${suffix ? `-${suffix}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM — чтобы Excel распознал UTF-8 и кириллицу.
  const blob = new Blob(["﻿", priceListCsv(units)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file;
  link.click();
  URL.revokeObjectURL(url);
  return file;
}
