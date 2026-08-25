import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

import { subtleBg, subtleBorder } from "../../../theme/uiHelpers";
import { formatAmount, SOM } from "./money";

const MotionBox = motion(Box);

// ── Types ─────────────────────────────────────────────────────────────────────

/** Подгруппа строки — разрез суммы (например, оплаты по способам безнала). */
export type FlowSubRow = {
  key: string;
  label: string;
  /** Положительная величина: знак — в `direction` либо у родительской строки. */
  amount: number;
  /**
   * Своё направление подстроки. Нужно там, где внутри одной строки лежат
   * разные потоки: у способа оплаты приход и возвраты соседствуют, и знак
   * родителя (нетто) для них неверен.
   */
  direction?: 1 | -1;
  /** Приглушённая строка — деньги без способа, вне справочника. */
  muted?: boolean;
  /** Пояснение рядом с названием — показывается иконкой с тултипом. */
  hint?: string;
};

export type FlowBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  /** +1 — приход, −1 — расход */
  direction: 1 | -1;
  /** Число операций; не показываем, если счётчик не совпадает с суммой строки. */
  count?: number;
  hint?: string;
  /** Деньги вне справочника способов — приглушаем, как и в подстроках. */
  muted?: boolean;
  /** Разрез суммы. Пустой массив = раскрывать нечего, шеврона не будет. */
  children?: FlowSubRow[];
};

