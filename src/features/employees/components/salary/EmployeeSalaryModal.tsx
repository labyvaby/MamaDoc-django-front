import React from "react";
import {
  alpha,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import {
  getSalaryCard,
  patchSalaryCard,
  type SalaryCard,
  type TaxSettings,
} from "../../../../api/payroll";
import { getServices } from "../../../../api/catalog";
import { getEmployeeServices } from "../../../../api/staff";
import { getProducts } from "../../../../api/warehouse";
import { orgWide } from "../../../../api/scope";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import { AppButton, ConfirmDialog, UserAvatar } from "../../../../components/ui";
import { useApiOrgId } from "../../../../hooks/useApiOrgId";
import { useT } from "../../../../i18n/VerticalProvider";
import { buildSalaryServiceOptions } from "../../salaryServiceOptions";
import { currentMonthAnchor, usePayrollReportMonth } from "../../hooks/useEmployeeRelated";
import DjangoSalarySettings from "../DjangoSalarySettings";
import { AnimatedNumber } from "./AnimatedNumber";
import PayrollFieldsManager from "./PayrollFieldsManager";
import SalaryDealsSection from "./SalaryDealsSection";
import SalaryFieldsSection from "./SalaryFieldsSection";
import SalaryTaxSection from "./SalaryTaxSection";
import TaxRatesDialog from "./TaxRatesDialog";
import {
  buildSalaryPatch,
  cardToForm,
  dirtySections,
  isEmptyPatch,
  toNumber,
  type SalaryCardForm,
  type SalarySectionKey,
} from "./salaryCardModel";

export type EmployeeSalaryModalProps = {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
  photo?: string | null;
  /** Должность/роль под именем в шапке. */
  position?: string;
  /** У врача подсказка про услуги — своим термином вертикали. */
  isDoctor?: boolean;
  /** Видна ли зарплата за месяц (сводка в шапке): своя карточка или право на чужую. */
  canViewReport: boolean;
};

const TABS: { key: SalarySectionKey; label: string; icon: React.ReactElement }[] = [
  { key: "rates", label: "Ставки", icon: <PaymentsOutlined /> },
  { key: "deals", label: "Сделки", icon: <HandshakeOutlined /> },
  { key: "tax", label: "Налоги", icon: <AccountBalanceOutlined /> },
  { key: "fields", label: "Свои поля", icon: <TuneOutlined /> },
];

const tabIndex = (key: SalarySectionKey) => TABS.findIndex((t) => t.key === key);

/**
 * Модалка «Зарплата сотрудника»: все условия оплаты в одном месте — ставки,
 * сделки воронки, налоги и свои поля организации. Открывается кнопкой из
 * шапки карточки сотрудника; раньше ставки жили в дровере редактирования.
 */
const EmployeeSalaryModal: React.FC<EmployeeSalaryModalProps> = (props) => {
  const { open, onClose } = props;
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  // Тело само решает, можно ли закрыться (несохранённые правки) — Dialog
  // спрашивает его через этот ref при клике мимо и Esc.
  const closeGuard = React.useRef<() => void>(onClose);

  return (
    <Dialog
      open={open}
      onClose={() => closeGuard.current()}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      transitionDuration={{ enter: 260, exit: 200 }}
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(6px)",
            bgcolor: alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.55 : 0.32),
          },
        },
      }}
      PaperProps={{
        sx: {
          borderRadius: fullScreen ? 0 : "24px",
          overflow: "hidden",
          height: fullScreen ? "100%" : "min(860px, calc(100% - 48px))",
          display: "flex",
          flexDirection: "column",
          backgroundImage: "none",
          boxShadow: fullScreen
            ? "none"
            : `0 30px 80px ${alpha(theme.palette.common.black, 0.35)}, 0 0 0 1px ${alpha(theme.palette.divider, 0.6)}`,
        },
      }}
    >
      {open && <SalaryModalBody {...props} closeGuard={closeGuard} fullScreen={fullScreen} />}
    </Dialog>
  );
};

const SalaryModalBody: React.FC<
  EmployeeSalaryModalProps & {
    closeGuard: React.MutableRefObject<() => void>;
    fullScreen: boolean;
  }
