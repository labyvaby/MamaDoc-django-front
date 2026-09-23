import React from "react";
import { Box, ButtonBase, IconButton, Stack, Switch, TextField, Typography } from "@mui/material";
import { motion } from "framer-motion";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { pillSx } from "../../../components/ui";

/**
 * Общие кирпичи панели сотрудника и форм вкладки «Настройка»: шапка панели,
 * подписи полей, сегмент на всю ширину, пилюли-пресеты, поля времени.
 */

// ── Подписи и строки ──────────────────────────────────────────────────────────

export const SectionLabel: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({
  children,
  action,
}) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>{children}</Typography>
    {action}
  </Stack>
);

/** Пилюля-пресет (срок, дни недели, один день / период). */
export const PresetPill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <ButtonBase onClick={onClick} sx={(t) => ({ ...pillSx(t, active), whiteSpace: "nowrap" })}>
    {children}
  </ButtonBase>
);

/**
 * Сегмент на всю ширину (§5.7): половинки/трети под палец, подвижный фон
 * активного через layoutId. `layoutId` уникален на экран.
 */
export function FullSegment<K extends string>({
  options,
  value,
  onChange,
  layoutId,
  disabled,
}: {
  options: { id: K; label: string }[];
  value: K;
  onChange: (id: K) => void;
  layoutId: string;
  disabled?: boolean;
}) {
  return (
    <Stack
      direction="row"
      role="tablist"
      sx={{
        p: 0.5,
        gap: 0.25,
        border: 1,
        borderColor: "divider",
        borderRadius: "10px",
        bgcolor: "background.paper",
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {options.map(({ id, label }) => {
        const active = value === id;
        return (
          <ButtonBase
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            sx={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              px: 1,
              py: 0.9,
              borderRadius: "7px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: active ? "primary.contrastText" : "text.secondary",
              transition: "color .15s ease",
            }}
          >
            {active && (
              <Box
                component={motion.span}
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                sx={{ position: "absolute", inset: 0, borderRadius: "7px", bgcolor: "primary.main" }}
              />
            )}
            <Box component="span" sx={{ position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </Box>
          </ButtonBase>
        );
      })}
    </Stack>
  );
}

/** Строка «подпись + Switch» (обед, не весь день). */
export const SwitchLine: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={0.5}
    component="label"
    sx={{ cursor: disabled ? "default" : "pointer", ml: -1, width: "fit-content" }}
  >
    <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
    <Typography sx={{ fontSize: 14 }}>{label}</Typography>
  </Stack>
);

/** Рамка «заголовок + пояснение + Switch» (онлайн-запись, продлить вместе). */
export const SwitchCard: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}> = ({ checked, onChange, title, description, disabled }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.5}
    sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px" }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{title}</Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{description}</Typography>
    </Box>
    <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
  </Stack>
);

/** Два поля времени через «—». */
export const TimeRange: React.FC<{
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  disabled?: boolean;
  error?: string | null;
  compact?: boolean;
  anchorRef?: React.Ref<HTMLDivElement>;
  labels?: [string, string];
}> = ({ start, end, onStart, onEnd, disabled, error, compact, anchorRef, labels }) => {
  const field = (value: string, onChange: (v: string) => void, aria: string) => (
    <TextField
      type="time"
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      error={Boolean(error)}
      inputProps={{ "aria-label": aria, step: 300 }}
      sx={{
        flex: 1,
        minWidth: 0,
        "& .MuiInputBase-root": compact ? { height: 36 } : undefined,
        "& input": { fontVariantNumeric: "tabular-nums" },
      }}
    />
  );
  return (
    <Box ref={anchorRef}>
      <Stack direction="row" alignItems="center" gap={1}>
        {field(start, onStart, labels?.[0] ?? "Начало")}
        <Typography color="text.secondary">—</Typography>
        {field(end, onEnd, labels?.[1] ?? "Конец")}
      </Stack>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};

// ── Каркас панели ─────────────────────────────────────────────────────────────

/** Шапка панели: «назад» (опционально), заголовок, подзаголовок, «закрыть». */
export const PanelHeader: React.FC<{
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  onBack?: () => void;
  onClose: () => void;
  disabled?: boolean;
}> = ({ title, subtitle, leading, onBack, onClose, disabled }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.25}
    sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
  >
    {onBack && (
      <IconButton onClick={disabled ? undefined : onBack} aria-label="Назад" edge="start" sx={{ mr: -0.25 }}>
        <ArrowBackOutlined />
      </IconButton>
    )}
    {leading}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.15px" }} noWrap>
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }} noWrap>
          {subtitle}
        </Typography>
      )}
    </Box>
    <IconButton onClick={disabled ? undefined : onClose} aria-label="Закрыть" edge="end">
      <CloseOutlined />
    </IconButton>
  </Stack>
);
