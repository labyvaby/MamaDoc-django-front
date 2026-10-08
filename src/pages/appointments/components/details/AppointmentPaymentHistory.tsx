import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Collapse,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useNavigate } from "react-router";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";

import type { DjangoAppointment } from "../../../../api/appointments";
import type {
  AppointmentPayment,
  PaymentKind,
  PaymentLockReason,
  PaymentPhase,
  PaymentRevision,
  PaymentSummary,
} from "../../../../api/payments";
import { getStatusAccent } from "../../../../config/appointmentStatuses";
import { useCan } from "../../../../hooks/useCan";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatSom } from "./formatSom";
import { paymentMethodLabel } from "../../../../utility/paymentMethodLabel";
import { RefundDialog, type RefundDialogState } from "../../AppointmentRefundsPanel";
import PaymentDeleteDialog from "./PaymentDeleteDialog";
import PaymentEditDialog from "./PaymentEditDialog";
import {
  buildPaymentHistory,
  countMoneyEvents,
  revisionChanges,
  settlementViewOf,
  type PaymentHistoryEvent,
  type SettlementView,
} from "./paymentHistoryModel";
import { usePaymentSummarySync } from "./usePaymentSummarySync";

const MotionBox = motion.create(Box);

const OPEN_PREF_KEY = "mamadoc.appointment.paymentHistory.open";
const EASE = [0.22, 1, 0.36, 1] as const;

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const readOpenPref = (): boolean => {
  try {
    return window.localStorage.getItem(OPEN_PREF_KEY) !== "0";
  } catch {
    return true;
  }
};

const writeOpenPref = (open: boolean) => {
  try {
    window.localStorage.setItem(OPEN_PREF_KEY, open ? "1" : "0");
  } catch {
    // приватный режим — состояние просто не запомнится
  }
};

const num = (value: string | number | null | undefined): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** «сегодня в 14:00», «завтра в 10:30», «5 октября в 09:00». */
function formatWhen(iso: string, t: Translate): string {
  const at = dayjs(iso);
  const time = at.format("HH:mm");
  const today = dayjs();
  if (at.isSame(today, "day")) return t("paymentHistory.when.today", { time });
  if (at.isSame(today.add(1, "day"), "day")) return t("paymentHistory.when.tomorrow", { time });
  if (at.isSame(today.subtract(1, "day"), "day")) return t("paymentHistory.when.yesterday", { time });
  return t("paymentHistory.when.other", { date: at.locale("ru").format("D MMMM"), time });
}

function dayLabel(date: string, t: Translate): string {
  const day = dayjs(date);
  if (day.isSame(dayjs(), "day")) return t("paymentHistory.today");
  if (day.isSame(dayjs().subtract(1, "day"), "day")) return t("paymentHistory.yesterday");
  return day.locale("ru").format("D MMMM, dddd");
}

const METHOD_ICON: Record<string, React.ReactElement> = {
  cash: <PaymentsOutlined sx={{ fontSize: 18 }} />,
  card: <CreditCardOutlined sx={{ fontSize: 18 }} />,
  balance: <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />,
  bonus: <CardGiftcardOutlined sx={{ fontSize: 18 }} />,
  insurance: <HealthAndSafetyOutlined sx={{ fontSize: 18 }} />,
};

/** Тон события ленты — те же цвета, что у чипов статусов в списке. */
function kindAccent(kind: PaymentKind | "refund" | "deleted", theme: Theme): { main: string; text: string } {
  switch (kind) {
    case "prepayment":
      return getStatusAccent("partially_paid", theme);
    case "payment":
      return getStatusAccent("paid", theme);
    case "debt_repayment":
      return { main: theme.palette.warning.main, text: theme.palette.warning.dark };
    case "refund":
      return getStatusAccent("debt", theme);
    default:
      return { main: theme.palette.grey[500], text: theme.palette.text.secondary };
  }
}

const PHASE_STATUS: Record<PaymentPhase, string> = {
  awaiting: "in_progress",
  prepaid: "partially_paid",
  paid: "paid",
  debt: "debt",
  discounted: "discounted",
  free: "free",
  refunded: "completed",
  canceled: "canceled",
};

