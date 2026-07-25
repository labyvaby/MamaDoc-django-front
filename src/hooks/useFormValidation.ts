import React from "react";

/**
 * Схема валидации формы: ключ поля → сообщение об ошибке или пусто, если поле
 * заполнено верно. Пересчитывается на каждый рендер из текущих значений формы,
 * поэтому ошибка исчезает сама, как только пользователь исправил поле.
 *
 * Порядок ключей важен: фокус уходит в первое невалидное поле по этому порядку,
 * поэтому объявляйте поля в том же порядке, в каком они идут в разметке.
 */
export type ValidationSchema<K extends string> = Record<K, string | null | undefined | false>;

/** Пропсы для MUI TextField / Select — подсветка ошибки и якорь для фокуса. */
export interface ValidationFieldProps {
  error: boolean;
  helperText?: React.ReactNode;
  ref: (el: HTMLElement | null) => void;
}

export interface UseFormValidation<K extends string> {
  /** Была ли попытка отправки — до неё ошибки не показываем. */
  attempted: boolean;
  /** Есть ли незаполненные/неверные поля прямо сейчас (независимо от attempted). */
  hasErrors: boolean;
  /** Текст ошибки поля с учётом attempted (null — не показывать). */
  errorOf: (key: K) => string | null;
  /**
   * Пропсы поля: `<TextField {...v.field("name")} />`.
   * Второй аргумент — обычный helperText, он показывается, пока ошибки нет.
   */
  field: (key: K, helperText?: React.ReactNode) => ValidationFieldProps;
  /**
   * Якорь для полей, которым нельзя отдать пропсы (чипы, пикеры, блоки фото):
   * `<Box ref={v.anchor("photos")}>`. Фокус уйдёт на первый фокусируемый
   * элемент внутри, иначе просто проскроллит к блоку.
   */
  anchor: (key: K) => (el: HTMLElement | null) => void;
  /**
   * Проверить форму. Если всё заполнено — true. Иначе показывает ошибки,
   * скроллит и ставит фокус в первое невалидное поле и возвращает false.
   */
  validate: () => boolean;
  /**
   * Проскроллить и сфокусировать конкретное поле. Нужно, когда валидацию ведёт
   * другая библиотека (react-hook-form): она даёт список ошибок, а фокус
   * переводим сами по тем же якорям.
   */
  focusField: (key: K) => void;
  /** Сбросить показ ошибок (например, при открытии/очистке формы). */
  reset: () => void;
}

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[role="combobox"]:not([aria-disabled="true"])',
  '[contenteditable="true"]',
  'button:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Ищет, что именно сфокусировать: сам элемент либо первый фокусируемый внутри. */
function resolveFocusTarget(el: HTMLElement): HTMLElement | null {
  if (el.matches(FOCUSABLE_SELECTOR)) return el;
  const inner = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  for (const candidate of inner) {
    // У MUI Select настоящий input скрыт (aria-hidden) — фокус на нём не сработает.
    if (candidate.closest('[aria-hidden="true"]')) continue;
    if ((candidate as HTMLInputElement).type === "hidden") continue;
    return candidate;
  }
  return null;
}

/**
 * Валидация формы с переводом фокуса на первое незаполненное поле.
 *
 * До первой попытки отправки форма молчит; по клику на «Сохранить» показываются
 * ошибки и фокус уходит в первое проблемное поле. Кнопку отправки при этом
 * держим активной — иначе клика, который показал бы ошибку, просто не будет.
 *
 * @example
 * const v = useFormValidation({
 *   name: name.trim() ? null : "Укажите название",
 *   price: Number(price) > 0 ? null : "Укажите цену больше нуля",
 * });
 *
 * <TextField label="Название" {...v.field("name")} />
 * <TextField label="Цена" {...v.field("price", "В сомах")} />
 * <Button onClick={() => { if (v.validate()) void save(); }}>Сохранить</Button>
 */
export function useFormValidation<K extends string>(
  schema: ValidationSchema<K>,
): UseFormValidation<K> {
  const [attempted, setAttempted] = React.useState(false);

  // Схема пересобирается каждый рендер — держим её в ref, чтобы validate()
  // не пересоздавался и всегда видел актуальные значения.
  const schemaRef = React.useRef(schema);
  schemaRef.current = schema;

  const elements = React.useRef(new Map<K, HTMLElement>());
  // Кэш ref-колбэков: без него каждый рендер давал бы новую функцию и React
  // дёргал бы ref(null) → ref(el) на пустом месте.
  const refCallbacks = React.useRef(new Map<K, (el: HTMLElement | null) => void>());

  const anchor = React.useCallback((key: K) => {
    let cb = refCallbacks.current.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) elements.current.set(key, el);
        else elements.current.delete(key);
      };
      refCallbacks.current.set(key, cb);
    }
    return cb;
  }, []);

  const errorOf = React.useCallback(
    (key: K): string | null => {
      if (!attempted) return null;
      const message = schema[key];
      return message ? message : null;
    },
    [attempted, schema],
  );

  const field = React.useCallback(
    (key: K, helperText?: React.ReactNode): ValidationFieldProps => {
      const message = errorOf(key);
      return {
        error: Boolean(message),
        helperText: message ?? helperText,
        ref: anchor(key),
      };
    },
    [errorOf, anchor],
  );

  const focusField = React.useCallback((key: K) => {
    const el = elements.current.get(key);
    const target = el ? resolveFocusTarget(el) : null;
    (target ?? el)?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Скролл уже сделали сами — фокус не должен дёргать страницу второй раз.
    target?.focus({ preventScroll: true });
  }, []);

  const validate = React.useCallback((): boolean => {
    const current = schemaRef.current;
    const keys = Object.keys(current) as K[];
    const firstInvalid = keys.find((key) => Boolean(current[key]));
    if (!firstInvalid) return true;

    setAttempted(true);
    focusField(firstInvalid);
    return false;
  }, [focusField]);

  const reset = React.useCallback(() => setAttempted(false), []);

  const hasErrors = React.useMemo(
    () => (Object.keys(schema) as K[]).some((key) => Boolean(schema[key])),
    [schema],
  );

  return { attempted, hasErrors, errorOf, field, anchor, validate, focusField, reset };
}
