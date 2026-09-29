import React from "react";

import {
  fitAiFormRows,
  isAiUnavailableError,
  requestAiAssistBatch,
  type AiAssistField,
  type AiAssistForm,
} from "../../api/medical";
import { sameText } from "./textDiff";

/** Состояние подсказки у одного поля. */
export interface AiAssistFieldState {
  loading: boolean;
  /** Текст, который врач ещё не применил и не отклонил. */
  suggestion: string | null;
  /**
   * Текст поля, который ушёл в AI. Ответ идёт до минуты, и врач за это
   * время может поле поправить — режим проверки сравнивает с ним и
   * предупреждает, что предложение составлено по старому тексту.
   */
  source?: string;
}

/**
 * Ключ подсказки: колонка заключения или строка бланка (`row:<id>`).
 * Префикс нужен, потому что id строки задаёт администратор, и строка с id
 * `conclusion` иначе слилась бы с колонкой.
 */
export type AiAssistKey = AiAssistField | `row:${string}`;

export const aiRowKey = (rowId: string): AiAssistKey => `row:${rowId}`;

/** Итог одного нажатия «Помощь AI» — по нему дровер показывает один тост. */
export interface AiAssistSummary {
  total: number;
  /** Полей, по которым пришёл текст для плашки. */
  suggested: number;
  /** Модели не на что опереться — ответ пустой или заглушка. */
  empty: number;
  /** Модель вернула тот же текст — править нечего, плашки нет. */
  unchanged: number;
  /** 502–504: AI-сервис за бэком недоступен (в том числе квота провайдера). */
  unavailable: number;
  failed: number;
}

type StateMap = Partial<Record<AiAssistKey, AiAssistFieldState>>;

interface UseAiAssistOptions {
  /** Строка приёма — контекст для модели; без неё черновик приходит пустым. */
  serviceLineId: number | null | undefined;
  /** Запрос нажатия завершился (отменённый не в счёт). */
  onSettled: (summary: AiAssistSummary) => void;
}

/**
 * Подсказки AI-помощника для полей заключения — одна кнопка на всю форму.
 *
 * Нажатие — один пакетный запрос по всем доступным колонкам и свободным
 * строкам бланка (`POST /medical/ai/assist/batch/`, бэк 16.09 и 27.09.2026):
 * разделы согласованы между собой, 48–60 с на 5 полей; строки бэк режет на
 * параллельные чанки, по времени это один чанк. Подсказки появляются все
 * разом, когда вернётся ответ. По 502 (сервис лёг или кончилась квота
 * провайдера) ничего не дозапрашиваем и не повторяем: квота общая на всех,
 * повторы её только сжигают.
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

  const patch = React.useCallback((key: AiAssistKey, next: Partial<AiAssistFieldState>) => {
    setState((prev) => ({
      ...prev,
      [key]: { loading: false, suggestion: null, ...prev[key], ...next },
    }));
  }, []);

  /**
   * Запросить подсказки по всем переданным колонкам и строкам бланка разом.
   * Колонку, которую бланк собирает (`form.target`), вызывающий может и не
   * убирать — её отсеет `requestAiAssistBatch`, и плашки по ней не будет.
   */
  const requestAll = React.useCallback(
    async (
      entries: Array<{ field: AiAssistField; text: string }>,
      form?: AiAssistForm | null,
    ) => {
      const rows = form ? fitAiFormRows(form.rows) : [];
      const sentForm = form && rows.length > 0 ? { ...form, rows } : null;
      const fields = sentForm ? entries.filter((e) => e.field !== sentForm.target) : entries;
      const sources = new Map<AiAssistKey, string>([
        ...fields.map((e) => [e.field, e.text] as [AiAssistKey, string]),
        ...rows.map((row) => [aiRowKey(row.id), row.text] as [AiAssistKey, string]),
      ]);
      const keys = [...sources.keys()];
      if (keys.length === 0) return;
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      // Прежние неприменённые подсказки уходят: врач попросил заново.
      setState(
        Object.fromEntries(
          keys.map((key) => [key, { loading: true, suggestion: null, source: sources.get(key) }]),
        ) as StateMap,
      );

      const summary: AiAssistSummary = {
        total: keys.length,
        suggested: 0,
        empty: 0,
        unchanged: 0,
        unavailable: 0,
        failed: 0,
      };
      try {
        const result = await requestAiAssistBatch(fields, {
          serviceLineId,
          form: sentForm,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const got = (key: AiAssistKey, suggestion: string | null | undefined) => {
          // Слово в слово тот же текст — не предложение, а шум: врач
          // открыл бы проверку и увидел «без изменений».
          if (suggestion != null && sameText(suggestion, sources.get(key) ?? "")) {
            patch(key, { loading: false, suggestion: null });
            summary.unchanged += 1;
            return;
          }
          patch(key, { loading: false, suggestion: suggestion ?? null });
          if (suggestion == null) summary.empty += 1;
          else summary.suggested += 1;
        };
        for (const { field } of fields) got(field, result.fields[field]);
        for (const row of rows) got(aiRowKey(row.id), result.rows[row.id]);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        for (const key of keys) patch(key, { loading: false, suggestion: null });
        if (isAiUnavailableError(err)) summary.unavailable = keys.length;
        else summary.failed = keys.length;
      }
      if (controller.current === ctrl) controller.current = null;
      settledRef.current(summary);
    },
    [patch, serviceLineId],
  );

  const dismiss = React.useCallback(
    (key: AiAssistKey) => patch(key, { suggestion: null }),
    [patch],
  );

  /** Забрать текст предложения; применяет его к полю сам дровер. */
  const take = React.useCallback(
    (key: AiAssistKey): string | null => {
      const text = state[key]?.suggestion ?? null;
      if (text != null) patch(key, { suggestion: null });
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
    (key: AiAssistKey): AiAssistFieldState => state[key] ?? { loading: false, suggestion: null },
    [state],
  );

  const keys = Object.keys(state) as AiAssistKey[];
  const loadingCount = keys.filter((k) => state[k]?.loading).length;
  /** Поля с неприменёнными подсказками — для «Применить все». */
  const suggestedKeys = keys.filter((k) => state[k]?.suggestion != null);

  return {
    of,
    requestAll,
    dismiss,
    take,
    reset,
    loading: loadingCount > 0,
    /** Сколько полей ждут ответа — для «AI заполняет 5 полей…». */
    loadingCount,
    suggestedKeys,
  };
}
