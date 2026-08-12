/**
 * useWebOtpAutofill — автоподстановка кода из входящей SMS (WebOTP API).
 *
 * Активный механизм: пока форма ждёт код, браузер сам читает пришедшую SMS и
 * отдаёт код без единого тапа. Работает только там, где есть WebOTP —
 * практически это Android Chrome (и другие Chromium-браузеры на Android).
 *
 * ⚠ Обязательное условие — текст SMS должен оканчиваться отдельной последней
 * строкой с привязкой к домену:
 *
 *     Ваш код: 123456
 *
 *     @newcrm.pediatr.kg #123456
 *
 * Без неё браузер не считает SMS относящейся к сайту, и вызов
 * navigator.credentials.get просто никогда не резолвится (не ошибка — вечное
 * ожидание до abort). Ручной ввод при этом работает как обычно.
 * Тикет бэку: MamaDoc/backend_ticket_otp_sms_webotp.md.
 *
 * На iOS/Safari WebOTP не существует — там автоподстановку даёт пассивный
 * autocomplete="one-time-code" на полях ввода (см. OtpCodeInput). Та же строка
 * "@домен #код" нужна и ему: iOS 15+ понимает domain-bound codes и по ним
 * предлагает код надёжнее, чем по языковой эвристике.
 *
 * На десктопе (Chrome/Safari/Firefox на компьютере) автоподстановки кода из
 * SMS нет в принципе — телефон и браузер не связаны. Исключение — macOS Safari
 * при включённом «Пересылка SMS» с iPhone, и там работает всё тот же
 * autocomplete.
 */
import React from "react";

type OtpCredentialLike = { code?: string } | null;

type CredentialsWithOtp = CredentialsContainer & {
  get(options: {
    otp: { transport: string[] };
    signal: AbortSignal;
  }): Promise<OtpCredentialLike>;
};

type Options = {
  /** Форма ждёт код (шаг ввода открыт). Пока false — SMS не слушаем. */
  enabled: boolean;
  /** Вызывается с кодом из SMS (только цифры). */
  onCode: (code: string) => void;
};

export function useWebOtpAutofill({ enabled, onCode }: Options): void {
  // Ref, чтобы эффект не пере-подписывался на каждый ре-рендер: иначе он будет
  // отменять и заново открывать запрос credentials.get при каждом нажатии.
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const credential = await (navigator.credentials as CredentialsWithOtp).get({
          otp: { transport: ["sms"] },
          signal: controller.signal,
        });
        const code = credential?.code?.replace(/\D/g, "") ?? "";
        if (code) onCodeRef.current(code);
      } catch {
        // Отмена (unmount/смена шага), таймаут, отказ в разрешении — ручной
        // ввод остаётся доступен, дополнительной обработки не требуется.
      }
    })();

    return () => controller.abort();
  }, [enabled]);
}

export default useWebOtpAutofill;
