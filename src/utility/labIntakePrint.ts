/**
 * Что печатать после успешного приёма (или успешного повтора отправки).
 *
 * Три формы собираются разом из одного и того же чека (`LabReceipt`) —
 * дровер зовёт эту функцию один раз и получает готовый HTML для каждой из
 * трёх кнопок печати (lab-frontend-design.md, раздел «Печать»). Сама печать
 * (`window.open`) — в `printHtml` (`labLabels.ts`) и здесь не проверяется:
 * окна браузера в vitest нет, поэтому тестируется только то, что можно
 * проверить без него — собранный HTML.
 */

import { buildLabelsHtml, buildPreparationHtml, buildTicketHtml, looksLikePngBase64, type LabelData } from "./labLabels";
import { formatDateRu } from "./format";
import type { LabReceipt } from "../api/lab";

export interface LabIntakePrintoutsInput {
  receipt: LabReceipt;
  patientName: string;
  /** ISO-дата из карты пациента (`DjangoPatient.birthDate`) — на печать идёт уже в формате дд.мм.гггг. */
  patientBirthDate: string | null;
  preparationTexts: string[];
}

export interface LabIntakePrintouts {
  labels: string;
  /**
   * `null`, когда ЛИС прислала под регистрационным листом не картинку.
   * Сегодня это единственный возможный исход: `ticket` отдаёт
   * сериализованный Java-объект JasperPrint, а не PNG (находка 17 в
   * `MamaDoc-backend/docs/lab-intake-live-findings.md`) — вставить такое в
   * `data:image/png;base64` нельзя, и печать дала бы битый лист. Проверяем
   * формат, а не статус заказа: если бэкенд однажды начнёт отдавать
   * настоящую картинку, печать заработает сама, без правок здесь.
   */
  ticket: string | null;
  preparation: string;
}

export function buildLabIntakePrintouts(input: LabIntakePrintoutsInput): LabIntakePrintouts {
  const data: LabelData = {
    patientName: input.patientName,
    birthDate: formatDateRu(input.patientBirthDate),
    orderCode: input.receipt.order.lisOrderCode,
    barcodeBase64: input.receipt.barcodeBase64,
  };
  return {
    labels: buildLabelsHtml(data),
    ticket: looksLikePngBase64(input.receipt.ticketBase64)
      ? buildTicketHtml({ ...data, ticketBase64: input.receipt.ticketBase64 })
      : null,
    preparation: buildPreparationHtml(data, input.preparationTexts),
  };
}
