import React from "react";
import { Box, Typography, type TypographyProps } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { DiffPart } from "./textDiff";

/**
 * Пословная правка AI: удалённое зачёркнуто красным, добавленное — зелёным.
 * Общая для режима проверки (AiReviewDialog), карточки подсказки и примерки
 * в поле — врач везде читает правку одинаково.
 */
export const AiDiffText = React.forwardRef<
  HTMLSpanElement,
  { parts: DiffPart[] } & Omit<TypographyProps, "children">
>(function AiDiffText({ parts, sx, ...rest }, ref) {
  return (
    <Typography
      ref={ref}
      component="div"
      variant="body2"
      {...rest}
      sx={[{ whiteSpace: "pre-wrap", lineHeight: 1.8 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {parts.map((part, i) => {
        // Пробелы и переводы строк без подсветки: пустая цветная плашка
        // на месте пробела читается как ошибка вёрстки.
        if (part.kind === "same" || part.text.trim() === "") {
          return <React.Fragment key={i}>{part.text}</React.Fragment>;
        }
        // Пробел в хвосте удалённого и в голове добавленного — один и тот
        // же (textDiff кладёт его в обе стороны), на экране он лишний.
        const nextPart = parts[i + 1];
        const text =
          part.kind === "removed" && nextPart?.kind === "added" && /^\s/.test(nextPart.text)
            ? part.text.replace(/\s+$/, "")
            : part.text;
        return (
          <Box
            key={i}
            component={part.kind === "added" ? "ins" : "del"}
            sx={{
              textDecoration: part.kind === "removed" ? "line-through" : "none",
              color: part.kind === "removed" ? "text.secondary" : "text.primary",
              bgcolor: (th) =>
                alpha(part.kind === "added" ? th.palette.success.main : th.palette.error.main, 0.14),
              borderRadius: 0.5,
              px: 0.25,
            }}
          >
            {text}
          </Box>
        );
      })}
    </Typography>
  );
});
