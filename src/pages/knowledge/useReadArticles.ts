import React from "react";

import { usePermissions } from "../../hooks/usePermissions";

/**
 * Отметки «прочитано» для статей базы знаний.
 *
 * Хранятся локально в браузере: у бэка такого поля нет, а серверная отметка —
 * это уже отчёт «кто что прочитал», то есть отдельная фича с приватностью и
 * правами (см. раздел «Не в этой волне» в
 * MamaDoc/backend_ticket_knowledge_series.md). Локальная отметка честно
 * решает свою задачу — «на чём я остановился» — и ничего не обещает админу.
 *
 * ⚠ Отсюда следствия, о которых нельзя забывать в UI: прогресс не переезжает
 * на другое устройство и теряется при чистке браузера. Поэтому он нигде не
 * подаётся как отчётность — только как подсказка «продолжить с части N».
 *
 * Ключ разделён по пользователю: на общем компьютере регистратуры под одним
 * браузером работают посменно, чужие отметки сбивали бы с толку.
 */

const STORAGE_PREFIX = "mamadoc:knowledge:read";

/** Больше отметок одному человеку не нужно; режем самые старые. */
const MAX_ENTRIES = 500;

type ReadMap = Record<string, number>;

const storageKey = (userId: string | null): string =>
  `${STORAGE_PREFIX}:${userId ?? "anon"}`;

function readStorage(key: string): ReadMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: ReadMap = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) map[id] = at;
    }
    return map;
  } catch {
    // Приватный режим, переполненное хранилище, битый JSON — прогресс
    // необязателен, поэтому просто считаем, что ничего не прочитано.
    return {};
  }
}

function writeStorage(key: string, map: ReadMap): void {
  try {
    const entries = Object.entries(map);
    const trimmed =
      entries.length <= MAX_ENTRIES
        ? entries
        : entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Запись прогресса не должна ронять чтение статьи.
  }
}

/**
 * Один слушатель на вкладку: карточки в ленте и страница статьи должны
 * увидеть отметку сразу, без перезагрузки. `storage`-событие покрывает только
 * другие вкладки, поэтому свои изменения рассылаем сами.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export interface ReadArticles {
  isRead: (articleId: number) => boolean;
  markRead: (articleId: number) => void;
  /** Сколько из переданных статей прочитано. */
  countRead: (articleIds: number[]) => number;
}

export function useReadArticles(): ReadArticles {
  // employeeId в Django-режиме — это id пользователя (см. usePermissions);
  // currentUserId с тем же значением не входит в публичный тип хука.
  const { employeeId } = usePermissions();
  const key = storageKey(employeeId ?? null);

  const [map, setMap] = React.useState<ReadMap>(() => readStorage(key));

  // Перечитываем при смене пользователя и по сигналу от других вкладок.
  React.useEffect(() => {
    const sync = () => setMap(readStorage(key));
    sync();
    listeners.add(sync);
    window.addEventListener("storage", sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);

  const markRead = React.useCallback(
    (articleId: number) => {
      const current = readStorage(key);
      if (current[articleId]) return;
      const next = { ...current, [articleId]: Date.now() };
      writeStorage(key, next);
      notify();
    },
    [key],
  );

  const isRead = React.useCallback((articleId: number) => Boolean(map[articleId]), [map]);

  const countRead = React.useCallback(
    (articleIds: number[]) => articleIds.reduce((n, id) => (map[id] ? n + 1 : n), 0),
    [map],
  );

  return { isRead, markRead, countRead };
}
