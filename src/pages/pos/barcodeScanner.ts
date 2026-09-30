import React from "react";

/**
 * Сканер штрихкодов для кассы.
 *
 * USB/Bluetooth-сканер притворяется клавиатурой: «печатает» код очень быстро
 * (обычно 5–30 мс на символ) и почти всегда жмёт Enter в конце. Человек так
 * быстро не печатает, поэтому сканер узнаём по темпу, а не по полю ввода —
 * код ловится при любом фокусе: в поиске, в поле клиента или вообще без фокуса.
 *
 * Первые символы, пока темп ещё не подтвердился, успевают попасть в поле под
 * фокусом — после подтверждения поле возвращается к прежнему значению, а
 * остальной код и Enter в поле уже не доходят (Enter не нажмёт кнопку «Оплатить»).
 */

export type ScanDetectorOptions = {
  /** Максимальная пауза между символами сканера, мс. */
  maxGap: number;
  /** Сколько быстрых символов подряд считаем сканером. */
  confirmAt: number;
  /** Минимальная длина кода. */
  minLength: number;
  /** Сканер без Enter в конце: код завершён после такой паузы, мс. */
  idleMs: number;
};

export const DEFAULT_SCAN_OPTIONS: ScanDetectorOptions = {
  maxGap: 40,
  confirmAt: 4,
  minLength: 4,
  idleMs: 80,
};

export type ScanKey = {
  key: string;
  code: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** Время нажатия, мс (performance.now()). */
  time: number;
};

export type ScanDecision = {
  /** Не пускать нажатие в поле ввода и дальше по странице. */
  swallow: boolean;
  /** С этого нажатия начался новый быстрый ряд — запомнить поле под фокусом. */
  started: boolean;
  /** Ряд только что подтвердился как сканер — вернуть поле к прежнему значению. */
  confirmed: boolean;
  /** Код готов. */
  complete?: string;
};

const PUNCTUATION: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Period: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Space: " ",
  NumpadDecimal: ".",
  NumpadSubtract: "-",
  NumpadAdd: "+",
  NumpadDivide: "/",
  NumpadMultiply: "*",
};

/**
 * Символ нажатия в латинице. При русской раскладке сканер «печатает» артикул
 * `MONO-42` как `ЬЩТЩ-42`, поэтому букву берём по физической клавише (`code`),
 * а не по `key`.
 */
export function scanChar(event: Pick<ScanKey, "key" | "code" | "shiftKey">): string | null {
  const { key, code, shiftKey } = event;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return shiftKey ? letter[1] : letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit && !shiftKey) return digit[1];
  if (key.length === 1 && key >= " " && key <= "~") return key;
  if (code in PUNCTUATION && !shiftKey) return PUNCTUATION[code];
  return null;
}

export function createScanDetector(options: Partial<ScanDetectorOptions> = {}) {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  let buffer = "";
  let lastAt = -Infinity;
  let confirmed = false;
  /** Когда код завершился по паузе: запоздалый Enter сканера глотаем. */
  let completedAt = -Infinity;

  const reset = () => {
    buffer = "";
    lastAt = -Infinity;
    confirmed = false;
  };
  const pass: ScanDecision = { swallow: false, started: false, confirmed: false };

  return {
    feed(event: ScanKey): ScanDecision {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        reset();
        return pass;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const code = buffer;
        const isScan = confirmed && code.length >= opts.minLength && event.time - lastAt <= opts.idleMs * 4;
        reset();
        if (isScan) return { swallow: true, started: false, confirmed: false, complete: code };
        if (!code && event.time - completedAt <= opts.idleMs * 3) {
          completedAt = -Infinity;
          return { ...pass, swallow: true };
        }
        return pass;
      }
      const char = scanChar(event);
      // Shift, CapsLock и прочие служебные клавиши приходят между символами сканера.
      if (char === null) return { ...pass, swallow: confirmed };
      const started = !buffer || event.time - lastAt > opts.maxGap;
      if (started) {
        buffer = char;
        confirmed = false;
      } else buffer += char;
      lastAt = event.time;
      if (!confirmed && buffer.length >= opts.confirmAt) {
        confirmed = true;
        return { swallow: true, started, confirmed: true };
      }
      return { swallow: confirmed, started, confirmed: false };
    },
    /** Сканер без Enter: код готов после паузы. Иначе медленный ряд сбрасываем. */
    idle(time: number): string | null {
      if (!buffer || time - lastAt < opts.idleMs) return null;
      const code = confirmed && buffer.length >= opts.minLength ? buffer : null;
      reset();
      if (code) completedAt = time;
      return code;
    },
    reset,
    get active() {
      return confirmed;
    },
  };
}

type TextField = HTMLInputElement | HTMLTextAreaElement;
const TEXT_INPUT_TYPES = new Set(["", "text", "search", "tel", "number", "email", "url", "password"]);

const asTextField = (target: EventTarget | null): TextField | null => {
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)) return target;
  return null;
};

/** Вернуть значение так, чтобы React-контролируемое поле тоже его увидело. */
function restoreField(snapshot: { field: TextField; value: string; start: number | null; end: number | null }) {
  const { field, value, start, end } = snapshot;
  if (field.value === value) return;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    if (start !== null && end !== null) field.setSelectionRange(start, end);
  } catch {
    // number/email не поддерживают выделение — значение уже возвращено.
  }
}

/**
 * Слушает сканер по всей странице. `onScan` вызывается с готовым кодом;
 * последняя версия колбэка берётся из ref, поэтому подписка не пересоздаётся.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = React.useRef(onScan);
  handler.current = onScan;

  React.useEffect(() => {
    if (!enabled) return;
    const detector = createScanDetector();
    let snapshot: Parameters<typeof restoreField>[0] | null = null;
    let timer: number | undefined;

    const finish = (code: string) => {
      if (snapshot) restoreField(snapshot);
      snapshot = null;
      handler.current(code);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const decision = detector.feed({
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        time: performance.now(),
      });
      if (decision.started) {
        const field = asTextField(event.target);
        snapshot = field
          ? { field, value: field.value, start: field.selectionStart, end: field.selectionEnd }
          : null;
      }
      if (decision.confirmed && snapshot) restoreField(snapshot);
      if (decision.swallow) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      window.clearTimeout(timer);
      if (decision.complete) {
        finish(decision.complete);
        return;
      }
      if (detector.active) {
        timer = window.setTimeout(() => {
          const code = detector.idle(performance.now());
          if (code) finish(code);
        }, DEFAULT_SCAN_OPTIONS.idleMs + 15);
      }
    };

    // Фаза перехвата на window — раньше обработчиков React и полей ввода.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
    };
  }, [enabled]);
}

/** Короткий звук: кассир слышит результат, не глядя на экран. */
export function playScanFeedback(ok: boolean) {
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const tones = ok ? [[1320, 0, 0.07]] : [[330, 0, 0.12], [247, 0.16, 0.18]];
    for (const [frequency, start, duration] of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = ok ? "sine" : "square";
      gain.gain.value = 0.06;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + duration);
    }
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // Звук — только подсказка; без него касса работает так же.
  }
}
