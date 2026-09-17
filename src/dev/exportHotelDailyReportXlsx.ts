/**
 * Выгрузка отчёта за день (HotelReportsPage) в .xlsx — тот же приём, что
 * exportDashboardXlsx.ts: exceljs грузится динамическим import, в основной
 * бандл не попадает. Данные уже посчитаны бэкендом (GET /hotel/reports/daily/,
 * см. src/api/hotel.ts), здесь только раскладка в лист. Отчёт — снимок ОДНОГО
 * дня, поэтому строка несёт nightPrice (цена именно этой ночи), не «ночей
 * всего/сумма за проживание» — той стороны у daily-отчёта попросту нет.
 */
import { downloadBlob } from "../utility/download";
import { formatHotelDate } from "./mockDemoData";
import { mapStayDisplayStatus, HOTEL_STAY_STATUS_LABELS } from "./hotelDisplay";
import type { HotelDailyReport } from "../api/hotel";

export async function exportHotelDailyReportXlsx(report: HotelDailyReport): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Отчёт за день");

  ws.columns = [
    { header: "Номер", key: "room", width: 10 },
    { header: "Категория", key: "category", width: 16 },
    { header: "Гость", key: "guest", width: 26 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Заезд", key: "checkIn", width: 14 },
    { header: "Выезд", key: "checkOut", width: 14 },
    { header: "Цена/ночь, сом", key: "price", width: 16 },
  ];

  const title = ws.insertRow(1, [`Отчёт по отелю Viva — ${formatHotelDate(report.date)}`]);
  title.font = { bold: true, size: 14 };
  ws.insertRow(2, [
    `Занято: ${report.occupiedRooms} из ${report.totalRooms} (${report.occupancyPercent}%) · ` +
      `Свободно: ${report.freeRooms} · Заездов: ${report.arrivals} · Выездов: ${report.departures} · ` +
      `Выручка за ночь: ${Number(report.revenue).toLocaleString("ru-RU")} ${report.currency}`,
  ]);
  ws.insertRow(3, []);
  // insertRow(1..3) сдвинул заголовки колонок на 4-ю строку — делаем её жирной отдельно.
  const headerRow = ws.getRow(4);
  headerRow.font = { bold: true };

  for (const row of report.rows) {
    const statusLabel =
      row.occupancy === "occupied" && row.stayStatus
        ? HOTEL_STAY_STATUS_LABELS[mapStayDisplayStatus(row.stayStatus)]
        : row.occupancy === "blocked"
          ? `Блок${row.blockReason ? `: ${row.blockReason}` : ""}`
          : "Свободен";
    ws.addRow({
      room: row.roomNumber,
      category: row.roomTypeName + (row.isLuxury ? " ★" : ""),
      guest: row.guestName || "—",
      status: statusLabel,
      checkIn: row.checkIn ? formatHotelDate(row.checkIn) : "—",
      checkOut: row.checkOut ? formatHotelDate(row.checkOut) : "—",
      price: row.nightPrice ? Number(row.nightPrice) : "—",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `Отчёт Viva ${report.date}.xlsx`);
}
