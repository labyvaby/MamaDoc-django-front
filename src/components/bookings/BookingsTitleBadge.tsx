import React from "react";

import { useNewBookings } from "../../hooks/useNewBookings";
import { useTitleContext } from "../../contexts/title-context";

/**
 * Новые заявки в заголовке вкладки браузера: «(3) Регистратура | Aximo» и точка
 * на иконке вкладки.
 *
 * Регистратура держит CRM открытой в фоне, за почтой и мессенджером — ни бейдж
 * в сайдбаре, ни колокольчик в этот момент не видны, а заявка ждёт звонка.
 * Заголовок вкладки виден всегда, даже когда страница не на экране.
 *
 * Рендерит null: это чистый сайд-эффект, смонтированный один раз в layout.
 */

/** Иконка вкладки с красной точкой — рисуется один раз на вкладку. */
let badgedIconPromise: Promise<string | null> | null = null;

function renderBadgedIcon(): Promise<string | null> {
  if (badgedIconPromise) return badgedIconPromise;
  badgedIconPromise = (async () => {
    try {
      const res = await fetch("/favicon.svg");
      if (!res.ok) return null;
      let svg = await res.text();
      // Картинка без собственных размеров (у нашего фавикона только viewBox) не
      // рисуется в canvas — задаём их явно.
      if (!/<svg[^>]*\swidth=/.test(svg)) {
        svg = svg.replace("<svg", '<svg width="64" height="64"');
      }
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("icon-load-failed"));
          img.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }

      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, size, size);

      // Точка в правом верхнем углу, с подложкой цвета фона вкладки, чтобы
      // читалась и на светлой, и на тёмной теме браузера.
      const r = size * 0.24;
      const cx = size - r - 2;
      const cy = r + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e5484d";
      ctx.fill();

      return canvas.toDataURL("image/png");
    } catch {
      // Иконку нарисовать не удалось — счётчик в заголовке всё равно на месте.
      return null;
    }
  })();
  return badgedIconPromise;
}

export const BookingsTitleBadge: React.FC = () => {
  const { count } = useNewBookings();
  const { setBadgeCount } = useTitleContext();
  const hasNew = count > 0;

  // Сам заголовок собирает TitleProvider — здесь только число, иначе оно
  // спорило бы с usePageTitle за document.title.
  React.useEffect(() => {
    setBadgeCount(count);
    return () => setBadgeCount(0);
  }, [count, setBadgeCount]);

  React.useEffect(() => {
    if (!hasNew) return;
    let cancelled = false;
    let added: HTMLLinkElement | null = null;
    let removed: HTMLLinkElement[] = [];

    void renderBadgedIcon().then((href) => {
      if (cancelled || !href) return;
      // Иконки CRM снимаем и возвращаем целиком: у них разные `type` (ico и
      // svg), подменить один href нельзя — браузер отрисует не то (тот же
      // приём, что в витрине `/book`, см. useFavicon в public-booking/shell).
      removed = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
      );
      removed.forEach((link) => link.remove());
      added = document.createElement("link");
      added.rel = "icon";
      added.href = href;
      document.head.appendChild(added);
    });

    return () => {
      cancelled = true;
      added?.remove();
      removed.forEach((link) => document.head.appendChild(link));
    };
  }, [hasNew]);

  return null;
};

export default BookingsTitleBadge;
