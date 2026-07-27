import React from "react";
import { Box } from "@mui/material";

/** Экранирует пользовательский ввод — иначе «(» из запроса уронит RegExp. */
const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface HighlightedTextProps {
  text: string;
  /** Поисковый запрос; пустой — текст выводится как есть. */
  query?: string;
}

/**
 * Подсветка совпадений поиска. Ищем по словам запроса независимо: бэк ищет
 * по вхождению, и «касса смена» должно подсветить оба слова, где бы они
 * ни стояли. «ё» и «е» считаем одной буквой, как это делает поиск в жизни.
 */
const HighlightedText: React.FC<HighlightedTextProps> = ({ text, query }) => {
  const parts = React.useMemo(() => {
    const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const pattern = words
      .map((w) => escapeRe(w).replace(/[еёЕЁ]/g, "[еёЕЁ]"))
      .sort((a, b) => b.length - a.length)
      .join("|");
    try {
      return text.split(new RegExp(`(${pattern})`, "gi"));
    } catch {
      return null;
    }
  }, [text, query]);

  if (!parts) return <>{text}</>;

  const words = (query ?? "").trim().toLowerCase().replace(/ё/g, "е").split(/\s+/);
  return (
    <>
      {parts.map((part, i) =>
        words.includes(part.toLowerCase().replace(/ё/g, "е")) ? (
          <Box
            key={i}
            component="mark"
            sx={(t) => ({
              px: "1px",
              borderRadius: "3px",
              color: "inherit",
              bgcolor: t.palette.mode === "dark" ? "warning.dark" : "warning.light",
            })}
          >
            {part}
          </Box>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

export default HighlightedText;
