import React from "react";
import { Box, TextField, type TextFieldProps } from "@mui/material";

import { useT } from "../../i18n/VerticalProvider";

/** Сколько строк длинного текста видно, пока врач не в поле. */
const DEFAULT_COLLAPSED_ROWS = 6;

type CollapsibleTextFieldProps = Omit<TextFieldProps, "multiline" | "maxRows"> & {
  collapsedRows?: number;
};

/**
 * Многострочное поле, которое не растягивает форму длинным текстом.
 *
 * Обычный autosize-TextField вырастал на весь текст, и чтобы долистать до
 * следующего поля заключения, приходилось крутить экран за экраном. Здесь
 * длинный текст виден первыми строками, пока поле не в фокусе; клик в поле
 * (или «Показать весь текст») разворачивает его целиком — редактировать
 * вслепую в окошке нельзя.
 *
 * ⚠ Свёрнутое поле — без собственного скролла (`overflow: hidden`): иначе
 * колесо мыши над ним листало бы текст внутри, а не форму, и проблема
 * «долго листать» вернулась бы в другом виде.
 */
export const CollapsibleTextField = React.forwardRef<HTMLDivElement, CollapsibleTextFieldProps>(
  function CollapsibleTextField(
    { collapsedRows = DEFAULT_COLLAPSED_ROWS, helperText, onFocus, onBlur, inputRef, sx, ...props },
    ref,
  ) {
    const { t } = useT("appointments");
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [focused, setFocused] = React.useState(false);
    const [pinned, setPinned] = React.useState(false);
    const [overflowing, setOverflowing] = React.useState(false);
    const expanded = focused || pinned;

    const setTextarea = React.useCallback(
      (el: HTMLTextAreaElement | null) => {
        textareaRef.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef) (inputRef as React.MutableRefObject<unknown>).current = el;
      },
      [inputRef],
    );

    // Меряем только в свёрнутом виде: в развёрнутом переполнения нет по определению.
    React.useLayoutEffect(() => {
      const el = textareaRef.current;
      if (!el || expanded) return;
      const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }, [expanded, props.value]);

    const showToggle = !helperText && (pinned || (!focused && overflowing));
    const toggle = showToggle ? (
      <Box
        component="button"
        type="button"
        // mousedown, а не click: иначе поле успело бы потерять фокус и
        // свернуться, а кнопка уехала бы из-под курсора.
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        onClick={() => setPinned((prev) => !prev)}
        sx={{
          p: 0,
          border: 0,
          bgcolor: "transparent",
          color: "primary.main",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        {pinned ? t("conclusion.collapseText") : t("conclusion.expandText")}
      </Box>
    ) : null;

    return (
      <TextField
        {...props}
        ref={ref}
        multiline
        maxRows={expanded ? undefined : collapsedRows}
        inputRef={setTextarea}
        // `||`, а не `??`: валидация отдаёт пустую строку, пока ошибки нет.
        helperText={helperText || toggle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        sx={[
          expanded ? {} : { "& textarea": { overflow: "hidden !important" } },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    );
  },
);