type Props = {
  inflow: number;
  outflow: number;
  breakdown: FlowBreakdownRow[];
  loading: boolean;
  /** Палитра акцента: primary — безнал, success — наличные. */
  color?: "primary" | "success";
  /**
   * Ключ хранения состояния строк. Разрез раскрыт по умолчанию — кассир смотрит
   * его каждый день; в хранилище едут только ручные отклонения от дефолта,
   * поэтому свёрнутая строка переживает перезагрузку страницы.
   */
  storageKey?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function readExpanded(key: string | undefined): Record<string, boolean> {
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// Колонка сумм фиксирована: иначе строки с «—» и с числом дают разную ширину и
// подписи слева «едут» от строки к строке (жалоба по ленте 20.08.2026).
const AMOUNT_WIDTH = 124;
// Линия-гид подгрупп проходит по центру маркера строки (маркер — бокс 14px).
const MARKER_SIZE = 14;
const GUIDE_OFFSET = `${MARKER_SIZE / 2}px`;

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Пояснение к строке — иконкой, а не второй строкой текста: подписи вроде
 * «терминал в продаже не сохраняется» нужны раз в жизни, а место в плотном
 * списке занимали постоянно.
 */
export const Hint: React.FC<{ text: string }> = ({ text }) => (
  <Tooltip title={text} enterTouchDelay={0} describeChild>
    <InfoOutlined sx={{ fontSize: 13, flexShrink: 0, color: "text.disabled", cursor: "help" }} />
  </Tooltip>
);

type AmountProps = {
  value: number;
  direction: 1 | -1;
  /**
   * Направление, которое читатель уже знает из контекста (секция — для строки,
   * строка — для подгруппы): при совпадении «+» не рисуем, колонка одинаковых
   * плюсов ничего не сообщает. Минус опускать нельзя ни при каком контексте —
   * строку с деньгами выхватывают глазами отдельно от заголовка секции.
   */
  expected?: 1 | -1;
  level: "section" | "row" | "sub";
  muted?: boolean;
  /** Акцент карточки; им выделены только итоги секций. */
  accent: string;
};

const LEVEL_STYLE = {
  section: { variant: "body2" as const, weight: 700 },
  row: { variant: "body2" as const, weight: 600 },
  sub: { variant: "caption" as const, weight: 500 },
};

/**
 * Сумма в колонке. Три уровня — три веса и цвета: акцентом держится итог
 * секции, строки идут основным текстом, подгруппы — вторичным. Раньше всё
 * было одним акцентным цветом, и колонка читалась сплошной массой.
 */
const Amount: React.FC<AmountProps> = ({ value, direction, expected, level, muted, accent }) => {
  const { variant, weight } = LEVEL_STYLE[level];
  const empty = value === 0;
  const sign = direction < 0 ? "− " : direction === expected ? "" : "+ ";

  const color =
    empty || muted
      ? "text.disabled"
      : level === "section"
        ? accent
        : level === "row"
          ? "text.primary"
          : "text.secondary";

  return (
    <Typography
      variant={variant}
      fontWeight={weight}
      sx={{
        flexShrink: 0,
        width: AMOUNT_WIDTH,
        textAlign: "right",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        color,
      }}
    >
      {empty ? (
        "—"
      ) : (
        <>
          {sign}
          {formatAmount(value)}
          <Box component="span" sx={{ ml: 0.4, color: "text.disabled", fontWeight: 400 }}>
            {SOM}
          </Box>
        </>
      )}
    </Typography>
  );
};

const SubRows: React.FC<{ rows: FlowSubRow[]; direction: 1 | -1; accent: string }> = ({
  rows,
  direction,
  accent,
}) => (
  <Stack
    spacing={0}
    sx={{
      ml: GUIDE_OFFSET,
      pl: 1.75,
      py: 0.25,
      borderLeft: "1px solid",
      borderColor: (t) => subtleBorder(t),
    }}
  >
    {rows.map((sub) => (
      <Stack
        key={sub.key}
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ py: 0.4, minWidth: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            color={sub.muted ? "text.disabled" : "text.secondary"}
            noWrap
          >
            {sub.label}
          </Typography>
          {sub.hint && <Hint text={sub.hint} />}
        </Stack>
        <Amount
          value={sub.amount}
          direction={sub.direction ?? direction}
          expected={direction}
          level="sub"
          muted={sub.muted}
          accent={accent}
        />
      </Stack>
    ))}
  </Stack>
);

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Рейка приход/расход + двухуровневая разбивка потока: секции «Приход» и
 * «Расход», внутри — строки типов операций, раскрывающиеся в разрез по
 * способам. Общий кусок карточек «Безнал» (за выбранное окно) и «Наличные»
 * (всегда за сегодня).
 */
export const FlowBreakdownBlock: React.FC<Props> = ({
  inflow,
  outflow,
  breakdown,
  loading,
  color = "primary",
  storageKey,
}) => {
  // Приход считается нетто (возвраты сидят внутри оплат), поэтому за окно с
  // одними возвратами он бывает отрицательным — рейку это не должно ломать.
  const railIn = Math.max(0, inflow);
  const railOut = Math.max(0, outflow);
  const railTotal = railIn + railOut;
  const accent = `${color}.main`;

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() =>
    readExpanded(storageKey),
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: prev[key] === false };
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* приватный режим / переполнение — раскрытие просто не запомнится */
        }
      }
      return next;
    });
  };

  const renderRow = (row: FlowBreakdownRow, sectionDirection: 1 | -1, last: boolean) => {
    const empty = row.amount === 0;
    const subRows = row.children ?? [];
    // Единственная подгруппа, равная родителю, ничего не объясняет — шеврон на
    // ней был бы кликом в никуда. А вот одна подгруппа с другой суммой смысл
    // несёт: так выглядят наличные оплаты с возвратом, где способов нет.
    const sameAsRow =
      subRows.length === 1 &&
      Math.abs(
        subRows[0].amount * (subRows[0].direction ?? row.direction) - row.amount * row.direction,
      ) < 0.005;
    const expandable = !empty && !loading && subRows.length > 0 && !sameAsRow;
    // Дефолт — раскрыто: в expanded лежат только явные решения кассира,
    // отсутствие ключа означает «открыто».
    const isOpen = expandable && expanded[row.key] !== false;

    return (
      <Box
        key={row.key}
        sx={{
          // Разделители дают колонке сумм опору для глаза; у последней строки
          // секции линии нет — её роль играет граница следующей секции.
          borderBottom: last ? 0 : "1px solid",
          borderColor: (t) => subtleBorder(t),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          {...(expandable
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-expanded": isOpen,
                onClick: () => toggle(row.key),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(row.key);
                  }
                },
              }
            : {})}
          sx={(t) => ({
            py: 0.75,
            minWidth: 0,
            borderRadius: "8px",
            ...(expandable
              ? {
                  mx: -1,
                  px: 1,
                  cursor: "pointer",
                  transition: "background-color .15s ease",
                  "&:hover": { bgcolor: subtleBg(t) },
                  "&:focus-visible": { outline: `2px solid ${t.palette.primary.main}` },
                }
              : {}),
          })}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: MARKER_SIZE,
                height: MARKER_SIZE,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: empty || row.muted ? "text.disabled" : accent,
              }}
            >
              {expandable ? (
                <KeyboardArrowRightOutlined
                  sx={{
                    fontSize: MARKER_SIZE,
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform .22s cubic-bezier(.22,1,.36,1)",
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: empty || row.muted ? "text.disabled" : accent,
                  }}
                />
              )}
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="body2" color={empty ? "text.disabled" : "text.secondary"} noWrap>
                {row.label}
                {row.count != null && row.count > 0 && (
                  <Box component="span" sx={{ color: "text.disabled" }}>
                    {" · "}
                    {row.count}
                  </Box>
                )}
              </Typography>
              {row.hint && <Hint text={row.hint} />}
            </Stack>
          </Stack>

          {loading ? (
            <Skeleton width={88} height={18} />
          ) : (
            <Amount
              value={row.amount}
              direction={row.direction}
              expected={sectionDirection}
              level="row"
              muted={row.muted}
              accent={accent}
            />
          )}
        </Stack>

        <AnimatePresence initial={false}>
          {isOpen && (
            <MotionBox
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              sx={{ overflow: "hidden" }}
            >
              <SubRows rows={subRows} direction={row.direction} accent={accent} />
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
    );
  };

  const sectionHeader = (title: string, total: number, direction: 1 | -1) => (
    <Stack
      direction="row"
      alignItems="baseline"
      justifyContent="space-between"
      spacing={1}
      sx={{ pb: 0.75 }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}
      >
        {title}
      </Typography>
      {loading ? (
        <Skeleton width={88} height={18} />
      ) : (
        <Amount value={total} direction={direction} level="section" accent={accent} />
      )}
    </Stack>
  );

  const inRows = breakdown.filter((r) => r.direction > 0);
  const outRows = breakdown.filter((r) => r.direction < 0);

  return (
    <>
      {/* Рейка приход/расход — доля прихода и расхода в обороте за окно */}
      <Box
        aria-hidden
        sx={(t) => ({
          mt: 1.75,
          mb: 2,
          height: 8,
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          bgcolor: subtleBg(t, true),
        })}
      >
        <Box
          sx={{
            width: railTotal > 0 ? `${(railIn / railTotal) * 100}%` : 0,
            bgcolor: accent,
            transition: "width .4s cubic-bezier(.22,1,.36,1)",
          }}
        />
        <Box
          sx={{
            width: railTotal > 0 ? `${(railOut / railTotal) * 100}%` : 0,
            bgcolor: accent,
            opacity: 0.35,
            transition: "width .4s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </Box>

      <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.25 }}>
        {sectionHeader("Приход", Math.abs(inflow), inflow < 0 ? -1 : 1)}
        {inRows.map((r, i) => renderRow(r, 1, i === inRows.length - 1))}
      </Box>

      {outRows.length > 0 && (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.25, mt: 1.25 }}>
          {sectionHeader("Расход", Math.abs(outflow), outflow < 0 ? 1 : -1)}
          {outRows.map((r, i) => renderRow(r, -1, i === outRows.length - 1))}
        </Box>
      )}
    </>
  );
};

export default FlowBreakdownBlock;
