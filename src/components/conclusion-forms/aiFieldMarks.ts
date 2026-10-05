import React from "react";

/** Поле, к которому привязана подсказка, — по атрибуту `data-ai-key`. */
export const aiFieldOf = (root: ParentNode | null | undefined, key: string) =>
  root?.querySelector<HTMLElement>(`[data-ai-key="${CSS.escape(key)}"]`) ?? null;

/**
 * Пометить поля атрибутом, пока ключ в списке: подсветка поля под карточкой
 * (`data-ai-active`), «AI читает это поле» (`data-ai-loading`). Стили — у
 * корня формы; атрибут, а не проп, потому что поля рисует не этот компонент.
 */
export function useAiFieldMarks(
  root: HTMLElement | null,
  keys: readonly string[],
  attr: `data-ai-${string}`,
) {
  const sig = keys.join("|");
  React.useEffect(() => {
    if (!root || !sig) return;
    const marked = sig
      .split("|")
      .map((key) => aiFieldOf(root, key))
      .filter((el): el is HTMLElement => el != null);
    for (const el of marked) el.setAttribute(attr, "");
    return () => {
      for (const el of marked) el.removeAttribute(attr);
    };
  }, [root, sig, attr]);
}
