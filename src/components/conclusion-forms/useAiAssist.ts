import React from "react";

import { isAiUnavailableError, requestAiAssist, type AiAssistField } from "../../api/medical";

/** Состояние подсказки у одного поля. */
export interface AiAssistFieldState {
  loading: boolean;
  /** Текст, который врач ещё не применил и не отклонил. */
  suggestion: string | null;
}

type StateMap = Partial<Record<AiAssistField, AiAssistFieldState>>;

interface UseAiAssistOptions {
  /** Строка приёма — контекст для модели; без неё черновик приходит пустым. */
  serviceLineId: number | null | undefined;
  /** Тост «AI временно недоступен» / «не удалось получить подсказку». */
  onUnavailable: () => void;
  onFailed: () => void;
  /** Модели не на что опереться — ответ пустой или заглушка. */
  onEmpty: () => void;
}

/**
 * Подсказки AI-помощника для полей заключения — по одной на поле.
 *
 * Держится отдельно от текста полей: ответ модели — предложение рядом с
 * оригиналом, а не значение. В само поле текст попадает только когда
 * дровер вызовет свой setter по «Применить» (см. `take`). Повторный запрос
 * по тому же полю отменяет предыдущий: врач мог дописать пару слов и нажать
 * снова, а старый ответ пришёл бы поверх нового.
 *
 * ⚠ Запросы живут дольше нажатия: при закрытии дровера все обрываются, иначе
 * тост об ошибке всплыл бы над уже другим экраном.
 */
export function useAiAssist({ serviceLineId, onUnavailable, onFailed, onEmpty }: UseAiAssistOptions) {
  const [state, setState] = React.useState<StateMap>({});
  const controllers = React.useRef<Partial<Record<AiAssistField, AbortController>>>({});
  // Коллбэки не кладём в deps: их пересоздают на каждом рендере дровера,
  // а хук должен звать актуальные.
  const callbacks = React.useRef({ onUnavailable, onFailed, onEmpty });
  callbacks.current = { onUnavailable, onFailed, onEmpty };

  const patch = React.useCallback((field: AiAssistField, next: Partial<AiAssistFieldState>) => {
    setState((prev) => ({
      ...prev,
      [field]: { loading: false, suggestion: null, ...prev[field], ...next },
    }));
  }, []);

  const request = React.useCallback(
    async (field: AiAssistField, text: string) => {
      controllers.current[field]?.abort();
      const ctrl = new AbortController();
      controllers.current[field] = ctrl;
      patch(field, { loading: true, suggestion: null });
      try {
        const suggestion = await requestAiAssist(
          { field, text, serviceLineId: serviceLineId ?? undefined },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        patch(field, { loading: false, suggestion });
        if (suggestion == null) callbacks.current.onEmpty();
      } catch (err) {
        if (ctrl.signal.aborted) return;
        patch(field, { loading: false, suggestion: null });
        if (isAiUnavailableError(err)) callbacks.current.onUnavailable();
        else callbacks.current.onFailed();
      } finally {
        if (controllers.current[field] === ctrl) delete controllers.current[field];
      }
    },
    [patch, serviceLineId],
  );

  const dismiss = React.useCallback(
    (field: AiAssistField) => {
      controllers.current[field]?.abort();
      delete controllers.current[field];
      patch(field, { loading: false, suggestion: null });
    },
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
    for (const ctrl of Object.values(controllers.current)) ctrl?.abort();
    controllers.current = {};
    setState({});
  }, []);

  React.useEffect(() => reset, [reset]);

  const of = React.useCallback(
    (field: AiAssistField): AiAssistFieldState => state[field] ?? { loading: false, suggestion: null },
    [state],
  );

  return { of, request, dismiss, take, reset };
}
