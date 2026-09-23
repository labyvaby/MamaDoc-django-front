/**
 * Распознавание фото документа гостя — общая логика AddGuestDrawer и
 * CreateBookingButton. Замена simulatePassportScan из мока на реальный
 * POST /hotel/guests/scan-document/ (контракт v2.2, §4.4; см. scanGuestDocument
 * в src/api/hotel.ts).
 *
 * Само фото всё равно прикрепляется к форме и уходит отдельным запросом
 * после создания гостя/брони — распознавание лишь дополнительно подставляет
 * поля. Поэтому кнопка «Фото паспорта» остаётся всегда, а прячется именно
 * «попытка распознать» (`available`): нет права hotel.guests.documents (скан
 * его требует) либо бэкенд ответил 503 RECOGNITION_UNAVAILABLE — провайдер
 * не настроен на стенде или лежит. Второе запоминается до перезагрузки
 * страницы, чтобы не ждать заведомо провальный запрос на каждое фото.
 *
 * Результат отдаётся вызывающему коду (`scan` → HotelGuestDocumentScan | null):
 * какие именно поля формы заполнять, решает форма — у AddGuestDrawer и
 * CreateBookingButton они разные. Пояснение для пользователя («проверьте»,
 * «заполните вручную») — в `notice`.
 */
import React from "react";
import { LinearProgress } from "@mui/material";

import { useCan } from "../hooks/useCan";
import { ApiError, getErrorMessage, isAbortError } from "../api/client";
import { scanGuestDocument, type HotelGuestDocumentScan } from "../api/hotel";
import { isPdfFile, prepareImageForUpload } from "../utility/imageCompression";

/** Ниже этого confidence поля стоит перепроверить (контракт §4.4). */
export const SCAN_LOW_CONFIDENCE = 0.6;

export interface DocumentScanNotice {
  severity: "info" | "warning";
  text: string;
  /** Что модель сочла сомнительным (блик, обрезанный край…) — как пришло от бэкенда. */
  warnings: string[];
}

// ── «провайдер недоступен» — один флаг на страницу, а не на экземпляр формы ──

let providerUnavailable = false;
const providerUnavailableListeners = new Set<() => void>();

function markProviderUnavailable(): void {
  if (providerUnavailable) return;
  providerUnavailable = true;
  providerUnavailableListeners.forEach((notify) => notify());
}

function subscribeProviderUnavailable(onChange: () => void): () => void {
  providerUnavailableListeners.add(onChange);
  return () => providerUnavailableListeners.delete(onChange);
}

function getProviderUnavailableSnapshot(): boolean {
  return providerUnavailable;
}

// ── подготовка файла и тексты ────────────────────────────────────────────────

/**
 * Годится ли выбранный файл как фото документа: картинка (в т.ч. HEIC — у него
 * MIME часто пустой, поэтому ещё и по расширению) или PDF.
 */
