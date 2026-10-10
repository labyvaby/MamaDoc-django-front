import React from "react";
import { Box, ButtonBase, Collapse, Stack, Typography, alpha, useTheme } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import { subtleBorder } from "../../../theme/uiHelpers";
import { STATUS_TONE, STATUS_WORD, normRowStatus, type FeedingSnapshot } from "./feedingAdvice";
import { NORM_COLUMNS, NORM_FOOTNOTE, NORM_ROWS, afterYearNorm, normCell, normColumn, type NormColumn } from "./feedingNorms";
import { FeedingPanel, Pill } from "./FeedingParts";

/** С этой ширины панели — вся таблица, уже — один столбец и переключатель возраста. */
const FULL_FROM = 470;

const Status: React.FC<{ snapshot: FeedingSnapshot; rowKey: string }> = ({ snapshot, rowKey }) => {
  const row = NORM_ROWS.find((item) => item.key === rowKey);
  if (!row) return null;
  const status = normRowStatus(row, snapshot);
  return (
    <Pill tone={STATUS_TONE[status]} dense>
      {STATUS_WORD[status]}
    </Pill>
  );
};

/** Вся табл. 5.1: столбец ребёнка выделен, справа — статус строки. */
const FullTable: React.FC<{ snapshot: FeedingSnapshot; column: NormColumn | null }> = ({ snapshot, column }) => {
  const theme = useTheme();
  const highlight = alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.08);
  const cell = { fontSize: 12.5, fontVariantNumeric: "tabular-nums", textAlign: "center", px: 0.5, py: 0.5, whiteSpace: "nowrap" } as const;
  return (
    <Box
      role="table"
      aria-label="Норма на день по возрасту, г или мл"
      sx={{
        display: "none",
        [`@container feeding-norms (min-width: ${FULL_FROM}px)`]: { display: "grid" },
        gridTemplateColumns: "minmax(110px, 1.6fr) repeat(5, minmax(46px, 1fr)) auto",
        alignItems: "center",
        columnGap: 0.25,
      }}
    >
      <Box />
      {NORM_COLUMNS.map((item) => (
        <Typography
          key={item.key}
          variant="caption"
          sx={{
            ...cell,
            fontWeight: item.key === column ? 700 : 500,
            color: item.key === column ? "primary.main" : "text.secondary",
            bgcolor: item.key === column ? highlight : "transparent",
            borderRadius: "8px 8px 0 0",
          }}
        >
          {item.short}
        </Typography>
      ))}
      <Box />
      {NORM_ROWS.map((row, index) => (
        <React.Fragment key={row.key}>
          <Typography
            variant="body2"
            title={row.note}
            sx={{ fontSize: 13, py: 0.5, pr: 1, borderTop: `1px solid ${subtleBorder(theme)}`, lineHeight: 1.3 }}
          >
            {row.label}
            {row.alt && (
              <Typography component="span" variant="caption" color="text.secondary" display="block">
                / {row.alt.label}
              </Typography>
            )}
          </Typography>
          {NORM_COLUMNS.map((item) => {
            const value = row.values[item.key];
            const alt = row.alt?.values[item.key];
            const own = item.key === column;
            return (
              <Box
                key={item.key}
                sx={{
                  ...cell,
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  borderTop: `1px solid ${subtleBorder(theme)}`,
                  bgcolor: own ? highlight : "transparent",
                  borderRadius: own && index === NORM_ROWS.length - 1 ? "0 0 8px 8px" : 0,
                  fontWeight: own ? 700 : 400,
                  color: value ? "text.primary" : "text.disabled",
                }}
              >
                {value ? (row.unit === "шт." ? `${value} шт.` : value) : "–"}
                {alt && (
                  <Box component="span" sx={{ fontSize: 11, color: "text.secondary", fontWeight: own ? 600 : 400 }}>
                    {alt}
                  </Box>
                )}
              </Box>
            );
          })}
          <Box sx={{ pl: 0.75, py: 0.5, borderTop: `1px solid ${subtleBorder(theme)}`, alignSelf: "stretch", display: "flex", alignItems: "center" }}>
            <Status snapshot={snapshot} rowKey={row.key} />
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
};

/** Телефон и узкая панель: один столбец — возраст ребёнка — и переключатель возраста. */
const CompactTable: React.FC<{ snapshot: FeedingSnapshot; column: NormColumn | null }> = ({ snapshot, column }) => {
  const theme = useTheme();
  const [chosen, setChosen] = React.useState<NormColumn>(column ?? "9-12");
  React.useEffect(() => {
    if (column) setChosen(column);
  }, [column]);
  return (
    <Box sx={{ [`@container feeding-norms (min-width: ${FULL_FROM}px)`]: { display: "none" } }}>
      <Stack direction="row" gap={0.5} role="group" aria-label="Возраст" sx={{ mb: 1, flexWrap: "wrap" }}>
        {NORM_COLUMNS.map((item) => {
          const active = item.key === chosen;
          return (
            <ButtonBase
              key={item.key}
              onClick={() => setChosen(item.key)}
              aria-pressed={active}
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: "999px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? theme.palette.primary.contrastText : item.key === column ? "primary.main" : "text.secondary",
                bgcolor: active ? "primary.main" : "transparent",
                border: `1px solid ${active ? theme.palette.primary.main : subtleBorder(theme)}`,
              }}
            >
              {item.label}
            </ButtonBase>
          );
        })}
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", columnGap: 1.25, rowGap: 0.5, alignItems: "center" }}>
        {NORM_ROWS.map((row) => {
          const value = normCell(row, chosen);
          return (
            <React.Fragment key={row.key}>
              <Typography variant="body2" sx={{ fontSize: 13 }} title={row.note}>
                {row.label}
                {row.alt && value && (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    / {row.alt.label}
                  </Typography>
                )}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  color: value ? "text.primary" : "text.disabled",
                }}
              >
                {value ?? "–"}
              </Typography>
              <Status snapshot={snapshot} rowKey={row.key} />
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
};

interface FeedingNormsProps {
  snapshot: FeedingSnapshot;
  months: number;
}

/** «Норма на день» (§3.4): табл. 5.1 программы РФ 2019 со статусами строк; после года — свёрнута. */
export const FeedingNorms: React.FC<FeedingNormsProps> = ({ snapshot, months }) => {
  const column = normColumn(months);
  const afterYear = column === "after";
  const [open, setOpen] = React.useState(false);
  const tables = (
    <>
      <FullTable snapshot={snapshot} column={afterYear ? null : (column as NormColumn | null)} />
      <CompactTable snapshot={snapshot} column={afterYear ? null : (column as NormColumn | null)} />
      <Typography variant="caption" color="text.secondary">
        {NORM_FOOTNOTE}
      </Typography>
    </>
  );
  return (
    <FeedingPanel
      title={afterYear ? "Норма на день" : `Норма на день в ${NORM_COLUMNS.find((item) => item.key === column)?.label ?? ""}`}
      caption="г или мл"
      sx={{ containerType: "inline-size", containerName: "feeding-norms" }}
    >
      {afterYear ? (
        <>
          <Typography variant="body2" fontWeight={500}>
            {afterYearNorm(months)}
          </Typography>
          <ButtonBase
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            sx={{ alignSelf: "flex-start", borderRadius: "8px", px: 0.5, gap: 0.5, color: "text.secondary" }}
          >
            <ExpandMoreOutlined fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            <Typography variant="body2" fontWeight={600}>
              Первый год (табл. 5.1)
            </Typography>
          </ButtonBase>
          <Collapse in={open} unmountOnExit>
            <Stack gap={1}>{tables}</Stack>
          </Collapse>
        </>
      ) : (
        tables
      )}
    </FeedingPanel>
  );
};
