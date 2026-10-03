/**
 * Переключатель отчётов — одной строкой, чтобы над отчётом было как можно
 * меньше лишнего: на широком экране вкладки, на телефоне и планшете — одна
 * кнопка-список «Собственнику ▾» со всеми отчётами и подписями. Плитки
 * занимали до 150 px, а на телефоне сетка — 200 px, и до цифр приходилось
 * листать. trailing — значок «i» и «Свернуть панель» справа.
 */
import React from "react";
import { Box, ButtonBase, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import { subtleBorder } from "../theme/uiHelpers";
import type { HotelReportKind } from "./hotelReportUi";

export interface ReportMeta {
  kind: HotelReportKind;
  label: string;
  /** Короче для вкладок на средних экранах: «Доходность» вместо «Доходность и загрузка». */
  short?: string;
  hint: string;
  audience: string;
  icon: React.ReactNode;
  info: string;
}

export const HotelReportSwitcher: React.FC<{
  reports: ReportMeta[];
  current: ReportMeta;
  onSelect: (kind: HotelReportKind) => void;
  trailing?: React.ReactNode;
}> = ({ reports, current, onSelect, trailing }) => {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const primary = theme.palette.primary.main;
  const dark = theme.palette.mode === "dark";
  const iconBox = (active: boolean, size: number, icon: React.ReactNode) => (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: active ? "primary.contrastText" : "primary.main",
        bgcolor: active ? "primary.main" : alpha(primary, dark ? 0.18 : 0.08),
        "& svg": { fontSize: size * 0.58 },
      }}
    >
      {icon}
    </Box>
  );

  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
      <Typography component="h1" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Отчёты — {current.label}
      </Typography>
      {wide ? (
        <Box
          role="tablist"
          aria-label="Отчёты"
          sx={{
            display: "flex",
            gap: 0.5,
            p: 0.5,
            borderRadius: "12px",
            border: `1px solid ${subtleBorder(theme)}`,
            bgcolor: "background.paper",
            boxShadow: `0 1px 2px ${alpha("#101828", dark ? 0.4 : 0.05)}`,
            minWidth: 0,
          }}
        >
          {reports.map((r) => {
            const active = r.kind === current.kind;
            return (
              <ButtonBase
                key={r.kind}
                role="tab"
                aria-selected={active}
                title={r.hint}
                onClick={() => onSelect(r.kind)}
                sx={{
                  gap: 0.875,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: "9px",
                  fontSize: 14,
                  fontWeight: active ? 700 : 600,
                  whiteSpace: "nowrap",
                  color: active ? (dark ? "primary.light" : "primary.dark") : "text.secondary",
                  bgcolor: active ? alpha(primary, dark ? 0.2 : 0.09) : "transparent",
                  transition: "background-color .15s, color .15s",
                  "@media (hover: hover)": { "&:hover": { bgcolor: active ? alpha(primary, dark ? 0.24 : 0.12) : theme.palette.action.hover, color: active ? undefined : "text.primary" } },
                  "&.Mui-focusVisible": { outline: `2px solid ${primary}`, outlineOffset: 1 },
                  "& .report-icon svg": { fontSize: 18 },
                }}
              >
                <Box component="span" className="report-icon" sx={{ display: "flex", color: active ? "inherit" : "primary.main" }}>
                  {r.icon}
                </Box>
                <Box component="span" sx={{ display: { lg: "inline", xl: "none" } }}>
                  {r.short ?? r.label}
                </Box>
                <Box component="span" sx={{ display: { lg: "none", xl: "inline" } }}>
                  {r.label}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      ) : (
        <>
          <ButtonBase
            onClick={(e) => setAnchor(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={anchor != null}
            aria-label={`Отчёт: ${current.label}. Выбрать другой`}
            sx={{
              flex: { xs: 1, sm: "0 1 auto" },
              minWidth: 0,
              minHeight: 48,
              gap: 1.25,
              px: 1.25,
              justifyContent: "flex-start",
              textAlign: "left",
              borderRadius: "12px",
              border: `1px solid ${subtleBorder(theme)}`,
              bgcolor: "background.paper",
              boxShadow: `0 1px 2px ${alpha("#101828", dark ? 0.4 : 0.05)}`,
              "&.Mui-focusVisible": { outline: `2px solid ${primary}`, outlineOffset: 2 },
            }}
          >
            {iconBox(true, 32, current.icon)}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }} noWrap>
                {current.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {current.hint}
              </Typography>
            </Box>
            <ExpandMoreOutlined sx={{ color: "text.secondary", transform: anchor ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </ButtonBase>
          <Menu
            anchorEl={anchor}
            open={anchor != null}
            onClose={() => setAnchor(null)}
            slotProps={{ paper: { sx: { width: anchor?.offsetWidth, minWidth: 280, maxWidth: "calc(100vw - 32px)", borderRadius: "12px", mt: 0.5 } } }}
          >
            {reports.map((r) => {
              const active = r.kind === current.kind;
              return (
                <MenuItem
                  key={r.kind}
                  selected={active}
                  onClick={() => {
                    setAnchor(null);
                    onSelect(r.kind);
                  }}
                  sx={{ minHeight: 52, gap: 1.25, borderRadius: "8px", mx: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 0 }}>{iconBox(active, 30, r.icon)}</ListItemIcon>
                  <ListItemText
                    primary={r.label}
                    secondary={r.hint}
                    slotProps={{ primary: { sx: { fontWeight: active ? 700 : 600, fontSize: 14.5 } }, secondary: { sx: { fontSize: 12 } } }}
                  />
                  {active && <CheckOutlined sx={{ fontSize: 18, color: "primary.main" }} />}
                </MenuItem>
              );
            })}
          </Menu>
        </>
      )}
      <Box sx={{ flex: { xs: 0, sm: 1 } }} />
      {trailing}
    </Stack>
  );
};

export default HotelReportSwitcher;
