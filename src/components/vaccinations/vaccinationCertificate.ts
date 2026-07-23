import dayjs from "dayjs";

import type { DjangoPatient } from "../../api/patients";
import type { VaccinationRecord, VaccinationScheduleSlot } from "../../api/vaccinations";
import { injectionSiteLabel } from "../../pages/vaccinations/meta";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

/**
 * Печать прививочного сертификата пациента (выписка из электронной карты).
 * Открывает отдельное окно с самодостаточным HTML и вызывает печать. Это
 * внутренний документ клиники по её собственным данным — без гос-брендинга.
 */
export function printVaccinationCertificate(
  patient: DjangoPatient,
  records: VaccinationRecord[],
  upcoming: VaccinationScheduleSlot[],
): void {
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) return;

  const done = records
    .filter((r) => r.status !== "canceled")
    .sort((a, b) => a.administeredAt.localeCompare(b.administeredAt));

  const doneRows = done
    .map(
      (r) => `<tr>
        <td>${dayjs(r.administeredAt).format("DD.MM.YYYY")}</td>
        <td>${esc(r.vaccineName)}</td>
        <td>${r.doseNumber}</td>
        <td>${esc(injectionSiteLabel(r.injectionSite))}</td>
        <td>${r.isExternal ? "внешняя" : "в клинике"}</td>
        <td>${r.administeredBy ? esc(r.administeredBy.fullName) : "—"}</td>
      </tr>`,
    )
    .join("");

  const upcomingRows = [...upcoming]
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .map(
      (s) => `<tr>
        <td>${dayjs(s.scheduledDate).format("DD.MM.YYYY")}</td>
        <td>${esc(s.vaccineName)}</td>
        <td>${s.doseNumber}</td>
        <td>${s.status === "overdue" ? "просрочено" : "план"}</td>
      </tr>`,
    )
    .join("");

  const dob = patient.birthDate ? dayjs(patient.birthDate).format("DD.MM.YYYY") : "—";

  win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
    <title>Прививочный сертификат — ${esc(patient.fullName)}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color:#1a1a1a; margin:32px; }
      h1 { font-size:20px; margin:0 0 4px; }
      .sub { color:#666; font-size:13px; margin-bottom:20px; }
      .meta { margin-bottom:8px; font-size:14px; }
      .meta div { margin-bottom:4px; }
      .meta b { display:inline-block; min-width:150px; color:#444; font-weight:600; }
      h2 { font-size:13px; text-transform:uppercase; letter-spacing:.5px; color:#555; margin:24px 0 8px; border-bottom:1px solid #ddd; padding-bottom:4px; }
      table { width:100%; border-collapse:collapse; font-size:13px; }
      th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #eee; vertical-align:top; }
      th { color:#666; font-weight:600; font-size:11px; text-transform:uppercase; }
      .empty { color:#999; font-size:13px; padding:8px 0; }
      .foot { margin-top:32px; font-size:11px; color:#999; }
      @media print { body { margin:12mm; } }
    </style></head><body>
    <h1>Прививочный сертификат</h1>
    <div class="sub">Выписка из электронной карты пациента</div>
    <div class="meta">
      <div><b>Пациент:</b> ${esc(patient.fullName)}</div>
      <div><b>Дата рождения:</b> ${dob}</div>
      ${patient.phone ? `<div><b>Телефон:</b> ${esc(patient.phone)}</div>` : ""}
      <div><b>Дата выписки:</b> ${dayjs().format("DD.MM.YYYY")}</div>
    </div>
    <h2>Проведённые прививки</h2>
    ${
      done.length
        ? `<table><thead><tr><th>Дата</th><th>Вакцина</th><th>Доза</th><th>Место</th><th>Тип</th><th>Кто вводил</th></tr></thead><tbody>${doneRows}</tbody></table>`
        : `<div class="empty">Нет данных о проведённых прививках.</div>`
    }
    ${
      upcoming.length
        ? `<h2>Предстоящие прививки</h2><table><thead><tr><th>Дата</th><th>Вакцина</th><th>Доза</th><th>Статус</th></tr></thead><tbody>${upcomingRows}</tbody></table>`
        : ""
    }
    <div class="foot">Документ сформирован автоматически из электронной карты пациента.</div>
  </body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 250);
}