// ── Settlement bar ──────────────────────────────────────────────────────────

interface SettlementPanelProps {
  view: SettlementView;
  startsAt: string;
  reduceMotion: boolean;
}

const SettlementPanel: React.FC<SettlementPanelProps> = ({ view, startsAt, reduceMotion }) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const isDebt = view.phase === "debt";
  const remainingOpen = view.remaining > 0 && ["awaiting", "prepaid", "debt"].includes(view.phase);
  const prepaidAccent = getStatusAccent("partially_paid", theme).main;
  const paidAccent = theme.palette.success.main;
  const restAccent = isDebt ? theme.palette.error.main : theme.palette.warning.main;

  const segments = [
    { key: "prepaid", value: view.prepaid, color: prepaidAccent, striped: false },
    { key: "paidAfterStart", value: view.paidAfterStart, color: paidAccent, striped: false },
    { key: isDebt ? "debt" : "remaining", value: remainingOpen ? view.remaining : 0, color: restAccent, striped: !isDebt },
  ].filter((segment) => segment.value > 0.004);
  const total = Math.max(view.payable, segments.reduce((sum, s) => sum + s.value, 0)) || 1;

  const hintIcon =
    view.phase === "debt" ? (
      <WarningAmberOutlined sx={{ fontSize: 16, color: "error.main" }} />
    ) : view.phase === "paid" || view.phase === "discounted" || view.phase === "free" ? (
      <CheckCircleOutline sx={{ fontSize: 16, color: "success.main" }} />
    ) : (
      <ScheduleOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
    );

  return (
    <Box sx={{ px: 1.75, pb: 1.5 }}>
      <Box
        role="img"
        aria-label={segments.map((s) => `${t(`paymentHistory.legend.${s.key}`)} ${formatSom(s.value)}`).join(", ")}
        sx={{
          display: "flex",
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          bgcolor: alpha(theme.palette.text.primary, 0.06),
          gap: "2px",
        }}
      >
        {segments.map((segment, index) => (
          <motion.div
            key={segment.key}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${(segment.value / total) * 100}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 0.08 * index, ease: EASE }}
            style={{
              height: "100%",
              borderRadius: 999,
              background: segment.striped
                ? `repeating-linear-gradient(135deg, ${alpha(segment.color, 0.55)} 0 6px, ${alpha(segment.color, 0.28)} 6px 12px)`
                : segment.color,
              backgroundSize: segment.striped ? "17px 17px" : undefined,
              animation: segment.striped && !reduceMotion ? "mdPayStripes 1.4s linear infinite" : undefined,
            }}
          />
        ))}
      </Box>
      <Box
        component="style"
        // Бегущая штриховка остатка «к оплате»: ещё не долг, но и не закрыто.
        dangerouslySetInnerHTML={{
          __html: "@keyframes mdPayStripes{from{background-position:0 0}to{background-position:17px 0}}",
        }}
      />

      <Stack direction="row" flexWrap="wrap" columnGap={2} rowGap={0.75} sx={{ mt: 1.25 }}>
        {segments.map((segment) => (
          <Stack key={segment.key} direction="row" alignItems="center" spacing={0.75}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: segment.color,
                boxShadow: `0 0 0 3px ${alpha(segment.color, 0.16)}`,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {t(`paymentHistory.legend.${segment.key}`)}
            </Typography>
            <Typography variant="caption" fontWeight={700}>
              {formatSom(segment.value)}
            </Typography>
          </Stack>
        ))}
        {view.refunded > 0.004 && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <UndoOutlined sx={{ fontSize: 14, color: "error.main" }} />
            <Typography variant="caption" color="text.secondary">
              {t("paymentHistory.legend.refunded")}
            </Typography>
            <Typography variant="caption" fontWeight={700} color="error.main">
              {formatSom(view.refunded)}
            </Typography>
          </Stack>
        )}
      </Stack>

      <Stack
        direction="row"
        spacing={0.75}
        alignItems="flex-start"
        sx={{
          mt: 1.25,
          p: 1,
          borderRadius: "10px",
          bgcolor: alpha(isDebt ? theme.palette.error.main : theme.palette.text.primary, isDebt ? 0.06 : 0.03),
        }}
      >
        <Box sx={{ pt: "1px", display: "flex" }}>{hintIcon}</Box>
        <Typography variant="caption" color={isDebt ? "error.main" : "text.secondary"} sx={{ lineHeight: 1.45 }}>
          {t(`paymentHistory.phaseHint.${view.phase}`, {
            amount: formatSom(view.remaining),
            when: formatWhen(startsAt, t),
          })}
        </Typography>
      </Stack>
    </Box>
  );
};

