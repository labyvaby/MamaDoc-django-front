import type { SxProps, Theme } from "@mui/material";

/**
 * Плотная таблица отчётов: мелкий кегль и узкие ряды, чтобы месяц данных
 * читался без скролла. Единые значения для «Отчётов» и «Отчёта по зарплате».
 */
export const compactTableSx: SxProps<Theme> = {
  // stickyHeader переводит таблицу в borderCollapse: separate, и дефолтный
  // border-spacing оставляет над шапкой щель, в которой видны уезжающие строки.
  borderSpacing: 0,
  "& .MuiTableCell-root": { fontSize: "0.75rem", py: 0.6, px: 1 },
  "& .MuiTableCell-head": { fontWeight: 700, bgcolor: "background.paper" },
};