> = ({
  onClose,
  employeeId,
  employeeName,
  photo,
  position,
  isDoctor = false,
  canViewReport,
  closeGuard,
  fullScreen,
}) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { t } = useT("employees");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const cardKey = djangoQueryKeys.payroll.salaryCard(employeeId, orgId ?? null);

  const cardQuery = useQuery({
    queryKey: cardKey,
    queryFn: ({ signal }) => getSalaryCard(employeeId, orgId, signal),
    staleTime: 0,
    // Без кэша между открытиями: форма заводится из первого ответа, и
    // старая карточка дала бы перезаписать чужие свежие правки.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const card = cardQuery.data;

  // Справочники для ставок по услугам и товарам: без права на каталог/склад
  // бэк ответит 403 — тогда списки пустые, это не ошибка модалки.
  const catalogQuery = useQuery({
    queryKey: ["django", "catalog", "services", "card-images", orgId ?? null],
    queryFn: ({ signal }) => getServices(orgWide(orgId), undefined, signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const assignedQuery = useQuery({
    queryKey: ["django", "staff", "employee-services", "salary", employeeId],
    queryFn: ({ signal }) => getEmployeeServices(employeeId, signal, { includeInactive: true }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const productsQuery = useQuery({
    queryKey: ["django", "warehouse", "products", "salary-options", orgId ?? null],
    queryFn: ({ signal }) => getProducts(signal, { organizationId: orgId }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const reportQuery = usePayrollReportMonth(orgId, canViewReport, currentMonthAnchor());
  const monthRow = reportQuery.data?.rows.find((r) => r.employeeId === employeeId) ?? null;

  // ── форма ──────────────────────────────────────────────────────────────────
  const [form, setForm] = React.useState<SalaryCardForm | null>(null);
  const [initial, setInitial] = React.useState<SalaryCardForm | null>(null);
  React.useEffect(() => {
    // Форма заводится один раз на открытие: фоновое обновление карточки не
    // должно стирать то, что человек уже ввёл.
    if (card && !form) {
      const fresh = cardToForm(card);
      setForm(fresh);
      setInitial(fresh);
    }
  }, [card, form]);

  const dirty = form && initial ? dirtySections(form, initial) : null;
  const patch = form && initial && card ? buildSalaryPatch(form, initial, card) : null;
  const hasChanges = Boolean(patch && !isEmptyPatch(patch));
  const anyDirty = Boolean(dirty && Object.values(dirty).some(Boolean));

  const [tab, setTab] = React.useState<SalarySectionKey>("rates");
  const [direction, setDirection] = React.useState(1);
  const goTab = (key: SalarySectionKey) => {
    setDirection(tabIndex(key) >= tabIndex(tab) ? 1 : -1);
    setTab(key);
  };

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [fieldsManagerOpen, setFieldsManagerOpen] = React.useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = React.useState(false);

  const requestClose = React.useCallback(() => {
    if (saving) return;
    if (anyDirty) setConfirmClose(true);
    else onClose();
  }, [anyDirty, saving, onClose]);
  React.useEffect(() => {
    closeGuard.current = requestClose;
  }, [closeGuard, requestClose]);

  React.useEffect(() => {
    if (!justSaved) return undefined;
    const timer = window.setTimeout(() => setJustSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  const save = async () => {
    if (!patch || !card || isEmptyPatch(patch)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchSalaryCard(employeeId, patch, orgId);
      queryClient.setQueryData(cardKey, updated);
      const fresh = cardToForm(updated);
      setForm(fresh);
      setInitial(fresh);
      setJustSaved(true);
      // Сумма за месяц на плитке карточки и в отчёте ЗП считается по новым условиям.
      void queryClient.invalidateQueries({ queryKey: ["django", "payroll", "report"] });
      notify?.({ type: "success", message: "Условия зарплаты сохранены" });
    } catch (e) {
      setSaveError(e instanceof Error && e.message ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  /** Свои поля поменялись в конструкторе: подтянуть их, не теряя правок. */
  const reloadFields = async () => {
    const fresh = await queryClient.fetchQuery({
      queryKey: cardKey,
      queryFn: ({ signal }) => getSalaryCard(employeeId, orgId, signal),
      staleTime: 0,
    });
    const freshForm = cardToForm(fresh);
    setInitial((prev) => (prev ? { ...prev, fields: freshForm.fields } : freshForm));
    setForm((prev) => {
      if (!prev || !initial) return freshForm;
      const fields: Record<number, string> = {};
      for (const f of fresh.fields) {
        const edited = prev.fields[f.id] !== undefined && prev.fields[f.id] !== initial.fields[f.id];
        fields[f.id] = edited ? prev.fields[f.id] : freshForm.fields[f.id];
      }
      return { ...prev, fields };
    });
  };

  const onTaxSettingsSaved = (taxSettings: TaxSettings) => {
    queryClient.setQueryData<SalaryCard>(cardKey, (old) => (old ? { ...old, taxSettings } : old));
    void queryClient.invalidateQueries({ queryKey: ["django", "payroll", "report"] });
    notify?.({ type: "success", message: "Ставки налогов обновлены" });
  };

  // ── услуги для ставок ──────────────────────────────────────────────────────
  const activeCatalog = React.useMemo(
    () => (catalogQuery.data ?? []).filter((s) => s.isActive),
    [catalogQuery.data],
  );
  const assignmentsKnown = assignedQuery.isSuccess;
  const assignedServices = React.useMemo(() => {
    const ids = new Set(
      (assignedQuery.data ?? []).filter((a) => a.isActive).map((a) => a.service.id),
    );
    return activeCatalog.filter((s) => ids.has(s.id));
  }, [assignedQuery.data, activeCatalog]);
  const salaryServices = React.useMemo(
    () =>
      buildSalaryServiceOptions({
        allServices: activeCatalog,
        assignedServices,
        ruleServiceIds: form?.rates.rules.flatMap((r) => r.serviceIds) ?? [],
        assignmentsKnown,
      }),
    [activeCatalog, assignedServices, form?.rates.rules, assignmentsKnown],
  );
  const servicesHint =
    assignmentsKnown && assignedServices.length === 0
      ? isDoctor
        ? t("clinicalRole.doctorNoServicesHint")
        : t("clinicalRole.employeeNoServicesHint")
      : undefined;
  const products = React.useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.isActive !== false),
    [productsQuery.data],
  );

  const access = card?.access;
  const readOnly = access?.readOnly ?? true;
  const monthLabel = dayjs().locale("ru").format("MMMM YYYY");

  // ── сводка за месяц ────────────────────────────────────────────────────────
  const earnings = toNumber(monthRow?.earnings);
  const withheld =
    toNumber(monthRow?.incomeTax) +
    toNumber(monthRow?.socialFundEmployee) +
    toNumber(monthRow?.customDeductions);
  const net = toNumber(monthRow?.netSalary);
  const employerTax = toNumber(monthRow?.socialFundEmployer);

  const slide = {
    enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -28 }),
  };

  return (
    <Box
      component={motion.div}
      initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      {/* ── Шапка ── */}
      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          px: { xs: 2, md: 3 },
          pt: { xs: 2, md: 2.75 },
          pb: 2,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.28 : 0.16)} 0%, ${alpha(theme.palette.primary.main, 0.03)} 70%)`,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {/* Мягкие «облака» — едва заметное движение фона. */}
        {[
          { size: 220, top: -110, left: -60, color: theme.palette.primary.main, dx: 30, dy: 18, dur: 14 },
          { size: 180, top: -60, right: -40, color: theme.palette.success.main, dx: -24, dy: 22, dur: 17 },
          { size: 140, bottom: -90, left: "45%", color: theme.palette.info.main, dx: 20, dy: -16, dur: 19 },
        ].map((blob, i) => (
          <Box
            key={i}
            aria-hidden
            component={motion.div}
            animate={reduceMotion ? undefined : { x: [0, blob.dx, 0], y: [0, blob.dy, 0] }}
            transition={{ duration: blob.dur, repeat: Infinity, ease: "easeInOut" }}
            sx={{
              position: "absolute",
              width: blob.size,
              height: blob.size,
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
              borderRadius: "50%",
              bgcolor: alpha(blob.color, theme.palette.mode === "dark" ? 0.22 : 0.16),
              filter: "blur(48px)",
              pointerEvents: "none",
            }}
          />
        ))}

        <Stack direction="row" alignItems="center" gap={1.75} sx={{ position: "relative" }}>
          <Box
            component={motion.div}
            initial={reduceMotion ? false : { scale: 0.6, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.08 }}
            sx={{ flexShrink: 0 }}
          >
            <UserAvatar
              src={photo}
              name={employeeName}
              size={fullScreen ? 48 : 58}
              sx={{
                borderRadius: "16px",
                boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`,
                border: `2px solid ${alpha(theme.palette.background.paper, 0.9)}`,
              }}
            />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="overline"
              sx={{ color: "primary.onSurface", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.6 }}
            >
              Зарплата
            </Typography>
            <Typography variant="h6" fontWeight={700} noWrap sx={{ lineHeight: 1.25 }}>
              {employeeName}
            </Typography>
            {position && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {position}
              </Typography>
            )}
          </Box>
          {card && readOnly && (
            <Chip
              icon={<LockOutlined sx={{ fontSize: "15px !important" }} />}
              label="Только просмотр"
              size="small"
              sx={{ display: { xs: "none", md: "inline-flex" }, bgcolor: alpha(theme.palette.background.paper, 0.7) }}
            />
          )}
          <IconButton
            aria-label="Закрыть"
            onClick={requestClose}
            sx={{
              alignSelf: "flex-start",
              bgcolor: alpha(theme.palette.background.paper, 0.6),
              backdropFilter: "blur(6px)",
              "&:hover": { bgcolor: alpha(theme.palette.background.paper, 0.9) },
            }}
          >
            <CloseOutlined />
          </IconButton>
        </Stack>

        {canViewReport && (
          <Box sx={{ position: "relative", mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
              {monthLabel}
            </Typography>
            <Box
              sx={{
                mt: 0.75,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: { xs: 0.75, md: 1.25 },
              }}
            >
              {[
                { label: "Начислено", value: earnings, accent: false },
                { label: "Удержано", value: withheld, accent: false },
                { label: "На руки", value: net, accent: true },
              ].map((tile, i) => (
                <Box
                  key={tile.label}
                  component={motion.div}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  sx={{
                    p: { xs: 1, md: 1.5 },
                    minWidth: 0,
                    borderRadius: "14px",
                    border: 1,
                    borderColor: tile.accent ? alpha(theme.palette.primary.main, 0.5) : "divider",
                    bgcolor: tile.accent
                      ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.12)
                      : alpha(theme.palette.background.paper, 0.72),
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {tile.label}
                  </Typography>
                  {reportQuery.isLoading ? (
                    <Skeleton width="70%" height={30} />
                  ) : (
                    <Typography
                      sx={{
                        fontSize: { xs: "0.98rem", md: "1.35rem" },
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.3,
                        color: tile.accent ? "primary.onSurface" : "text.primary",
                      }}
                      noWrap
                    >
                      <AnimatedNumber value={tile.value} />{" "}
                      <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>
                        с
                      </Box>
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
            {employerTax > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                Сверху организация платит в Соцфонд <AnimatedNumber value={employerTax} /> с
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* ── Вкладки ── */}
      <Box sx={{ px: { xs: 1.5, md: 3 }, pt: 1.5, flexShrink: 0 }}>
        <Box
          role="tablist"
          sx={{
            display: "flex",
            gap: 0.5,
            p: 0.5,
            borderRadius: "12px",
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {TABS.map((item) => {
            const selected = item.key === tab;
            const showDot = Boolean(dirty?.[item.key]);
            return (
              <Box
                key={item.key}
                role="tab"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => goTab(item.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goTab(item.key);
                  }
                }}
                sx={{
                  position: "relative",
                  flex: { xs: "0 0 auto", md: 1 },
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.75,
                  px: { xs: 1.1, md: 1.75 },
                  py: 1,
                  borderRadius: "9px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: { xs: "0.8rem", md: "0.86rem" },
                  fontWeight: 600,
                  userSelect: "none",
                  color: selected ? "primary.contrastText" : "text.secondary",
                  transition: "color .2s ease",
                  "& .MuiSvgIcon-root": { fontSize: 18 },
                  "&:hover": { color: selected ? "primary.contrastText" : "text.primary" },
                  "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                }}
              >
                {selected && (
                  <Box
                    component={motion.div}
                    layoutId="salary-modal-tab"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    sx={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "9px",
                      bgcolor: "primary.main",
                      boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.35)}`,
                      zIndex: 0,
                    }}
                  />
                )}
                <Box sx={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 0.75 }}>
                  {/* На телефоне четыре вкладки помещаются только без иконок. */}
                  <Box component="span" sx={{ display: { xs: "none", md: "inline-flex" } }}>
                    {item.icon}
                  </Box>
                  {item.label}
                  <AnimatePresence>
                    {showDot && (
                      <Box
                        component={motion.span}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        aria-label="Есть изменения"
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          bgcolor: selected ? "primary.contrastText" : "warning.main",
                        }}
                      />
                    )}
                  </AnimatePresence>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ── Содержимое ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", px: { xs: 2, md: 3 }, py: 2.5 }}>
        {cardQuery.isLoading || !form || !card ? (
          cardQuery.error ? (
            <Alert severity="error">
              {cardQuery.error instanceof Error && cardQuery.error.message
                ? cardQuery.error.message
                : "Не удалось загрузить условия зарплаты"}
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              <Skeleton variant="rounded" height={56} />
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={120} />
            </Stack>
          )
        ) : (
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={tab}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === "rates" && (
                <DjangoSalarySettings
                  value={form.rates}
                  onChange={(rates) => setForm({ ...form, rates })}
                  services={salaryServices}
                  servicesHint={servicesHint}
                  loadingServices={catalogQuery.isLoading}
                  products={products}
                  loadingProducts={productsQuery.isLoading}
                  disabled={saving || readOnly || !access?.canEditRates}
                />
              )}
              {tab === "deals" && (
                <SalaryDealsSection
                  value={form.deals}
                  onChange={(deals) => setForm({ ...form, deals })}
                  pipelines={card.pipelines}
                  disabled={saving || readOnly || !access?.canEditRates}
                  monthStats={
                    monthRow
                      ? {
                          count: monthRow.dealsWonCount ?? 0,
                          amount: toNumber(monthRow.dealsWonAmount),
                          pay: toNumber(monthRow.dealPay),
                        }
                      : null
                  }
                />
              )}
              {tab === "tax" && (
                <SalaryTaxSection
                  value={form.tax}
                  onChange={(tax) => setForm({ ...form, tax })}
                  settings={card.taxSettings}
                  disabled={saving || readOnly || !access?.canEditTax}
                  canManageSettings={Boolean(access?.canManageTaxSettings)}
                  onEditSettings={() => setTaxDialogOpen(true)}
                  monthEarnings={monthRow ? toNumber(monthRow.earnings) : null}
                />
              )}
              {tab === "fields" && (
                <SalaryFieldsSection
                  fields={card.fields}
                  values={form.fields}
                  onChange={(id, value) => setForm({ ...form, fields: { ...form.fields, [id]: value } })}
                  readOnly={saving || readOnly}
                  canManage={Boolean(access?.canManageFields)}
                  onManage={() => setFieldsManagerOpen(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
        {card && !readOnly && !access?.canEditRates && (tab === "rates" || tab === "deals") && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            Ставки меняет роль с правом «Управление зарплатой».
          </Typography>
        )}
        {card && !readOnly && !access?.canEditTax && tab === "tax" && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            Налоговый профиль меняет роль с правом «Налоги сотрудников».
          </Typography>
        )}
      </Box>

      {/* ── Подвал ── */}
      <Box
        sx={{
          flexShrink: 0,
          px: { xs: 2, md: 3 },
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: "blur(8px)",
        }}
      >
        {saveError && (
          <Alert severity="error" sx={{ mb: 1.25 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              {justSaved ? (
                <Stack
                  key="saved"
                  component={motion.div}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  direction="row"
                  alignItems="center"
                  gap={0.75}
                  sx={{ color: "success.main" }}
                >
                  <Box
                    component={motion.div}
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    sx={{ display: "flex" }}
                  >
                    <CheckCircleRounded sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography variant="body2" fontWeight={600}>
                    Сохранено
                  </Typography>
                </Stack>
              ) : hasChanges ? (
                <Stack
                  key="dirty"
                  component={motion.div}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  direction="row"
                  alignItems="center"
                  gap={1}
                >
                  <Box
                    component={motion.span}
                    animate={reduceMotion ? undefined : { scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "warning.main", flexShrink: 0 }}
                  />
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Есть несохранённые изменения
                  </Typography>
                </Stack>
              ) : (
                <Typography
                  key="hint"
                  component={motion.p}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: "none", md: "block" }, m: 0 }}
                >
                  Условия действуют на незамороженные месяцы — замороженные меняет только перерасчёт.
                </Typography>
              )}
            </AnimatePresence>
          </Box>
          <AppButton variant="text" onClick={requestClose} disabled={saving}>
            {readOnly ? "Закрыть" : "Отмена"}
          </AppButton>
          {!readOnly && (
            <AppButton
              variant="contained"
              onClick={save}
              loading={saving}
              disabled={!hasChanges}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minWidth: 132 }}
            >
              Сохранить
            </AppButton>
          )}
        </Stack>
      </Box>

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        variant="warning"
        title="Закрыть без сохранения?"
        message="Изменения в условиях зарплаты не сохранены и пропадут."
        confirmText="Закрыть"
        cancelText="Остаться"
      />

      {card && access?.canManageFields && (
        <PayrollFieldsManager
          open={fieldsManagerOpen}
          onClose={() => setFieldsManagerOpen(false)}
          organizationId={orgId}
          onChanged={() => void reloadFields()}
        />
      )}

      {card && access?.canManageTaxSettings && (
        <TaxRatesDialog
          open={taxDialogOpen}
          onClose={() => setTaxDialogOpen(false)}
          settings={card.taxSettings}
          organizationId={orgId}
          onSaved={onTaxSettingsSaved}
        />
      )}
    </Box>
  );
};

export default EmployeeSalaryModal;