export function isDocumentFile(file: File): boolean {
  return isPdfFile(file) || file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Файл для распознавания и последующей загрузки: HEIC с телефона бэкенд не
 * читает (в контракте — «фронт конвертирует»), поэтому картинки прогоняем через
 * prepareImageForUpload (jpg, ≤8 МБ), PDF отдаём как есть. null — картинку не
 * удалось прочитать.
 */
export async function prepareDocumentFile(file: File): Promise<File | null> {
  return isPdfFile(file) ? file : prepareImageForUpload(file);
}

function describeScan(scan: HotelGuestDocumentScan): DocumentScanNotice {
  const doubtful = scan.confidence < SCAN_LOW_CONFIDENCE || scan.warnings.length > 0;
  return {
    severity: doubtful ? "warning" : "info",
    text:
      scan.confidence < SCAN_LOW_CONFIDENCE
        ? "Реквизиты подставлены по фото, но распознавание неуверенное — проверьте каждое поле."
        : "Реквизиты подставлены по фото — проверьте перед сохранением.",
    warnings: scan.warnings,
  };
}

function describeScanError(err: unknown): DocumentScanNotice {
  const code = err instanceof ApiError ? err.code : null;
  const text =
    code === "RECOGNITION_UNAVAILABLE"
      ? "Автоматическое распознавание сейчас недоступно — заполните поля вручную."
      : code === "DOCUMENT_NOT_RECOGNIZED"
      ? "Не удалось распознать документ на фото — заполните поля вручную."
      : code === "RECOGNITION_RATE_LIMITED"
      ? "Слишком много запросов на распознавание — подождите минуту или заполните поля вручную."
      : `${getErrorMessage(err, "Не удалось распознать документ")} Заполните поля вручную.`;
  return { severity: code === "RECOGNITION_UNAVAILABLE" ? "info" : "warning", text, warnings: [] };
}

/**
 * Ожидаемая длительность распознавания (контракт §4.4: обычно 3–8 с) — база
 * для имитации прогресса ниже. Настоящего процента бэкенд не отдаёт: ответ
 * приходит одним куском, поэтому полоска растёт сама по себе.
 */
const EXPECTED_SCAN_MS = 6000;
/** Полоска никогда не доходит до имитируемого предела сама — только по ответу бэкенда. */
const SCAN_PROGRESS_CEILING = 92;

export function useDocumentScan() {
  const canReadDocuments = useCan("hotel.guests.documents");
  const providerDown = React.useSyncExternalStore(subscribeProviderUnavailable, getProviderUnavailableSnapshot);
  const [scanning, setScanning] = React.useState(false);
  // Имитация прогресса: быстрый старт, плавное замедление к SCAN_PROGRESS_CEILING —
  // «дошло» до 100% только когда реально пришёл ответ (см. finishScan ниже).
  const [scanProgress, setScanProgress] = React.useState(0);
  const [notice, setNotice] = React.useState<DocumentScanNotice | null>(null);
  const progressTimerRef = React.useRef<number | null>(null);

  const stopProgressTimer = React.useCallback(() => {
    if (progressTimerRef.current != null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  // Таймер не должен пережить размонтированную форму (закрыли дровер посреди скана).
  React.useEffect(() => stopProgressTimer, [stopProgressTimer]);

  const scan = React.useCallback(async (file: File): Promise<HotelGuestDocumentScan | null> => {
    setScanning(true);
    setNotice(null);
    setScanProgress(6); // стартовый рывок — ощущается отзывчивее, чем ровный ноль
    const startedAt = Date.now();
    stopProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const eased = SCAN_PROGRESS_CEILING * (1 - Math.exp(-elapsed / EXPECTED_SCAN_MS));
      setScanProgress(Math.max(6, eased));
    }, 120);

    // Полоска добегает до 100% на реальном ответе, задержка перед скрытием —
    // чтобы «100%» было видно, а не мигало сразу тем же кадром.
    const finishScan = (notice: DocumentScanNotice) => {
      stopProgressTimer();
      setScanProgress(100);
      setNotice(notice);
      window.setTimeout(() => setScanning(false), 350);
    };

    try {
      const result = await scanGuestDocument(file);
      finishScan(describeScan(result));
      return result;
    } catch (err) {
      if (isAbortError(err)) {
        stopProgressTimer();
        setScanning(false);
        return null;
      }
      if (err instanceof ApiError && err.code === "RECOGNITION_UNAVAILABLE") markProviderUnavailable();
      finishScan(describeScanError(err));
      return null;
    }
  }, [stopProgressTimer]);

  const clearNotice = React.useCallback(() => setNotice(null), []);

  return {
    /** Есть смысл пробовать распознавание: право есть и провайдер ещё не отвечал 503. */
    available: canReadDocuments && !providerDown,
    scanning,
    /** 0–100, имитация — см. комментарий у EXPECTED_SCAN_MS. Смысл есть, только пока scanning. */
    scanProgress,
    notice,
    clearNotice,
    scan,
  };
}

/** Полоска прогресса распознавания — общая для AddGuestDrawer и CreateBookingButton. */
export const ScanProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <LinearProgress
    variant="determinate"
    value={value}
    aria-label="Распознаём документ"
    sx={{
      width: 96,
      height: 6,
      borderRadius: 3,
      "& .MuiLinearProgress-bar": { borderRadius: 3, transition: "transform .15s linear" },
    }}
  />
);
