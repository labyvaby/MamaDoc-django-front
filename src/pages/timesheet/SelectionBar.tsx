import React from "react";
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import BackspaceOutlined from "@mui/icons-material/BackspaceOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import RedoOutlined from "@mui/icons-material/RedoOutlined";
import { AnimatePresence, motion } from "framer-motion";

import type { TimesheetCode } from "../../api/timesheet";
import { codeFill, codeInk } from "./codeColors";
import { hotkeyLabel } from "./model";

const MotionBox = motion.create(Box);

export interface SelectionBarProps {
  open: boolean;
  label: string;
  codes: TimesheetCode[];
  allCodes: TimesheetCode[];
  canSet: boolean;
  canClear: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  compact: boolean;
  onApply: (code: string) => void;
  onApplyHours: (dayHours: number, nightHours: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  open,
  label,
  codes,
  allCodes,
  canSet,
  canClear,
  canUndo,
  canRedo,
  busy,
  compact,
  onApply,
  onApplyHours,
  onClear,
  onUndo,
  onRedo,
  onClose,
}) => {
  const theme = useTheme();
  const [hoursAnchor, setHoursAnchor] = React.useState<HTMLElement | null>(null);
  const [day, setDay] = React.useState("8");
  const [night, setNight] = React.useState("0");

  const submitHours = () => {
    const dayValue = Number(day.replace(",", "."));
    const nightValue = Number(night.replace(",", "."));
    if (!Number.isFinite(dayValue) || !Number.isFinite(nightValue)) return;
    onApplyHours(Math.max(0, dayValue), Math.max(0, nightValue));
    setHoursAnchor(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <MotionBox
          key="selection-bar"
          initial={{ opacity: 0, y: 24, x: "-50%", scale: 0.97 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, y: 20, x: "-50%", scale: 0.97 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          sx={{
            position: "fixed",
            left: "50%",
            bottom: { xs: 12, md: 24 },
            zIndex: (t) => t.zIndex.speedDial,
            width: { xs: "calc(100vw - 24px)", md: "auto" },
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <Box
            sx={{
              px: 1.25,
              py: 1,
              borderRadius: "16px",
              bgcolor: theme.palette.mode === "dark" ? "rgba(23,26,31,.92)" : "rgba(255,255,255,.94)",
              backdropFilter: "blur(14px) saturate(1.4)",
              border: 1,
              borderColor: alpha(theme.palette.primary.main, 0.25),
              boxShadow: `0 18px 48px ${alpha("#000", theme.palette.mode === "dark" ? 0.5 : 0.18)}`,
            }}
          >
            <Stack
              direction={compact ? "column" : "row"}
              spacing={compact ? 1 : 1.25}
              alignItems={compact ? "stretch" : "center"}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 0.5, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={800} noWrap sx={{ minWidth: 0 }}>
                  {label}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {compact && (
                  <IconButton size="small" onClick={onClose} aria-label="Снять выделение">
                    <CloseOutlined fontSize="small" />
                  </IconButton>
                )}
              </Stack>
              {!compact && <Divider orientation="vertical" flexItem />}
              {canSet && (
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ overflowX: "auto", pb: compact ? 0.25 : 0, "&::-webkit-scrollbar": { display: "none" } }}
                >
                  {codes.map((code) => {
                    const hotkey = hotkeyLabel(allCodes, code.key);
                    return (
                      <Tooltip
                        key={code.key}
                        title={`${code.name}${hotkey ? ` — клавиша ${hotkey}` : ""}`}
                        placement="top"
                      >
                        <span>
                          <ButtonBase
                            disabled={busy}
                            onClick={() => onApply(code.key)}
                            sx={{
                              position: "relative",
                              minWidth: 38,
                              height: 38,
                              px: 1,
                              borderRadius: "10px",
                              fontWeight: 800,
                              fontSize: 14,
                              color: codeInk(theme, code.color),
                              bgcolor: codeFill(theme, code.color),
                              border: `1px solid ${alpha(code.color, 0.35)}`,
                              transition: "transform .12s ease, box-shadow .12s ease",
                              "&:hover": {
                                transform: "translateY(-2px)",
                                boxShadow: `0 8px 18px ${alpha(code.color, 0.35)}`,
                              },
                            }}
                          >
                            {code.letter}
                            {hotkey && hotkey !== code.letter.charAt(0).toUpperCase() && (
                              <Box
                                component="span"
                                sx={{ position: "absolute", bottom: 1, right: 3, fontSize: 8, opacity: 0.6 }}
                              >
                                {hotkey}
                              </Box>
                            )}
                          </ButtonBase>
                        </span>
                      </Tooltip>
                    );
                  })}
                  <Tooltip title="«Я» с заданными часами — или цифры на клавиатуре" placement="top">
                    <span>
                      <ButtonBase
                        disabled={busy}
                        onClick={(event) => setHoursAnchor(event.currentTarget)}
                        sx={{
                          height: 38,
                          px: 1.25,
                          borderRadius: "10px",
                          gap: 0.5,
                          fontWeight: 700,
                          fontSize: 13,
                          border: 1,
                          borderColor: "divider",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <ScheduleOutlined sx={{ fontSize: 18 }} />
                        Часы
                      </ButtonBase>
                    </span>
                  </Tooltip>
                </Stack>
              )}
              {!compact && <Divider orientation="vertical" flexItem />}
              <Stack direction="row" spacing={0.5} alignItems="center" justifyContent={compact ? "space-between" : "flex-start"}>
                {canClear && (
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    startIcon={<BackspaceOutlined />}
                    onClick={onClear}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Снять
                  </Button>
                )}
                <Tooltip title="Отменить (Ctrl+Z)">
                  <span>
                    <IconButton size="small" disabled={!canUndo || busy} onClick={onUndo}>
                      <UndoOutlined fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Повторить (Ctrl+Shift+Z)">
                  <span>
                    <IconButton size="small" disabled={!canRedo || busy} onClick={onRedo}>
                      <RedoOutlined fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {!compact && (
                  <Tooltip title="Снять выделение (Esc)">
                    <IconButton size="small" onClick={onClose}>
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </Box>
          <Popover
            open={Boolean(hoursAnchor)}
            anchorEl={hoursAnchor}
            onClose={() => setHoursAnchor(null)}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            transformOrigin={{ vertical: "bottom", horizontal: "center" }}
            slotProps={{ paper: { sx: { borderRadius: "14px", p: 2, width: 260, mt: -1 } } }}
          >
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>
              Явка с часами
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Эти часы пойдут в зарплату вместо данных СКУД.
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Днём, ч"
                size="small"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                inputProps={{ inputMode: "decimal" }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitHours();
                  e.stopPropagation();
                }}
              />
              <TextField
                label="Ночью, ч"
                size="small"
                value={night}
                onChange={(e) => setNight(e.target.value)}
                inputProps={{ inputMode: "decimal" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitHours();
                  e.stopPropagation();
                }}
              />
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: "wrap" }}>
              {[4, 6, 8, 9, 12].map((preset) => (
                <Button
                  key={preset}
                  size="small"
                  variant={day === String(preset) ? "contained" : "outlined"}
                  onClick={() => setDay(String(preset))}
                  sx={{ minWidth: 40, borderRadius: "8px" }}
                >
                  {preset}
                </Button>
              ))}
            </Stack>
            <Button fullWidth variant="contained" sx={{ mt: 1.5, borderRadius: "10px" }} onClick={submitHours}>
              Поставить «Я»
            </Button>
          </Popover>
        </MotionBox>
      )}
    </AnimatePresence>
  );
};

export default SelectionBar;
