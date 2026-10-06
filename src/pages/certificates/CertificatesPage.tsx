import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";

import { getErrorCode, getErrorMessage } from "../../api/client";
import {
  GIFT_CERTIFICATE_PAGE_SIZE,
  getGiftCertificate,
  getGiftCertificateRegistry,
  getGiftCertificateSettings,
  updateGiftCertificateSettings,
  voidGiftCertificate,
  type GiftCertificateDetail,
  type GiftCertificateRegistryFilters,
  type GiftCertificateRegistrySummary,
  type GiftCertificateRow,
  type GiftCertificateStatus,
} from "../../api/promotions";
import {
  AppButton,
  DateRangeField,
  FilterPill,
  ListEmptyState,
  PageHeader,
  ReasonDialog,
  SegmentedTabs,
  TonedChip,
  type DateRange,
} from "../../components/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { ALL_TIME_PRESET, HISTORY_PERIOD_PRESETS, historyPreset } from "../pos/historyMeta";
import { PosAmount } from "../pos/ui";
import { CertificateBranchReport } from "./CertificateBranchReport";
import { CertificateDetailDrawer } from "./CertificateDetailDrawer";
import { certificateExpiryLabel, certificateStatusMeta, redeemedBranchesLabel } from "./certificateMeta";

// ── Фильтры ─────────────────────────────────────────────────────────────────────

type View = "registry" | "branches";
type StatusTab = "" | GiftCertificateStatus;

const VIEW_TABS: Array<{ key: View; label: string }> = [
  { key: "registry", label: "Реестр" },
  { key: "branches", label: "По филиалам" },
];

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "spent", label: "Израсходованные" },
  { key: "expired", label: "Просроченные" },
  { key: "void", label: "Аннулированные" },
];

const presetRange = (key: string): DateRange => {
  const [from, to] = historyPreset(key).range();
  return { from: from.startOf("day"), to: to.endOf("day") };
};

const dateLabel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = dayjs(iso).locale("ru");
  return date.isSame(dayjs(), "year") ? date.format("D MMM, HH:mm") : date.format("D MMM YYYY");
};

const voidErrorText = (error: unknown) => {
  const code = getErrorCode(error);
  if (code === "CERTIFICATE_REDEEMED") {
    return "Сертификатом уже платили — аннулировать его нельзя. Сначала оформите возврат товаров, оплаченных этим сертификатом.";
  }
  if (code === "CERTIFICATE_VOID") return "Сертификат уже аннулирован.";
  return getErrorMessage(error, "Не удалось аннулировать сертификат.");
};

