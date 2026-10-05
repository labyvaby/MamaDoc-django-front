import React from "react";
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import type { TreasuryAccount } from "../../api/treasury";
import { pillSx } from "../../components/ui";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Шторка формы финансов: шапка, прокручиваемое тело, «Отмена» и действие снизу. */
export function FormDrawer({
  open,
  title,
  submitLabel,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT("realtyFinance");
  const id = React.useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {title}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={busy}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box
        component="form"
        id={id}
        noValidate
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
        sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}
      >
        {children}
        {Boolean(error) && <Alert severity="error">{errorText(error, t("common.failed"))}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form={id} variant="contained" disabled={busy}>
          {submitLabel}
        </Button>
      </Box>
    </Drawer>
  );
}

/** Подтверждение действия с деньгами: текст, необязательные поля и кнопка. */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  busy,
  error,
  danger = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  text?: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: unknown;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useT("realtyFinance");
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 460 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        {text && <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{text}</Typography>}
        {children}
        {Boolean(error) && <Alert severity="error">{errorText(error, t("common.failed"))}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" color={danger ? "error" : "primary"} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Ряд вкладок-пилюль со счётчиком. */
export function PillTabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; count?: number | null }[]; value: K; onChange: (key: K) => void }) {
  return (
    <Box role="tablist" sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {tabs.map((tab) => (
        <ButtonBase key={tab.key} role="tab" aria-selected={value === tab.key} onClick={() => onChange(tab.key)} sx={(th) => ({ ...pillSx(th, value === tab.key), whiteSpace: "nowrap" })}>
          {tab.label}
          {tab.count != null ? ` · ${tab.count}` : ""}
        </ButtonBase>
      ))}
    </Box>
  );
}

/** Мелкий переключатель внутри вкладки (тип, статус). */
export function SubPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <ButtonBase
      aria-pressed={active}
      onClick={onClick}
      sx={(th) => ({
        px: 1.25,
        py: 0.4,
        borderRadius: "8px",
        fontSize: "0.8125rem",
        whiteSpace: "nowrap",
        color: active ? "text.primary" : "text.secondary",
        fontWeight: active ? 700 : 500,
        bgcolor: active ? subtleBg(th, true) : "transparent",
      })}
    >
      {label}
    </ButtonBase>
  );
}

export function TwoLines({ top, bottom, strong = false }: { top: React.ReactNode; bottom?: React.ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ py: 1, minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: strong ? 600 : 400 }}>
        {top}
      </Typography>
      {bottom && (
        <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {bottom}
        </Typography>
      )}
    </Box>
  );
}

/** Строка «подпись — значение» в карточках и шторках. */
export function InfoRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "error" | "success" | "warning" | null }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, py: 0.6, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ flex: "0 0 auto", maxWidth: "50%", fontSize: "0.8125rem", color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: "0.875rem", fontWeight: 600, overflowWrap: "anywhere", color: tone ? `${tone}.main` : "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Полосы сумм (структура прихода/расхода, aging): доля от максимума. */
export function AmountBars({ items, tone = "primary", empty }: { items: { key: string; label: string; amount: number; hint?: string }[]; tone?: "primary" | "success" | "error" | "warning" | "info"; empty: string }) {
  const max = Math.max(0, ...items.map((i) => i.amount));
  if (items.length === 0 || max === 0) return <Typography sx={{ px: 2.25, pb: 2, fontSize: "0.8125rem", color: "text.secondary" }}>{empty}</Typography>;
  return (
    <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1.25 }}>
      {items.map((item) => (
        <Box key={item.key} sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>
              {item.label}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatKGS(item.amount)}</Typography>
          </Box>
          <Box sx={(th) => ({ mt: 0.5, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
            <Box sx={{ width: `${Math.max(2, (item.amount / max) * 100)}%`, height: "100%", borderRadius: 3, bgcolor: `${tone}.main` }} />
          </Box>
          {item.hint && <Typography sx={{ mt: 0.25, fontSize: "0.72rem", color: "text.secondary" }}>{item.hint}</Typography>}
        </Box>
      ))}
    </Box>
  );
}

/** Селект счёта: подпись — название и остаток. */
export function AccountSelect({
  accounts,
  value,
  onChange,
  label,
  emptyLabel,
  disabledIds = [],
  error,
  helperText,
}: {
  accounts: TreasuryAccount[];
  value: number | "";
  onChange: (id: number | "") => void;
  label: string;
  /** Пустой пункт (например «Основной расчётный счёт»); без него поле обязательное. */
  emptyLabel?: string;
  disabledIds?: number[];
  error?: boolean;
  helperText?: React.ReactNode;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      error={error}
      helperText={helperText}
      SelectProps={{ displayEmpty: Boolean(emptyLabel) }}
      InputLabelProps={emptyLabel ? { shrink: true } : undefined}
    >
      {emptyLabel && <MenuItem value="">{emptyLabel}</MenuItem>}
      {accounts.map((account) => (
        <MenuItem key={account.id} value={account.id} disabled={disabledIds.includes(account.id)}>
          <Box sx={{ display: "flex", width: "100%", gap: 1, minWidth: 0 }}>
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {account.name}
            </Box>
            <Box component="span" sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {account.currency === "KGS" ? formatKGS(account.balance) : `${account.fx.toLocaleString("ru-RU")} ${account.currency}`}
            </Box>
          </Box>
        </MenuItem>
      ))}
    </TextField>
  );
}

export function ProjectSelect({ projects, value, onChange, label }: { projects: { id: number; name: string }[]; value: number | ""; onChange: (id: number | "") => void; label: string }) {
  const { t } = useT("realtyFinance");
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      SelectProps={{ displayEmpty: true }}
      InputLabelProps={{ shrink: true }}
    >
      <MenuItem value="">{t("common.noProject")}</MenuItem>
      {projects.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {p.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Пустое состояние таблиц. */
export function EmptyNote({ text }: { text: string }) {
  return <Typography sx={{ p: 3, textAlign: "center", fontSize: "0.875rem", color: "text.secondary" }}>{text}</Typography>;
}
