import React from "react";

/**
 * Заполнить форму окна при открытии (и при смене `key` — другой записи или
 * режима), а не при каждом обновлении данных: фоновый запрос не стирает
 * несохранённую правку врача.
 */
export function useFormReset(open: boolean, key: string, reset: () => void): void {
  const latest = React.useRef(reset);
  React.useEffect(() => {
    latest.current = reset;
  });
  React.useEffect(() => {
    if (open) latest.current();
  }, [open, key]);
}