const statusHint = (summary: GiftCertificateRegistrySummary) => {
  const by = summary.byStatus ?? {};
  const parts = [
    by.active ? `активных ${by.active}` : null,
    by.spent ? `израсходовано ${by.spent}` : null,
    by.expired ? `просрочено ${by.expired}` : null,
    by.void ? `аннулировано ${by.void}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "нет сертификатов";
};

// ── Плитка показателя ────────────────────────────────────────────────────────────

type StatTone = "primary" | "success" | "info" | "warning";

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode | undefined;
  hint?: string;
  tone: StatTone;
}> = ({ icon, label, value, hint, tone }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.5}
    sx={{ minWidth: 0, p: { xs: 1.25, md: 1.5 }, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}
  >
    <Box
      sx={(t: Theme) => {
        const p = t.palette[tone];
        return {
          width: 40,
          height: 40,
          borderRadius: "10px",
          flexShrink: 0,
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: "center",
          color: tone === "primary" ? "primary.onSurface" : t.palette.mode === "dark" ? p.light : p.dark,
          bgcolor: alpha(p.main, t.palette.mode === "dark" ? 0.18 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 20 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      {value === undefined ? (
        <Skeleton width={72} height={28} />
      ) : (
        <Typography
          noWrap
          sx={{ fontSize: { xs: "1.125rem", md: "1.3rem" }, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </Typography>
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary" display="block" noWrap>
          {hint}
        </Typography>
      )}
    </Box>
  </Stack>
);

// ── Строки реестра ───────────────────────────────────────────────────────────────

/** Сертификат · номинал/остаток · продан · покупатель · получатель · где погашен · срок. */
const GRID =
  "minmax(130px, 1fr) minmax(120px, .8fr) minmax(150px, 1.1fr) minmax(130px, 1fr) minmax(120px, .9fr) minmax(160px, 1.2fr) minmax(100px, .7fr)";
const GRID_MIN_WIDTH = 1040;

const headerCellSx = {
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "text.secondary",
} as const;

const Secondary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" noWrap display="block">
    {children}
  </Typography>
);

const soldLabel = (row: GiftCertificateRow) => (row.soldAt ? dateLabel(row.soldAt) : `выпущен ${dateLabel(row.createdAt)}`);

const RegistryRow: React.FC<{ row: GiftCertificateRow; selected: boolean; onClick: () => void }> = ({ row, selected, onClick }) => {
  const status = certificateStatusMeta(row.status);
  const redeemed = redeemedBranchesLabel(row.redeemedBranches);
  return (
    <Box
      component={ButtonBase}
      focusRipple
      onClick={onClick}
      sx={(t) => ({
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 1.5,
        alignItems: "center",
        justifyContent: "start",
        width: "100%",
        textAlign: "left",
        px: 2,
        py: 1.25,
        borderTop: `1px solid ${subtleBorder(t)}`,
        bgcolor: selected ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07) : "transparent",
        transition: "background-color .15s ease",
        "&:hover": { bgcolor: selected ? alpha(t.palette.primary.main, 0.16) : subtleBg(t, true) },
      })}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>
          №{row.code}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <TonedChip label={status.label} toneName={status.tone} />
        </Box>
      </Box>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography variant="body2" fontWeight={800} noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>
          <PosAmount value={Number(row.balance)} />
        </Typography>
        <Secondary>
          из <PosAmount value={Number(row.nominal)} />
        </Secondary>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {row.soldBranchName || "Без филиала"}
        </Typography>
        <Secondary>
          {soldLabel(row)}
          {row.soldByName ? ` · ${row.soldByName}` : ""}
        </Secondary>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap color={row.buyerName ? "text.primary" : "text.secondary"}>
          {row.buyerName || "Не указан"}
        </Typography>
        {row.buyerPhone && <Secondary>{row.buyerPhone}</Secondary>}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap color={row.recipientName ? "text.primary" : "text.secondary"}>
          {row.recipientName || "—"}
        </Typography>
        {row.recipientPhone && <Secondary>{row.recipientPhone}</Secondary>}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap color={redeemed ? "text.primary" : "text.secondary"} title={redeemed || undefined}>
          {redeemed || "Не тратили"}
        </Typography>
        {row.lastRedeemedAt && <Secondary>последний раз {dateLabel(row.lastRedeemedAt)}</Secondary>}
      </Box>
      <Typography variant="body2" color="text.secondary" noWrap>
        {certificateExpiryLabel(row.expiresAt)}
      </Typography>
    </Box>
  );
};

const RegistryCard: React.FC<{ row: GiftCertificateRow; selected: boolean; onClick: () => void }> = ({ row, selected, onClick }) => {
  const status = certificateStatusMeta(row.status);
  const redeemed = redeemedBranchesLabel(row.redeemedBranches);
  return (
    <Box
      component={ButtonBase}
      focusRipple
      onClick={onClick}
      sx={(t) => ({
        display: "block",
        width: "100%",
        textAlign: "left",
        p: 1.5,
        borderRadius: "14px",
        border: 1,
        borderColor: selected ? alpha(t.palette.primary.main, 0.55) : "divider",
        bgcolor: selected ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06) : "background.paper",
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
      })}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
              №{row.code}
            </Typography>
            <TonedChip label={status.label} toneName={status.tone} />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            {row.soldBranchName || "Без филиала"} · {soldLabel(row)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography fontWeight={800} sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            <PosAmount value={Number(row.balance)} />
          </Typography>
          <Typography variant="caption" color="text.secondary">
            из <PosAmount value={Number(row.nominal)} />
          </Typography>
        </Box>
      </Stack>
      <Typography variant="body2" noWrap sx={{ mt: 1 }} color={redeemed ? "text.primary" : "text.secondary"}>
        {redeemed ? `Погашен: ${redeemed}` : "Сертификатом ещё не платили"}
      </Typography>
      <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {[row.buyerName, row.recipientName ? `для ${row.recipientName}` : null].filter(Boolean).join(" · ") || "Покупатель не указан"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {certificateExpiryLabel(row.expiresAt)}
        </Typography>
      </Stack>
    </Box>
  );
};

// ── Настройка срока ──────────────────────────────────────────────────────────────

const SettingsDialog: React.FC<{ open: boolean; organizationId: number | null; onClose: () => void }> = ({
  open,
  organizationId,
  onClose,
}) => {
  const cache = useQueryClient();
  const settings = useQuery({
    queryKey: ["django", "promotions", "certificates", "settings", organizationId],
    queryFn: ({ signal }) => getGiftCertificateSettings(organizationId, signal),
    enabled: open,
  });
  const [days, setDays] = React.useState("");
  React.useEffect(() => {
    if (open && settings.data) setDays(String(settings.data.validityDays));
  }, [open, settings.data]);
  const parsed = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 3650;
  const save = useMutation({
    mutationFn: () => updateGiftCertificateSettings(parsed, organizationId),
    onSuccess: (data) => {
      cache.setQueryData(["django", "promotions", "certificates", "settings", organizationId], data);
      void cache.invalidateQueries({ queryKey: ["django", "promotions", "certificates", "settings"] });
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Срок действия сертификатов</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Касса подставляет эту дату при продаже; кассир может выбрать другую дату или «Бессрочно». Уже проданные
          сертификаты не меняются.
        </Typography>
        <TextField
          label="Срок действия по умолчанию, дней"
          value={days}
          onChange={(event) => setDays(event.target.value.replace(/[^\d]/g, ""))}
          fullWidth
          autoFocus
          disabled={settings.isLoading || save.isPending}
          error={days.trim() !== "" && !valid}
          helperText={!valid && days.trim() !== "" ? "От 0 до 3650 дней" : "0 — бессрочно"}
          inputProps={{ inputMode: "numeric" }}
        />
        {settings.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {getErrorMessage(settings.error, "Не удалось загрузить настройку.")}
          </Alert>
        )}
        {save.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {getErrorMessage(save.error, "Не удалось сохранить настройку.")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <AppButton onClick={onClose} disabled={save.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          Сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────────

/**
 * Подарочные сертификаты: реестр с фильтрами и карточкой каждой карты, отчёт
 * «По филиалам» для взаиморасчёта точек и настройка срока по умолчанию.
 *
 * Сертификат принадлежит организации: продан в одном филиале, тратить его
 * можно в любом. Сотрудник филиала видит проданные или погашенные у себя;
 * что именно видно, решает бэк (изоляция филиалов), фронт фильтры лишь сужает.
 */
export default function CertificatesPage() {
  usePageTitle("Подарочные сертификаты");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const compact = useMediaQuery(theme.breakpoints.down("lg"));
  const auth = usePermissions();
  const cache = useQueryClient();
  const organizationId = auth.activeOrganization?.id ?? null;
  const canView = auth.canAccess("promotions.view") || auth.canAccess("promotions.manage");
  const canManage = auth.canAccess("promotions.manage");
  const enabled = Boolean(organizationId) && canView;

  const [view, setView] = React.useState<View>("registry");
  const [status, setStatus] = React.useState<StatusTab>("");
  const [periodKey, setPeriodKey] = React.useState<string | null>(ALL_TIME_PRESET);
  const [range, setRange] = React.useState<DateRange>(() => presetRange(ALL_TIME_PRESET));
  const [soldBranch, setSoldBranch] = React.useState("");
  const [redeemedBranch, setRedeemedBranch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput.trim());
  const [offset, setOffset] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [voidTarget, setVoidTarget] = React.useState<GiftCertificateDetail | null>(null);
  const [voidError, setVoidError] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  React.useEffect(() => setOffset(0), [search]);

  const allTime = periodKey === ALL_TIME_PRESET;
  const filters: GiftCertificateRegistryFilters = {
    soldBranchId: soldBranch ? Number(soldBranch) : undefined,
    redeemedBranchId: redeemedBranch ? Number(redeemedBranch) : undefined,
    dateFrom: allTime ? undefined : range.from.format("YYYY-MM-DD"),
    dateTo: allTime ? undefined : range.to.format("YYYY-MM-DD"),
    status: status || undefined,
    search: search || undefined,
    limit: GIFT_CERTIFICATE_PAGE_SIZE,
    offset,
  };

  const registry = useQuery({
    queryKey: ["django", "promotions", "certificates", "registry", organizationId, filters],
    queryFn: ({ signal }) => getGiftCertificateRegistry(filters, organizationId, signal),
    enabled: enabled && view === "registry",
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ["django", "promotions", "certificates", "detail", organizationId, selectedId],
    queryFn: ({ signal }) => getGiftCertificate(selectedId!, organizationId, signal),
    enabled: enabled && drawerOpen && selectedId != null,
  });

  const voidMutation = useMutation({
    mutationFn: ({ certificate, reason }: { certificate: GiftCertificateDetail; reason: string }) =>
      voidGiftCertificate(certificate.id, reason, organizationId),
    onSuccess: (fresh) => {
      setVoidTarget(null);
      setVoidError(null);
      cache.setQueryData(["django", "promotions", "certificates", "detail", organizationId, fresh.id], fresh);
      void cache.invalidateQueries({ queryKey: ["django", "promotions", "certificates"] });
      // Деньги за аннулированную карту возвращаются из кассы филиала продажи.
      void cache.invalidateQueries({ queryKey: ["django", "cashbox"] });
      void cache.invalidateQueries({ queryKey: ["django", "shifts"] });
    },
    onError: (error) => {
      setVoidTarget(null);
      setVoidError(voidErrorText(error));
    },
  });

  const branches = auth.activeMembership?.branches ?? [];
  const branchOptions = branches.map((branch) => ({ value: String(branch.id), label: branch.name }));
  const rows = registry.data?.items ?? [];
  const summary = registry.data?.summary;
  const total = registry.data?.count;
  const statFallback = registry.isError ? "—" : undefined;
  const hasFilters =
    status !== "" || periodKey !== ALL_TIME_PRESET || search !== "" || soldBranch !== "" || redeemedBranch !== "";

  const resetPage = () => setOffset(0);
  const resetFilters = () => {
    setSearchInput("");
    setStatus("");
    setPeriodKey(ALL_TIME_PRESET);
    setRange(presetRange(ALL_TIME_PRESET));
    setSoldBranch("");
    setRedeemedBranch("");
    resetPage();
  };
  const openCertificate = (row: GiftCertificateRow) => {
    setSelectedId(row.id);
    setDrawerOpen(true);
    setVoidError(null);
  };

  const pageStart = offset + 1;
  const pageEnd = offset + rows.length;
  const hasNext = total != null ? offset + GIFT_CERTIFICATE_PAGE_SIZE < total : false;

  const pagination = (rows.length > 0 || offset > 0) && (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {pageEnd >= pageStart ? `${pageStart}–${pageEnd}` : "0"}
        {total != null ? ` из ${total}` : ""}
      </Typography>
      <Stack direction="row" gap={0.5}>
        <AppButton
          size="small"
          variant="outlined"
          startIcon={<ChevronLeftOutlined />}
          disabled={offset === 0 || registry.isFetching}
          onClick={() => setOffset(Math.max(0, offset - GIFT_CERTIFICATE_PAGE_SIZE))}
        >
          Назад
        </AppButton>
        <AppButton
          size="small"
          variant="outlined"
          endIcon={<ChevronRightOutlined />}
          disabled={!hasNext || registry.isFetching}
          onClick={() => setOffset(offset + GIFT_CERTIFICATE_PAGE_SIZE)}
        >
          Далее
        </AppButton>
      </Stack>
    </Stack>
  );

  const emptyState = hasFilters ? (
    <ListEmptyState
      icon={<SearchOffOutlined />}
      title="Ничего не найдено"
      description="Поиск идёт по номеру карты, имени и телефону покупателя и получателю."
      action={<AppButton size="small" onClick={resetFilters}>Сбросить фильтры</AppButton>}
    />
  ) : (
    <ListEmptyState
      icon={<CardGiftcardOutlined />}
      title="Сертификатов пока нет"
      description="Продайте подарочный сертификат на кассе магазина — он появится здесь сразу."
    />
  );

  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
      <Box sx={{ pt: 2, width: "100%", maxWidth: 1440, mx: "auto" }}>
        <PageHeader
          title="Подарочные сертификаты"
          showTitle={false}
          showSearch={view === "registry"}
          searchVal={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Номер, покупатель или получатель"
          loading={registry.isFetching}
          actions={
            canManage ? (
              isMobile ? (
                <Tooltip title="Срок действия по умолчанию">
                  <IconButton
                    onClick={() => setSettingsOpen(true)}
                    sx={{ border: 1, borderColor: "divider", borderRadius: "10px" }}
                    aria-label="Срок действия по умолчанию"
                  >
                    <SettingsOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <AppButton variant="outlined" startIcon={<SettingsOutlined />} onClick={() => setSettingsOpen(true)}>
                  Срок действия
                </AppButton>
              )
            ) : undefined
          }
        />

        <Box sx={{ px: theme.appLayout.page.paddingX, pb: 3 }}>
          {!organizationId && !auth.loading ? (
            <Alert severity="info">Выберите организацию, чтобы увидеть сертификаты.</Alert>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <SegmentedTabs layoutId="certificates-view" tabs={VIEW_TABS} value={view} onChange={setView} />
              </Box>

              {view === "branches" ? (
                <CertificateBranchReport organizationId={organizationId} enabled={enabled} />
              ) : (
                <>
                  {/* ── Показатели по отфильтрованному набору ── */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
                      gap: { xs: 1, sm: 1.25 },
                    }}
                  >
                    <StatTile
                      icon={<CardGiftcardOutlined />}
                      label="Сертификатов"
                      tone="primary"
                      value={summary ? summary.count : statFallback}
                      hint={summary ? statusHint(summary) : undefined}
                    />
                    <StatTile
                      icon={<PaymentsOutlined />}
                      label="Номинал"
                      tone="info"
                      value={summary ? <PosAmount value={Number(summary.nominal)} /> : statFallback}
                      hint="сумма номиналов"
                    />
                    <StatTile
                      icon={<AccountBalanceWalletOutlined />}
                      label="Активный остаток"
                      tone="success"
                      value={summary ? <PosAmount value={Number(summary.activeBalance)} /> : statFallback}
                      hint="ещё можно потратить"
                    />
                    <StatTile
                      icon={<EventBusyOutlined />}
                      label="Просроченный остаток"
                      tone="warning"
                      value={summary ? <PosAmount value={Number(summary.expiredBalance)} /> : statFallback}
                      hint="срок истёк, не потрачено"
                    />
                  </Box>

                  {/* ── Фильтры ── */}
                  <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" sx={{ mt: 2, mb: 1.5 }}>
                    <SegmentedTabs
                      layoutId="certificates-status"
                      tabs={STATUS_TABS}
                      value={status}
                      onChange={(next) => {
                        setStatus(next);
                        resetPage();
                      }}
                    />
                    <DateRangeField
                      dense
                      value={range}
                      presets={HISTORY_PERIOD_PRESETS}
                      onChange={(next, presetKey) => {
                        setRange(next);
                        setPeriodKey(presetKey);
                        resetPage();
                      }}
                      referenceDate={allTime ? dayjs() : undefined}
                      minWidth={168}
                    />
                    {branchOptions.length > 1 && (
                      <>
                        <FilterPill
                          label="Продан в"
                          icon={<StorefrontOutlined />}
                          value={soldBranch}
                          options={branchOptions}
                          allLabel="Все филиалы"
                          onChange={(value) => {
                            setSoldBranch(value);
                            resetPage();
                          }}
                        />
                        <FilterPill
                          label="Погашен в"
                          icon={<ShoppingBagOutlined />}
                          value={redeemedBranch}
                          options={branchOptions}
                          allLabel="Все филиалы"
                          onChange={(value) => {
                            setRedeemedBranch(value);
                            resetPage();
                          }}
                        />
                      </>
                    )}
                    {hasFilters && (
                      <AppButton
                        size="small"
                        onClick={resetFilters}
                        startIcon={<CloseOutlined fontSize="small" />}
                        sx={{ height: 30, minHeight: 30 }}
                      >
                        Сбросить
                      </AppButton>
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    Период — по дню продажи (у выпущенных без продажи — по дню выпуска).
                  </Typography>

                  {registry.isError ? (
                    <Alert
                      severity="error"
                      action={
                        <AppButton size="small" color="inherit" onClick={() => void registry.refetch()}>
                          Повторить
                        </AppButton>
                      }
                    >
                      {getErrorMessage(registry.error, "Не удалось загрузить сертификаты.")}
                    </Alert>
                  ) : registry.isLoading || auth.loading ? (
                    <Stack spacing={1}>
                      {[0, 1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} variant="rounded" height={compact ? 112 : 64} sx={{ borderRadius: "14px" }} />
                      ))}
                    </Stack>
                  ) : rows.length === 0 ? (
                    <Box sx={{ borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                      {emptyState}
                    </Box>
                  ) : compact ? (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                        gap: 1,
                        opacity: registry.isFetching ? 0.6 : 1,
                        transition: "opacity .15s ease",
                      }}
                    >
                      {rows.map((row) => (
                        <RegistryCard
                          key={row.id}
                          row={row}
                          selected={drawerOpen && selectedId === row.id}
                          onClick={() => openCertificate(row)}
                        />
                      ))}
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        borderRadius: "14px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        overflowX: "auto",
                        opacity: registry.isFetching ? 0.6 : 1,
                        transition: "opacity .15s ease",
                      }}
                    >
                      <Box sx={{ minWidth: GRID_MIN_WIDTH }}>
                        <Box sx={{ display: "grid", gridTemplateColumns: GRID, gap: 1.5, px: 2, py: 1.25 }}>
                          <Typography sx={headerCellSx}>Сертификат</Typography>
                          <Typography sx={{ ...headerCellSx, textAlign: "right" }}>Остаток / номинал</Typography>
                          <Typography sx={headerCellSx}>Продан</Typography>
                          <Typography sx={headerCellSx}>Покупатель</Typography>
                          <Typography sx={headerCellSx}>Получатель</Typography>
                          <Typography sx={headerCellSx}>Где погашен</Typography>
                          <Typography sx={headerCellSx}>Срок</Typography>
                        </Box>
                        {rows.map((row) => (
                          <RegistryRow
                            key={row.id}
                            row={row}
                            selected={drawerOpen && selectedId === row.id}
                            onClick={() => openCertificate(row)}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {!registry.isError && !registry.isLoading && pagination}
                </>
              )}
            </>
          )}
        </Box>
      </Box>

      <CertificateDetailDrawer
        open={drawerOpen}
        certificate={detail.data ?? null}
        loading={detail.isFetching}
        error={detail.isError ? detail.error : null}
        canVoid={canManage}
        onVoid={(certificate) => {
          setVoidError(null);
          setVoidTarget(certificate);
        }}
        actionError={voidError}
        onDismissError={() => setVoidError(null)}
        onClose={() => {
          setDrawerOpen(false);
          setVoidError(null);
        }}
      />

      <ReasonDialog
        open={voidTarget != null}
        title={`Аннулировать сертификат №${voidTarget?.code ?? ""}?`}
        description="Деньги за карту вернутся из кассы филиала продажи той же операцией-зеркалом (в открытую смену). Действие нельзя отменить."
        label="Причина аннулирования"
        confirmText="Аннулировать"
        loading={voidMutation.isPending}
        onCancel={() => setVoidTarget(null)}
        onConfirm={(reason) => {
          if (voidTarget) voidMutation.mutate({ certificate: voidTarget, reason });
        }}
      />

      <SettingsDialog open={settingsOpen} organizationId={organizationId} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}
