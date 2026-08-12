/**
 * OtpCodeInput.tsx
 * Раздельный ввод кода подтверждения (OTP) из отдельных ячеек.
 *
 * Возможности:
 * - авто-переход к следующей ячейке при вводе цифры, назад по Backspace;
 * - вставка (paste) всего кода — раскладывается по ячейкам;
 * - SMS-autofill (autoComplete="one-time-code"): браузер вставляет весь код в
 *   ячейку, он распределяется по остальным;
 * - авто-сабмит: когда заполнены все ячейки, вызывается onComplete(value).
 *
 * ⚠ Два условия автоподстановки на iOS Safari, которые легко сломать:
 * 1) autoComplete="one-time-code" стоит на КАЖДОЙ ячейке — при "off" на
 *    остальных Safari либо не предлагает код вовсе, либо вставляет одну цифру;
 * 2) у ячеек НЕТ maxLength — автозаполнение вставляет весь код в одну ячейку,
 *    а maxLength={1} обрезал бы его до первой цифры ещё до onChange (та же
 *    ловушка, что и при вставке телефона с кодом страны). Ограничение в одну
 *    цифру держится логикой handleChange, а не атрибутом.
 *
 * Только цифры. Значение контролируемое (value/onChange) — строка из цифр.
 *
 * ⚠ onComplete получает готовый код аргументом и вызывается синхронно сразу за
 * onChange — на этот момент состояние у родителя ещё старое (без последней
 * цифры). Обработчик обязан брать код из аргумента, а не из своего state.
 *
 * Длина кода (length) по умолчанию 6 — соответствует Django SMS.
 */
import React from "react";
import { Stack, TextField } from "@mui/material";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

const OtpCodeInput: React.FC<Props> = ({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
}) => {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  const digits = React.useMemo(() => {
    const clean = value.replace(/\D/g, "").slice(0, length).split("");
    return Array.from({ length }, (_, i) => clean[i] ?? "");
  }, [value, length]);

  const focusIndex = (i: number) => {
    const clamped = Math.max(0, Math.min(length - 1, i));
    const el = inputsRef.current[clamped];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const handleChange = (index: number, raw: string) => {
    let only = raw.replace(/\D/g, "");

    // Ячейка без maxLength — при обычном наборе поверх занятой ячейки браузер
    // может отдать "старая+новая" цифру (курсор в конце, выделения нет).
    // Отбрасываем старую: иначе она уехала бы в соседнюю ячейку.
    const prev = digits[index];
    if (prev && only.length === 2 && only.startsWith(prev)) only = only.slice(1);

    // Пустой ввод — очистка текущей ячейки (без авто-сабмита).
    if (!only) {
      const arr = [...digits];
      arr[index] = "";
      onChange(arr.join(""));
      return;
    }

    // Одна или несколько цифр (ручной ввод / вставка / SMS-autofill) —
    // раскладываем начиная с текущей ячейки.
    const arr = [...digits];
    let idx = index;
    for (const ch of only.split("")) {
      if (idx >= length) break;
      arr[idx] = ch;
      idx += 1;
    }
    commit(arr.join(""));
    focusIndex(idx);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = [...digits];
      if (arr[index]) {
        arr[index] = "";
        onChange(arr.join(""));
      } else if (index > 0) {
        arr[index - 1] = "";
        onChange(arr.join(""));
        focusIndex(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusIndex(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    e.preventDefault();
    commit(text);
    focusIndex(text.length);
  };

  return (
    <Stack direction="row" spacing={1} justifyContent="center">
      {Array.from({ length }).map((_, i) => (
        <TextField
          key={i}
          inputRef={(el: HTMLInputElement | null) => (inputsRef.current[i] = el)}
          value={digits[i]}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e as React.KeyboardEvent<HTMLInputElement>)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputProps={{
            inputMode: "numeric",
            autoComplete: "one-time-code",
            name: `otp-${i + 1}`,
            "aria-label": `Цифра ${i + 1}`,
            style: {
              textAlign: "center",
              fontSize: 20,
              fontWeight: 600,
              padding: "10px 0",
            },
          }}
          sx={{ width: 44 }}
        />
      ))}
    </Stack>
  );
};

export default OtpCodeInput;
