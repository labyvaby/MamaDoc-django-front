import React from "react";

/**
 * Автосохранение незавершённой статьи в браузере.
 *
 * Зачем: до этого случайное закрытие дровера (клик мимо, Esc, промах по
 * крестику) стирало текст без единого вопроса. Для длинной статьи, тем более
 * разбитой на части, это дорогая потеря.
 *
 * Черновик — страховка, а не хранилище: он живёт локально, привязан к
 * конкретной статье (или к «новой») и стирается сразу после успешного
 * сохранения на сервер. Восстановление всегда спрашивается явно — молча
 * подменять содержимое статьи текстом из чужой вкладки нельзя.
 */

const STORAGE_PREFIX = "mamadoc:knowledge:draft";

/** Черновики старше недели уже не нужны — чистим при обращении. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ArticleDraft {
  title: string;
  content: string;
  categoryId: number | null;
  isPublished: boolean;
  coverUrl: string;
  seriesName: string;
  partNumber: string;
  savedAt: number;
}

export type ArticleDraftInput = Omit<ArticleDraft, "savedAt">;

const draftKey = (articleId: number | null): string =>
  `${STORAGE_PREFIX}:${articleId ?? "new"}`;

function readDraft(key: string): ArticleDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ArticleDraft> | null;
    if (!parsed || typeof parsed.content !== "string" || typeof parsed.savedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      title: parsed.title ?? "",
      content: parsed.content,
      categoryId: parsed.categoryId ?? null,
      isPublished: Boolean(parsed.isPublished),
      coverUrl: parsed.coverUrl ?? "",
      seriesName: parsed.seriesName ?? "",
      partNumber: parsed.partNumber ?? "",
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export interface UseArticleDraft {
  /** Черновик, найденный при открытии редактора (предложение восстановить). */
  restorable: ArticleDraft | null;
  /** Убрать предложение, ничего не восстанавливая (черновик остаётся). */
  dismiss: () => void;
  /** Забыть черновик — после успешного сохранения или отказа от правок. */
  clear: () => void;
  /** Записать текущее состояние (дебаунс внутри). */
  save: (draft: ArticleDraftInput) => void;
}

/**
 * @param articleId  id редактируемой статьи; null — новая статья
 * @param open       редактор открыт (закрытый ничего не пишет и не читает)
 */
export function useArticleDraft(articleId: number | null, open: boolean): UseArticleDraft {
  const key = draftKey(articleId);
  const [restorable, setRestorable] = React.useState<ArticleDraft | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Предложение восстановить считаем один раз на открытие: если перечитывать
  // на каждый рендер, собственное автосохранение тут же предложило бы
  // «восстановить» то, что уже набрано.
  React.useEffect(() => {
    if (!open) {
      setRestorable(null);
      return;
    }
    setRestorable(readDraft(key));
  }, [open, key]);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const clear = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      localStorage.removeItem(key);
    } catch {
      // Недоступное хранилище — просто нечего чистить.
    }
    setRestorable(null);
  }, [key]);

  const save = React.useCallback(
    (draft: ArticleDraftInput) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
        } catch {
          // Переполненное хранилище (крупные статьи) — автосохранение
          // необязательно и не должно мешать писать дальше.
        }
      }, 800);
    },
    [key],
  );

  const dismiss = React.useCallback(() => setRestorable(null), []);

  return { restorable, dismiss, clear, save };
}
