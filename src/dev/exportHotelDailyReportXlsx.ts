/**
 * Выгрузка отчёта за день (HotelReportsPage) в .xlsx — тот же приём, что
 * exportDashboardXlsx.ts: exceljs грузится динамическим import, в основной
 * бандл не попадает. Данные уже посчитаны на странице (getHotelDailyReport),
 * здесь только раскладка в лист.
 */
import { downloadBlob } from "../utility/download";
import {
  formatHotelDate,
  nightsBetween,
  HOTEL_BOOKING_STATUS_LABELS,
  type HotelDailyReport,
} from "./mockDemoData";

export async function exportHotelDailyReportXlsx(report: HotelDailyReport): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Отчёт за день");

  ws.columns = [
    { header: "Номер", key: "room", width: 10 },
    { header: "Категория", key: "category", width: 16 },
    { header: "Гость", key: "guest", width: 26 },
    { header: "Статус", key: "status", width: 16 },
    { header: "Заезд", key: "checkIn", width: 14 },
    { header: "Выезд", key: "checkOut", width: 14 },
    { header: "Ночей", key: "nights", width: 10 },
    { header: "Цена/ночь, сом", key: "price", width: 16 },
    { header: "Сумма проживания, сом", key: "amount", width: 20 },
  ];

  const title = ws.insertRow(1, [`Отчёт по отелю Viva — ${formatHotelDate(report.date)}`]);
  title.font = { bold: true, size: 14 };
  ws.insertRow(2, [
    `Занято: ${report.occupiedRooms} из ${report.totalRooms} (${report.occupancyPercent}%) · ` +
      `Свободно: ${report.freeRooms} · Заездов: ${report.arrivals} · Выездов: ${report.departures} · ` +
      `Выручка за ночь: ${report.revenue.toLocaleString("ru-RU")} сом`,
  ]);
  ws.insertRow(3, []);
  // insertRow(1..3) сдвинул заголовки колонок на 4-ю строку — делаем её жирной отдельно.
  const headerRow = ws.getRow(4);
  headerRow.font = { bold: true };

  for (const row of report.rows) {
    const b = row.booking;
    ws.addRow({
      room: row.room,
      category: row.categoryName + (row.luxury ? " ★" : ""),
      guest: b?.guestName ?? "—",
      status: b ? HOTEL_BOOKING_STATUS_LABELS[b.status] : "Свободен",
      checkIn: b ? formatHotelDate(b.checkIn) : "—",
      checkOut: b ? formatHotelDate(b.checkOut) : "—",
      nights: b ? nightsBetween(b.checkIn, b.checkOut) : "—",
      price: row.pricePerNight,
      amount: b ? row.pricePerNight * nightsBetween(b.checkIn, b.checkOut) : "—",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `Отчёт Viva ${report.date}.xlsx`);
}
