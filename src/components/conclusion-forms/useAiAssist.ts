import React from "react";

import { isAiUnavailableError, requestAiAssistBatch, type AiAssistField } from "../../api/medical";

/** Состояние подсказки у одного поля. */
export interface AiAssistFieldState {
  loading: boolean;
  /** Текст, который врач ещё не применил и не отклонил. */
  suggestion: string | null;
}

/** Итог одного нажатия «Помощь AI» — по нему дровер показывает один тост. */
export interface AiAssistSummary {
  total: number;
  /** Полей, по которым пришёл текст для плашки. */
  suggested: number;
  /** Модели не на что опереться — ответ пустой или заглушка. */
  empty: number;
  /** 502–504: AI-сервис за бэком недоступен (в том числе квота провайдера). */
  unavailable: number;
  failed: number;
}

type StateMap = Partial<Record<AiAssistField, AiAssistFieldState>>;

interface UseAiAssistOptions {
  /** Строка приёма — контекст для модели; без неё черновик приходит пустым. */
  serviceLineId: number | null | undefined;
  /** Запрос нажатия завершился (отменённый не в счёт). */
  onSettled: (summary: AiAssistSummary) => void;
}

/**
 * Подсказки AI-помощника для полей заключения — одна кнопка на всю форму.
 *
 * Нажатие — один пакетный запрос по всем доступным полям
 * (`POST /medical/ai/assist/batch/`, бэк 16.09.2026): модель отвечает
 * одним вызовом, разделы согласованы между собой, 48–60 с на 5 полей.
 * Подсказки появляются все разом, когда вернётся ответ. По 502 (сервис лёг
 * или кончилась квота провайдера) ничего не дозапрашиваем и не повторяем:
 * квота общая на всех, повторы её только сжигают.
 *
 * Держится отдельно от текста полей: ответ модели — предложение рядом с
 * оригиналом, а не значение. В само поле текст попадает только когда
 * дровер вызовет свой setter по «Применить» (см. `take`).
 *
 * ⚠ Запрос живёт дольше нажатия (до минуты): повторное нажатие и закрытие
 * дровера обрывают прежний, иначе старый ответ лёг бы поверх нового, а тост
 * всплыл бы над уже другим экраном.
 */
export function useAiAssist({ serviceLineId, onSettled }: UseAiAssistOptions) {
  const [state, setState] = React.useState<StateMap>({});
  const controller = React.useRef<AbortController | null>(null);
  // Коллбэк не кладём в deps: его пересоздают на каждом рендере дровера.
  const settledRef = React.useRef(onSettled);
  settledRef.current = onSettled;

  const patch = React.useCallback((field: AiAssistField, next: Partial<AiAssistFieldState>) => {
    setState((prev) => ({
      ...prev,
      [field]: { loading: false, suggestion: null, ...prev[field], ...next },
    }));
  }, []);

  /** Запросить подсказки по всем переданным полям разом. */
  const requestAll = React.useCallback(
    async (entries: Array<{ field: AiAssistField; text: string }>) => {
      if (entries.length === 0) return;
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      // Прежние неприменённые подсказки уходят: врач попросил заново.
      setState(
        Object.fromEntries(
          entries.map(({ field }) => [field, { loading: true, suggestion: null }]),
        ) as StateMap,
      );

      const summary: AiAssistSummary = {
        total: entries.length,
        suggested: 0,
        empty: 0,
        unavailable: 0,
        failed: 0,
      };
      try {
        const result = await requestAiAssistBatch(entries, serviceLineId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        for (const { field } of entries) {
          const suggestion = result[field];
          patch(field, { loading: false, suggestion });
          if (suggestion == null) summary.empty += 1;
          else summary.suggested += 1;
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        for (const { field } of entries) patch(field, { loading: false, suggestion: null });
        if (isAiUnavailableError(err)) summary.unavailable = entries.length;
        else summary.failed = entries.length;
      }
      if (controller.current === ctrl) controller.current = null;
      settledRef.current(summary);
    },
    [patch, serviceLineId],
  );

  const dismiss = React.useCallback(
    (field: AiAssistField) => patch(field, { suggestion: null }),
    [patch],
  );

  /** Забрать текст предложения; применяет его к полю сам дровер. */
  const take = React.useCallback(
    (field: AiAssistField): string | null => {
      const text = state[field]?.suggestion ?? null;
      if (text != null) patch(field, { suggestion: null });
      return text;
    },
    [patch, state],
  );

  /** Сбросить всё: дровер закрыли или открыли на другой строке. */
  const reset = React.useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({});
  }, []);

  React.useEffect(() => reset, [reset]);

  const of = React.useCallback(
    (field: AiAssistField): AiAssistFieldState => state[field] ?? { loading: false, suggestion: null },
    [state],
  );

  const fields = Object.keys(state) as AiAssistField[];
  const loadingCount = fields.filter((f) => state[f]?.loading).length;
  /** Поля с неприменёнными подсказками — для «Применить все». */
  const suggestedFields = fields.filter((f) => state[f]?.suggestion != null);

  return {
    of,
    requestAll,
    dismiss,
    take,
    reset,
    loading: loadingCount > 0,
    /** Сколько полей ждут ответа — для «AI заполняет 5 полей…». */
    loadingCount,
    suggestedFields,
  };
}