// ── One row of the timeline ─────────────────────────────────────────────────

interface RowAction {
  key: "edit" | "refund" | "delete";
  label: string;
  icon: React.ReactElement;
  enabled: boolean;
  lock: PaymentLockReason | null | undefined;
  onClick: () => void;
}

/** Причины, о которых стоит сказать человеку (а не просто спрятать меню). */
const INFORMATIVE_LOCKS = new Set<PaymentLockReason>([
  "day_closed",
  "has_refund",
  "online_prepayment",
  "internal_method",
  "appointment_closed",
]);

interface HistoryRowProps {
  event: PaymentHistoryEvent;
  isLast: boolean;
  highlighted: boolean;
  reduceMotion: boolean;
  onEdit: (payment: AppointmentPayment) => void;
  onDelete: (payment: AppointmentPayment) => void;
  onRefund: (payment: AppointmentPayment, remaining: number) => void;
}

const RevisionList: React.FC<{ revisions: PaymentRevision[] }> = ({ revisions }) => {
  const { t } = useT("appointments");
  const formatValue = (field: string, value: unknown): string => {
    if (value == null || value === "") return t("paymentHistory.revision.none");
    if (field === "amount") return formatSom(num(value as string));
    if (field === "method") return paymentMethodLabel(String(value));
    if (field === "cash_date") return dayjs(String(value)).format("DD.MM.YYYY");
    return String(value);
  };
  return (
    <Stack spacing={1} sx={{ mt: 0.75, pl: 1.25, borderLeft: "2px solid", borderColor: "divider" }}>
      {revisions.map((revision) => (
        <Box key={revision.id}>
          <Typography variant="caption" color="text.secondary" component="div">
            {dayjs(revision.createdAt).format("D MMM, HH:mm")} · {revision.createdByName ?? "—"} ·{" "}
            {revision.source === "payment_form"
              ? t("paymentHistory.revision.fromForm")
              : t("paymentHistory.revision.fromHistory")}
          </Typography>
          {revisionChanges(revision).map((change) => (
            <Typography key={change.field} variant="caption" component="div" sx={{ lineHeight: 1.5 }}>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {t(`paymentHistory.fields.${change.field}`)}:{" "}
              </Box>
              {change.field === "cashless_method" || change.field === "insurer" ? (
                <Box component="span" fontWeight={600}>
                  {t("paymentHistory.changed")}
                </Box>
              ) : (
                <>
                  <Box component="span" sx={{ textDecoration: "line-through", opacity: 0.65 }}>
                    {formatValue(change.field, change.old)}
                  </Box>
                  {" → "}
                  <Box component="span" fontWeight={700}>
                    {formatValue(change.field, change.new)}
                  </Box>
                </>
              )}
            </Typography>
          ))}
          {revision.reason && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ fontStyle: "italic" }}>
              {t("paymentHistory.revision.reason", { reason: revision.reason })}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
};

const HistoryRow: React.FC<HistoryRowProps> = ({
  event,
  isLast,
  highlighted,
  reduceMotion,
  onEdit,
  onDelete,
  onRefund,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [showRevisions, setShowRevisions] = React.useState(false);

  const kind: PaymentKind | "refund" | "deleted" =
    event.type === "payment" ? event.kind : event.type === "refund" ? "refund" : "deleted";
  const accent = kindAccent(kind, theme);

  let methodIcon: React.ReactElement;
  let title: string;
  let amount: number;
  let who: string | null | undefined;
  let whoKey: string;
  let details: React.ReactNode = null;
  let actions: RowAction[] = [];

  if (event.type === "payment") {
    const p = event.payment;
    methodIcon = METHOD_ICON[p.method] ?? METHOD_ICON.cash;
    title =
      p.method === "insurance" && p.insurerName
        ? `${paymentMethodLabel(p.method)} · ${p.insurerName}`
        : paymentMethodLabel(p.method, p.cashlessMethodName);
    amount = num(p.amount);
    who = p.createdByName;
    whoKey = "paymentHistory.by";
    const remaining = Math.max(0, amount - event.refunded);
    actions = [
      {
        key: "edit",
        label: t("paymentHistory.actions.edit"),
        icon: <EditOutlined fontSize="small" />,
        enabled: p.canEdit === true,
        lock: p.editLockReason,
        onClick: () => onEdit(p),
      },
      {
        key: "refund",
        label: t("paymentHistory.actions.refund"),
        icon: <UndoOutlined fontSize="small" />,
        enabled: p.canRefund === true,
        lock: p.refundLockReason,
        onClick: () => onRefund(p, remaining),
      },
      {
        key: "delete",
        label: t("paymentHistory.actions.delete"),
        icon: <DeleteOutlineOutlined fontSize="small" />,
        enabled: p.canDelete === true,
        lock: p.editLockReason,
        onClick: () => onDelete(p),
      },
    ];
    const cashDateDiffers = p.cashDate && !dayjs(p.cashDate).isSame(dayjs(p.createdAt), "day");
    details = (
      <>
        {(cashDateDiffers || p.prepaymentSource === "booking") && (
          <Typography variant="caption" color="text.secondary" component="div">
            {[
              p.prepaymentSource === "booking" ? t("paymentHistory.online") : null,
              cashDateDiffers ? t("paymentHistory.cashDate", { date: dayjs(p.cashDate).format("DD.MM") }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}
        {p.note && (
          <Typography variant="caption" component="div" sx={{ fontStyle: "italic", color: "text.secondary" }}>
            «{p.note}»
          </Typography>
        )}
        {event.refunded > 0.004 && (
          <Typography variant="caption" component="div" color="error.main" fontWeight={600}>
            {t("paymentHistory.refundedPart", { amount: formatSom(event.refunded) })}
          </Typography>
        )}
        {event.revisions.length > 0 && (
          <>
            <ButtonBase
              onClick={() => setShowRevisions((v) => !v)}
              sx={{
                mt: 0.25,
                gap: 0.5,
                borderRadius: 1,
                px: 0.5,
                ml: -0.5,
                color: "primary.main",
                typography: "caption",
                fontWeight: 600,
              }}
            >
              <HistoryOutlined sx={{ fontSize: 14 }} />
              {t("paymentHistory.edited", { count: event.revisions.length })}
              <ExpandMoreOutlined
                sx={{
                  fontSize: 16,
                  transition: "transform .2s",
                  transform: showRevisions ? "rotate(180deg)" : "none",
                }}
              />
            </ButtonBase>
            <Collapse in={showRevisions} unmountOnExit>
              <RevisionList revisions={event.revisions} />
            </Collapse>
          </>
        )}
      </>
    );
  } else if (event.type === "refund") {
    const r = event.refund;
    methodIcon = <UndoOutlined sx={{ fontSize: 18 }} />;
    title = paymentMethodLabel(r.method, r.cashlessMethodName);
    amount = num(r.amount);
    who = r.createdByName;
    whoKey = "paymentHistory.refundBy";
    details = r.reason ? (
      <Typography variant="caption" component="div" sx={{ fontStyle: "italic", color: "text.secondary" }}>
        «{r.reason}»
      </Typography>
    ) : null;
  } else {
    const snap = event.revision.snapshot ?? {};
    methodIcon = <DeleteOutlineOutlined sx={{ fontSize: 18 }} />;
    title = paymentMethodLabel(snap.method ?? "cash", snap.cashless_method_name);
    amount = num(snap.amount);
    who = event.revision.createdByName;
    whoKey = "paymentHistory.deletedBy";
    details = event.revision.reason ? (
      <Typography variant="caption" component="div" sx={{ fontStyle: "italic", color: "text.secondary" }}>
        {t("paymentHistory.revision.reason", { reason: event.revision.reason })}
      </Typography>
    ) : null;
  }

  const visibleActions = actions.filter((a) => a.enabled || (a.lock != null && INFORMATIVE_LOCKS.has(a.lock)));
  const amountColor = kind === "refund" ? "error.main" : kind === "deleted" ? "text.disabled" : "text.primary";
  const sign = kind === "refund" ? "−" : kind === "deleted" ? "" : "+";
  const kindLabel = t(`paymentHistory.kind.${kind}`);

  return (
    <motion.div
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: kind === "deleted" ? 0.72 : 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -18, transition: { duration: 0.2 } }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <MotionBox
        animate={
          highlighted && !reduceMotion
            ? { backgroundColor: [alpha(theme.palette.primary.main, 0.18), alpha(theme.palette.primary.main, 0)] }
            : undefined
        }
        transition={{ duration: 1.8, ease: "easeOut" }}
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr) auto",
          columnGap: 1.25,
          py: 1,
          px: 0.75,
          mx: -0.75,
          borderRadius: "12px",
          transition: "background-color .2s ease",
          "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.03) },
        }}
      >
        {!isLast && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              left: "calc(6px + 16px)",
              top: 44,
              bottom: -6,
              width: 2,
              borderRadius: 1,
              bgcolor: "divider",
            }}
          />
        )}
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            color: accent.text,
            bgcolor: alpha(accent.main, theme.palette.mode === "dark" ? 0.22 : 0.13),
            boxShadow: `0 0 0 3px ${theme.palette.background.paper}`,
            position: "relative",
            zIndex: 1,
          }}
        >
          {methodIcon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
            <Box
              component="span"
              sx={{
                px: 0.75,
                py: "1px",
                borderRadius: "6px",
                fontSize: "0.6875rem",
                fontWeight: 700,
                letterSpacing: 0.2,
                color: accent.text,
                bgcolor: alpha(accent.main, theme.palette.mode === "dark" ? 0.2 : 0.12),
                whiteSpace: "nowrap",
              }}
            >
              {kindLabel}
            </Box>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {title}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
            {dayjs(event.at).format("HH:mm")} · {who ? t(whoKey, { name: who }) : t("paymentHistory.byUnknown")}
          </Typography>
          {details}
        </Box>

        <Stack alignItems="flex-end" spacing={0.25} sx={{ pl: 0.5 }}>
          <Typography
            variant="subtitle2"
            fontWeight={800}
            color={amountColor}
            sx={{
              whiteSpace: "nowrap",
              textDecoration: kind === "deleted" ? "line-through" : "none",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {sign}
            {formatSom(amount)}
          </Typography>
          {visibleActions.length > 0 && (
            <>
              <Tooltip title={t("paymentHistory.actions.menu")}>
                <IconButton
                  size="small"
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                  aria-label={t("paymentHistory.actions.menu")}
                  sx={{ mr: -0.75 }}
                >
                  <MoreVertOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 220, maxWidth: 320 } } }}
              >
                {visibleActions.map((action) => (
                  <MenuItem
                    key={action.key}
                    disabled={!action.enabled}
                    onClick={() => {
                      setMenuAnchor(null);
                      action.onClick();
                    }}
                    sx={{
                      alignItems: "flex-start",
                      color: action.key === "delete" ? "error.main" : undefined,
                      "&.Mui-disabled": { opacity: 0.75 },
                    }}
                  >
                    <ListItemIcon sx={{ mt: "2px", color: action.key === "delete" ? "error.main" : undefined }}>
                      {action.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={action.label}
                      secondary={!action.enabled && action.lock ? t(`paymentHistory.lock.${action.lock}`) : undefined}
                      secondaryTypographyProps={{ sx: { whiteSpace: "normal", fontSize: "0.7rem" } }}
                    />
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Stack>
      </MotionBox>
    </motion.div>
  );
};

// ── The section ─────────────────────────────────────────────────────────────

export interface AppointmentPaymentHistoryProps {
  appointment: DjangoAppointment;
  summary: PaymentSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** finance.manage — принять оплату прямо из пустой истории. */
  canAcceptPayment: boolean;
  onPay: () => void;
}

/**
 * «История оплат» внизу карточки приёма: лента денег (кто, когда, каким
 * способом), полоса «предоплата / на приёме / к оплате или долг», правка,
 * удаление и возврат по каждой оплате. Что можно делать, решает бэк (права,
 * настройки модуля, «день в день») — UI только показывает и объясняет.
 */
export const AppointmentPaymentHistory: React.FC<AppointmentPaymentHistoryProps> = ({
  appointment,
  summary,
  loading,
  error,
  onRetry,
  canAcceptPayment,
  onPay,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion() ?? false;
  const canOpenSettings = useCan("organization.update");
  const syncSummary = usePaymentSummarySync(appointment.patient?.id ?? null);

  const [open, setOpen] = React.useState(readOpenPref);
  const [editTarget, setEditTarget] = React.useState<AppointmentPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AppointmentPayment | null>(null);
  const [refundState, setRefundState] = React.useState<RefundDialogState>(null);
  const [highlightKey, setHighlightKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!highlightKey) return;
    const id = window.setTimeout(() => setHighlightKey(null), 2000);
    return () => window.clearTimeout(id);
  }, [highlightKey]);

  const days = React.useMemo(
    () => (summary ? buildPaymentHistory(summary, appointment.scheduledAt) : []),
    [summary, appointment.scheduledAt],
  );
  const view = React.useMemo(
    () => (summary ? settlementViewOf(summary, appointment) : null),
    [summary, appointment],
  );
  const eventsCount = countMoneyEvents(days);

  const toggle = () => {
    setOpen((v) => {
      writeOpenPref(!v);
      return !v;
    });
  };

  const afterChange = (next: PaymentSummary, key: string | null) => {
    syncSummary(next);
    if (key) setHighlightKey(key);
  };

  const phaseAccent = view ? getStatusAccent(PHASE_STATUS[view.phase], theme) : null;
  const isCancelled = view?.phase === "canceled";
  const beforeStart = view ? !view.started : false;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: "14px",
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      {/* ── Шапка ── */}
      <Stack direction="row" alignItems="center" sx={{ pr: 1 }}>
        <ButtonBase
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("paymentHistory.collapse") : t("paymentHistory.expand")}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: "flex-start",
            textAlign: "left",
            gap: 1.25,
            px: 1.75,
            py: 1.25,
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "10px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
            }}
          >
            <ReceiptLongOutlined sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} lineHeight={1.3} noWrap>
              {t("paymentHistory.title")}
            </Typography>
            {/* Счётчик и фаза — второй строкой: на телефоне в одну строку с
                заголовком они не помещались и обрезали «3 операции». */}
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.25, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {loading
                  ? "…"
                  : eventsCount > 0
                    ? t("paymentHistory.count", { count: eventsCount })
                    : t("paymentHistory.countEmpty")}
              </Typography>
              <AnimatePresence initial={false} mode="popLayout">
                {view && phaseAccent && (
                  <motion.span
                    key={view.phase}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    style={{ display: "inline-flex", minWidth: 0 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        px: 0.875,
                        py: "1px",
                        borderRadius: "7px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: phaseAccent.text,
                        bgcolor: alpha(phaseAccent.main, theme.palette.mode === "dark" ? 0.22 : 0.13),
                      }}
                    >
                      {t(`paymentHistory.phase.${view.phase}`)}
                      {(view.phase === "debt" || view.phase === "prepaid" || view.phase === "awaiting") &&
                      view.remaining > 0
                        ? ` · ${formatSom(view.phase === "prepaid" ? view.prepaid : view.remaining)}`
                        : ""}
                    </Box>
                  </motion.span>
                )}
              </AnimatePresence>
            </Stack>
          </Box>
          <ExpandMoreOutlined
            sx={{
              color: "text.secondary",
              transition: "transform .25s ease",
              transform: open ? "rotate(180deg)" : "none",
            }}
          />
        </ButtonBase>
        {canOpenSettings && (
          <Tooltip title={t("paymentHistory.settings")}>
            <IconButton size="small" onClick={() => navigate("/settings/appointment-payments")}>
              <SettingsOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Collapse in={open} timeout={reduceMotion ? 0 : 280}>
        <Divider />
        {loading ? (
          <Stack spacing={1.25} sx={{ p: 1.75 }}>
            <Skeleton variant="rounded" height={10} />
            {[0, 1, 2].map((i) => (
              <Stack key={i} direction="row" spacing={1.25} alignItems="center">
                <Skeleton variant="circular" width={34} height={34} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="55%" />
                  <Skeleton width="35%" />
                </Box>
                <Skeleton width={64} />
              </Stack>
            ))}
          </Stack>
        ) : error || !summary || !view ? (
          <Box sx={{ p: 1.75 }}>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={onRetry}>
                  {t("paymentHistory.retry")}
                </Button>
              }
            >
              {t("paymentHistory.loadError")}
            </Alert>
          </Box>
        ) : (
          <>
            <Box sx={{ pt: 1.5 }}>
              <SettlementPanel view={view} startsAt={appointment.scheduledAt} reduceMotion={reduceMotion} />
            </Box>
            <Divider />
            <Box sx={{ px: 1.75, pt: 0.75, pb: 1.25 }}>
              {days.length === 0 ? (
                <Stack alignItems="center" textAlign="center" spacing={0.75} sx={{ py: 2.5 }}>
                  <MotionBox
                    initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      color: "text.secondary",
                      bgcolor: alpha(theme.palette.text.primary, 0.05),
                    }}
                  >
                    <ReceiptLongOutlined />
                  </MotionBox>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {t("paymentHistory.empty.title")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320 }}>
                    {t("paymentHistory.empty.hint")}
                  </Typography>
                  {canAcceptPayment && !isCancelled && view.remaining > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddCircleOutline />}
                      onClick={onPay}
                      sx={{ mt: 0.5, borderRadius: "10px", textTransform: "none" }}
                    >
                      {beforeStart ? t("paymentHistory.acceptPrepayment") : t("paymentHistory.acceptPayment")}
                    </Button>
                  )}
                </Stack>
              ) : (
                days.map((day) => (
                  <Box key={day.date} sx={{ mt: 0.75 }}>
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ display: "block", fontWeight: 700, letterSpacing: 0.6, lineHeight: 2.2, fontSize: "0.65rem" }}
                    >
                      {dayLabel(day.date, t)}
                    </Typography>
                    <AnimatePresence initial={false}>
                      {day.events.map((event, index) => (
                        <HistoryRow
                          key={event.key}
                          event={event}
                          isLast={index === day.events.length - 1}
                          highlighted={highlightKey === event.key}
                          reduceMotion={reduceMotion}
                          onEdit={setEditTarget}
                          onDelete={setDeleteTarget}
                          onRefund={(payment, remaining) => setRefundState({ payment, remaining })}
                        />
                      ))}
                    </AnimatePresence>
                  </Box>
                ))
              )}
            </Box>
          </>
        )}
      </Collapse>

      <PaymentEditDialog
        open={editTarget != null}
        appointment={appointment}
        payment={editTarget}
        remainingAmount={view?.remaining ?? 0}
        onClose={() => setEditTarget(null)}
        onSaved={(next) => {
          const id = editTarget?.id;
          setEditTarget(null);
          afterChange(next, id != null ? `payment-${id}` : null);
        }}
      />
      <PaymentDeleteDialog
        open={deleteTarget != null}
        appointmentId={appointment.id}
        payment={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(next) => {
          const id = deleteTarget?.id;
          setDeleteTarget(null);
          const revision = [...(next.revisions ?? [])]
            .reverse()
            .find((r) => r.action === "deleted" && r.paymentId === id);
          afterChange(next, revision ? `deleted-${revision.id}` : null);
        }}
        onRefundInstead={(payment) => {
          setDeleteTarget(null);
          const refunded = num(payment.refundedAmount);
          setRefundState({ payment, remaining: Math.max(0, num(payment.amount) - refunded) });
        }}
      />
      <RefundDialog
        state={refundState}
        appointmentId={appointment.id}
        patientId={appointment.patient?.id ?? null}
        onClose={() => setRefundState(null)}
        onSuccess={(next) => {
          setRefundState(null);
          const newest = [...(next.refunds ?? [])].sort((a, b) => b.id - a.id)[0];
          afterChange(next, newest ? `refund-${newest.id}` : null);
        }}
      />
    </Paper>
  );
};

export default AppointmentPaymentHistory;
