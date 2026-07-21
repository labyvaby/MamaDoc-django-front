import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  getAppointmentPayments,
  applyAppointmentPayment,
  parseBackendError,
  type PaymentSummary,
  type PaymentStatus,
  type ApplyPaymentPayload,
  type PaymentLineInput,
} from "../../api/payments";
import { getInsurers } from "../../api/insurers";
import type { DjangoAppointment } from "../../api/appointments";
import { DiscountInput } from "../../components/ui";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";
import PatientBalancePanel from "./PatientBalancePanel";
import AppointmentRefundsPanel from "./AppointmentRefundsPanel";
import CashDateConfirmDialog, {
  type CashDateChoice,
} from "./components/CashDateConfirmDialog";

// ── Payment status display ─────────────────────────────────────────────────────

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  discounted: "Со скидкой",
  refunded: "Возврат",
};

export const PAYMENT_STATUS_COLOR: Record<
  PaymentStatus,
  "default" | "warning" | "success" | "info" | "error"
> = {
  unpaid: "default",
  partial: "warning",
  paid: "success",
  discounted: "info",
  refunded: "error",
};

// ── helpers ───────────────────────────────────────────────────────────────────

const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
  "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

function parseDecimal(s: string | number | undefined | null): number {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function computeStatus(payable: number, paid: number, discount: number, total: number): PaymentStatus {
  if (payable <= 0 && discount > 0 && total > 0 && paid === 0) return "discounted";
  if (paid >= payable && payable > 0) return "paid";
  if (paid > 0 && paid < payable) return "partial";
  return "unpaid";
}

function mapSaveError(raw: string): string {
  if (raw.includes("уже содержит оплату с баланса") || raw.includes("replace-all"))
    return "Этот приём уже оплачивался с баланса или бонусами. Изменение состава оплаты недоступно без возврата.";
  if (raw.includes("недостаточно бонусов") || raw.includes("insufficient bonus"))
    return "Недостаточно бонусов на счёте пациента.";
  if (raw.includes("Страховая компания не найдена"))
    return "Страховая компания не найдена или неактивна. Обновите список и выберите заново.";
  return raw;
}

const CANCELLED_STATUSES = new Set(["canceled", "cancelled", "no_show"]);

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  balance: "Баланс пациента",
  bonus: "Бонусы",
  insurance: "Страховка",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type DjangoPaymentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
  onSaved?: (summary: PaymentSummary) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

const DjangoPaymentDrawer: React.FC<DjangoPaymentDrawerProps> = ({
  open,
  onClose,
  appointment,
  onSaved,
}) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const appointmentId = appointment?.id ?? null;
  const patientId = appointment?.patient?.id ?? null;

  const discountTouchedRef = React.useRef(false);
  const paymentsTouchedRef = React.useRef(false);
  const seededPaymentsForRef = React.useRef<number | null>(null);

  const paymentQuery = useQuery({
    queryKey: appointmentId
      ? djangoQueryKeys.appointments.payments(appointmentId)
      : ["django", "appointments", "payments", "closed"],
    queryFn: ({ signal }) => getAppointmentPayments(appointmentId!, signal),
    enabled: open && appointmentId !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchOnMount: "always",
  });
  const summary = paymentQuery.data ?? null;

  // Read patient balance from cache (loaded by PatientBalancePanel)
  const cachedBalance = patientId
    ? queryClient.getQueryData<{ balance: string; bonuses: string }>(
        djangoQueryKeys.patients.balance(patientId),
      )
    : undefined;
  const availableBalance = parseDecimal(cachedBalance?.balance);
  const availableBonuses = parseDecimal(cachedBalance?.bonuses);

  // Form state
  const [discountStr, setDiscountStr] = React.useState("0");
  const [cash, setCash] = React.useState<number | "">("");
  const [card, setCard] = React.useState<number | "">("");
  const [insurance, setInsurance] = React.useState<number | "">("");
  const [insurerId, setInsurerId] = React.useState<number | "">("");
  const [policyNumber, setPolicyNumber] = React.useState("");
  const [balanceStr, setBalanceStr] = React.useState("0");
  const [bonusStr, setBonusStr] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Дата кассы для card/insurance, когда дата приёма не сегодня (см. CashDateConfirmDialog).
  const [cashDateChoice, setCashDateChoice] = React.useState<CashDateChoice>("today");
  const [cashDateConfirmed, setCashDateConfirmed] = React.useState(false);
  const [showCashDateDialog, setShowCashDateDialog] = React.useState(false);

  // Справочник страховых (для строки «Страховка»); только активные.
  const insurersQuery = useQuery({
    queryKey: djangoQueryKeys.insurers.list(appointment?.organizationId ?? null),
    queryFn: ({ signal }) => getInsurers(signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const insurers = insurersQuery.data ?? [];

  // Reset
  const prevAppointmentIdRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open || appointmentId === null) {
      discountTouchedRef.current = false;
      setDiscountStr("0");
      setCash("");
      setCard("");
      setInsurance("");
      setInsurerId("");
      setPolicyNumber("");
      setBalanceStr("0");
      setBonusStr("0");
      setNote("");
      setSaveError(null);
      setCashDateChoice("today");
      setCashDateConfirmed(false);
      setShowCashDateDialog(false);
      prevAppointmentIdRef.current = null;
      paymentsTouchedRef.current = false;
      seededPaymentsForRef.current = null;
      return;
    }
    if (appointmentId !== prevAppointmentIdRef.current) {
      discountTouchedRef.current = false;
      setDiscountStr(appointment?.discountAmount ?? "0");
      setCash("");
      setCard("");
      setInsurance("");
      setInsurerId("");
      setPolicyNumber("");
      setBalanceStr("0");
      setBonusStr("0");
      setNote("");
      setSaveError(null);
      setCashDateChoice("today");
      setCashDateConfirmed(false);
      setShowCashDateDialog(false);
      prevAppointmentIdRef.current = appointmentId;
      paymentsTouchedRef.current = false;
    }
  }, [open, appointmentId, appointment?.discountAmount]);

  // Seed discount from summary
  const summaryDiscountRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!summary || discountTouchedRef.current) return;
    if (summary.discountAmount === summaryDiscountRef.current) return;
    summaryDiscountRef.current = summary.discountAmount;
    setDiscountStr(summary.discountAmount ?? "0");
  }, [summary]);

  // Seed cash/card inputs from the appointment's existing payments, so editing
  // an already-paid appointment shows the amounts that were entered (not 0).
  // Skipped once the user starts typing (paymentsTouchedRef) and seeded at most
  // once per appointment.
  React.useEffect(() => {
    if (!summary || appointmentId === null) return;
    if (paymentsTouchedRef.current) return;
    if (seededPaymentsForRef.current === appointmentId) return;
    seededPaymentsForRef.current = appointmentId;
    const sumByMethod = (method: string) =>
      (summary.payments ?? [])
        .filter((p) => p.method === method)
        .reduce((acc, p) => acc + parseDecimal(p.amount), 0);
    const cashSum = sumByMethod("cash");
    const cardSum = sumByMethod("card");
    const insuranceSum = sumByMethod("insurance");
    setCash(cashSum > 0 ? cashSum : "");
    setCard(cardSum > 0 ? cardSum : "");
    setInsurance(insuranceSum > 0 ? insuranceSum : "");
    // Seed insurer + policy from the first insurance journal row.
    const insurancePayment = (summary.payments ?? []).find(
      (p) => p.method === "insurance",
    );
    if (insurancePayment) {
      setInsurerId(insurancePayment.insurerId ?? "");
      setPolicyNumber(insurancePayment.policyNumber ?? "");
    }
    // Seed the cash-date choice from an existing card/insurance payment, so
    // re-saving (e.g. editing the discount) doesn't silently reset a
    // previously chosen "дата приёма" back to "сегодня" (replace-all semantics
    // on the backend recreate these rows on every apply).
    const dateSourcePayment = (summary.payments ?? []).find(
      (p) => (p.method === "card" || p.method === "insurance") && p.cashDate,
    );
    if (dateSourcePayment && appointment?.scheduledAt) {
      const isApptDate = dayjs(dateSourcePayment.cashDate).isSame(
        dayjs(appointment.scheduledAt), "day",
      );
      setCashDateChoice(isApptDate ? "appointment" : "today");
      setCashDateConfirmed(true);
    } else {
      setCashDateChoice("today");
      setCashDateConfirmed(false);
    }
  }, [summary, appointmentId, appointment?.scheduledAt]);

  // Derived
  const total = parseDecimal(summary?.totalAmount ?? appointment?.totalAmount);
  const discountRaw = parseDecimal(discountStr);
  const discount = Math.max(0, Math.min(discountRaw, total));
  const payable = discountTouchedRef.current || !summary
    ? Math.max(0, total - discount)
    : parseDecimal(summary.payableAmount);
  const cashNum = Number(cash || 0);
  const cardNum = Number(card || 0);
  const insuranceNum = Number(insurance || 0);
  const balanceUsed = Math.max(0, parseDecimal(balanceStr));
  const bonusUsed = Math.max(0, parseDecimal(bonusStr));
  const totalPaid = cashNum + cardNum + insuranceNum + balanceUsed + bonusUsed;
  const overpaid = totalPaid > payable + 0.001;
  const balanceExceeded = balanceUsed > availableBalance + 0.001;
  const bonusExceeded = bonusUsed > availableBonuses + 0.001;
  // Страховка: сумма без выбранной компании не проходит.
  const insurerMissing = insuranceNum > 0 && !insurerId;

  // Дата кассы: спрашиваем только если дата приёма не сегодня и есть card/insurance.
  const todayIso = dayjs().format("YYYY-MM-DD");
  const appointmentDateIso = appointment?.scheduledAt
    ? dayjs(appointment.scheduledAt).format("YYYY-MM-DD")
    : todayIso;
  const isDifferentDay = appointment?.scheduledAt
    ? !dayjs(appointment.scheduledAt).isSame(dayjs(), "day")
    : false;
  const needsDateChoice = isDifferentDay && (cardNum > 0 || insuranceNum > 0);

  const refundedTotal = parseDecimal(summary?.refundedTotal);
  const hasRefunds =
    (summary?.refunds?.length ?? 0) > 0 || refundedTotal > 0;

  // Refunds reduce what counts as settled. With a refund the form is read-only,
  // so trust the backend's net figures; otherwise show a live preview from the
  // inputs, net of any refund.
  const netPaid = Math.max(0, totalPaid - refundedTotal);
  const debt = hasRefunds
    ? parseDecimal(summary?.debt)
    : Math.max(0, payable - netPaid);
  const statusPreview = hasRefunds
    ? summary?.paymentStatus ?? computeStatus(payable, netPaid, discount, total)
    : computeStatus(payable, netPaid, discount, total);
  const applyBlockedByRefund = hasRefunds;
  const hasBonusPayment = (summary?.payments ?? []).some((p) => p.method === "bonus");
  const applyBlockedByBonus = hasBonusPayment;

  const discountInvalid = discountRaw < 0 || discountRaw > total + 0.001;
  const submitDisabled =
    discountInvalid || overpaid || balanceExceeded || bonusExceeded ||
    insurerMissing || applyBlockedByRefund || applyBlockedByBonus;

  const isCancelled = CANCELLED_STATUSES.has(appointment?.status ?? "");
  const patientName = appointment?.patient?.fullName ?? "Бронирование";
  const hasPatient = !!patientId;

  // Quick-fill handlers
  const handleCash100 = () => {
    paymentsTouchedRef.current = true;
    setCash(Math.max(0, payable - insuranceNum - balanceUsed - bonusUsed));
    setCard(0);
  };
  const handleCard100 = () => {
    paymentsTouchedRef.current = true;
    setCard(Math.max(0, payable - insuranceNum - balanceUsed - bonusUsed));
    setCash(0);
  };
  const handleInsuranceRest = () => {
    // «Покрыть остаток» — страховая гасит всё, что не покрыто другими способами.
    paymentsTouchedRef.current = true;
    setInsurance(Math.max(0, payable - cashNum - cardNum - balanceUsed - bonusUsed));
  };
  const handleBalanceQuickFill = () => {
    const fill = Math.min(debt, availableBalance);
    if (fill > 0) setBalanceStr(fmt(fill));
  };
  const handleBonusQuickFill = () => {
    const debtAfterOthers = Math.max(
      0, payable - cashNum - cardNum - insuranceNum - balanceUsed,
    );
    const fill = Math.min(debtAfterOthers, availableBonuses);
    if (fill > 0) setBonusStr(fmt(fill));
  };

  const applyMutation = useMutation({
    mutationFn: (payload: ApplyPaymentPayload) => {
      if (!appointmentId) throw new Error("Нет выбранного приёма");
      return applyAppointmentPayment(appointmentId, payload);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(djangoQueryKeys.appointments.payments(result.appointmentId), result);
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.payments(result.appointmentId) });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "day-counts"] });
      // Домашний агрегат (список приёмов на /appointments) — иначе бейджи
      // способов оплаты обновятся только после heartbeat/перезагрузки.
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments", "home"] });
      if (patientId && (balanceUsed > 0 || bonusUsed > 0)) {
        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.balance(patientId) });
        void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.transactions(patientId) });
      }
      notify?.({ type: "success", message: "Оплата сохранена" });
      onClose();
      onSaved?.(result);
    },
    onError: (err: unknown) => {
      const raw = parseBackendError(err);
      const msg = mapSaveError(raw);
      setSaveError(msg);
      notify?.({ type: "error", message: msg });
    },
  });

  // Дата приёма не сегодня — датой кассы для card/insurance переопределяем,
  // только когда пользователь явно выбрал/подтвердил (choice передаётся явно,
  // чтобы не читать ещё не применившийся setState из CashDateConfirmDialog).
  const submitPayment = (choice: CashDateChoice) => {
    if (!appointment) return;
    setSaveError(null);
    const cashDate = needsDateChoice
      ? (choice === "appointment" ? appointmentDateIso : todayIso)
      : undefined;
    const payments: PaymentLineInput[] = [];
    if (cashNum > 0) payments.push({ method: "cash", amount: fmt(cashNum) });
    if (cardNum > 0) {
      payments.push({
        method: "card",
        amount: fmt(cardNum),
        ...(cashDate ? { cashDate } : {}),
      });
    }
    if (insuranceNum > 0 && insurerId) {
      payments.push({
        method: "insurance",
        amount: fmt(insuranceNum),
        insurerId: Number(insurerId),
        policyNumber: policyNumber.trim() || undefined,
        ...(cashDate ? { cashDate } : {}),
      });
    }
    applyMutation.mutate({
      discountAmount: fmt(discount),
      payments,
      balanceAmount: balanceUsed > 0 ? fmt(balanceUsed) : undefined,
      bonusAmount: bonusUsed > 0 ? fmt(bonusUsed) : undefined,
      note: note.trim() || undefined,
    });
  };

  const handleSave = () => {
    if (needsDateChoice && !cashDateConfirmed) {
      setShowCashDateDialog(true);
      return;
    }
    submitPayment(cashDateChoice);
  };

  const handleCashDateChoose = (choice: CashDateChoice) => {
    // If the dialog was gating a pending Save (opened because the choice was
    // never confirmed), finish that save right away — same flow as
    // OverlapConfirmDialog's resubmit-on-confirm. If it was opened via the
    // inline "изменить" link on an already-confirmed choice, just update the
    // state; the user submits explicitly via the Save button.
    const wasPendingSave = !cashDateConfirmed;
    setCashDateChoice(choice);
    setCashDateConfirmed(true);
    setShowCashDateDialog(false);
    if (wasPendingSave) submitPayment(choice);
  };

  const handleSummaryUpdated = React.useCallback(
    (updated: PaymentSummary) => {
      if (!updated.appointmentId) return;
      queryClient.setQueryData(djangoQueryKeys.appointments.payments(updated.appointmentId), updated);
    },
    [queryClient],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={applyMutation.isPending ? undefined : onClose}
      PaperProps={{
        // sm в теме проекта = 360px, поэтому на телефонах страхуемся maxWidth.
        sx: { width: { xs: "100%", sm: 420 }, maxWidth: "100%", display: "flex", flexDirection: "column" },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <PaymentsOutlined color="primary" />
          <Typography variant="h6">Оплата приёма</Typography>
        </Stack>
        <IconButton onClick={onClose} disabled={applyMutation.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>

      {/* Body */}
      <Stack
        spacing={3}
        sx={{
          p: 3,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {/* Patient balance panel */}
        {hasPatient && <PatientBalancePanel patientId={patientId!} />}

        {isCancelled && (
          <Alert severity="warning">
            Приём отменён или помечен как неявка — оплата недоступна.
          </Alert>
        )}

        {paymentQuery.isLoading && (
          <Stack alignItems="center" py={3}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {paymentQuery.error && !paymentQuery.isLoading && (
          <Alert severity="warning">{parseBackendError(paymentQuery.error)}</Alert>
        )}

        {/* ── Main payment card ── */}
        {!paymentQuery.isLoading && !isCancelled && (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: (theme) => alpha(theme.palette.success.main, 0.04),
              border: "1px solid",
              borderColor: (theme) => alpha(theme.palette.success.main, 0.2),
              borderRadius: "14px",
            }}
          >
            <Stack spacing={2}>
              {/* Patient info */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}
                >
                  Пациент
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {patientName}
                </Typography>
              </Box>

              {/* Balance/bonus quick-fill */}
              {hasPatient && (
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 1, fontWeight: 600, letterSpacing: 0.5 }}
                  >
                    Счёт пациента
                  </Typography>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: "success.main" }} />
                        <Typography variant="body2">
                          Баланс:{" "}
                          <Box component="strong" sx={{ color: "success.main" }}>
                            {availableBalance.toLocaleString()} с
                          </Box>
                        </Typography>
                      </Stack>
                      {(availableBalance > 0 || balanceUsed > 0) && (
                        <Tooltip title={balanceUsed > 0 ? "Убрать" : "Использовать баланс"}>
                          <Button
                            size="small"
                            variant={balanceUsed > 0 ? "contained" : "outlined"}
                            color="success"
                            sx={{ minWidth: "auto", px: 1.5, fontSize: "0.7rem", textTransform: "none", py: 0.25 }}
                            onClick={() => {
                              if (balanceUsed > 0) {
                                setBalanceStr("0");
                              } else {
                                handleBalanceQuickFill();
                              }
                            }}
                          >
                            {balanceUsed > 0 ? `− ${balanceUsed.toLocaleString()} с` : "Использовать"}
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>

                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <CardGiftcardOutlined sx={{ fontSize: 16, color: "warning.main" }} />
                        <Typography variant="body2">
                          Бонусы:{" "}
                          <Box component="strong" sx={{ color: "warning.main" }}>
                            {availableBonuses.toLocaleString()} с
                          </Box>
                        </Typography>
                      </Stack>
                      {(availableBonuses > 0 || bonusUsed > 0) && (
                        <Tooltip title={bonusUsed > 0 ? "Убрать" : "Использовать бонусы"}>
                          <Button
                            size="small"
                            variant={bonusUsed > 0 ? "contained" : "outlined"}
                            color="warning"
                            sx={{ minWidth: "auto", px: 1.5, fontSize: "0.7rem", textTransform: "none", py: 0.25 }}
                            onClick={() => {
                              if (bonusUsed > 0) {
                                setBonusStr("0");
                              } else {
                                handleBonusQuickFill();
                              }
                            }}
                          >
                            {bonusUsed > 0 ? `− ${bonusUsed.toLocaleString()} с` : "Использовать"}
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              )}

              <Divider sx={{ my: 1 }} />

              <Stack spacing={2}>
                {/* Price + discount side-by-side; скидка переносится вниз на
                    всю ширину, если в строке не хватает места (поле + тумблер). */}
                <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                  <Box sx={{ flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                      Стоимость
                    </Typography>
                    <Typography variant="h6" fontWeight={600} noWrap>
                      {total.toLocaleString()} с
                    </Typography>
                  </Box>
                  <Box sx={{ flex: "1 1 180px", minWidth: 180 }}>
                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                      Скидка
                    </Typography>
                    <DiscountInput
                      total={total}
                      amount={discount}
                      onAmountChange={(amt) => {
                        discountTouchedRef.current = true;
                        setDiscountStr(String(amt));
                      }}
                      error={discountInvalid}
                      helperText={discountInvalid ? `0 — ${fmt(total)}` : ""}
                      disabled={isCancelled}
                    />
                  </Box>
                </Stack>

                {/* Cash + Card side-by-side (original layout) */}
                <Stack direction="row" spacing={2}>
                  <Stack flex={1} spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" display="block">
                        Наличные
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleCash100}
                        sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                        disabled={isCancelled}
                      >
                        100%
                      </Button>
                    </Stack>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box px={1}>
                        <AccountBalanceWalletOutlined color="action" fontSize="small" />
                      </Box>
                      <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        value={cash}
                        onChange={(e) => {
                          paymentsTouchedRef.current = true;
                          if (e.target.value === "") {
                            setCash("");
                          } else {
                            const val = Number(e.target.value);
                            const maxAllowed = Math.max(0, payable - cardNum - insuranceNum - balanceUsed - bonusUsed);
                            setCash(Math.min(val, maxAllowed));
                          }
                        }}
                        InputProps={{ disableUnderline: true }}
                        sx={{ py: 0.5, ...noSpinnersSx }}
                        placeholder="0"
                        disabled={isCancelled}
                      />
                    </Stack>
                  </Stack>

                  <Stack flex={1} spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" display="block">
                        Безналичные
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleCard100}
                        sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                        disabled={isCancelled}
                      >
                        100%
                      </Button>
                    </Stack>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box px={1}>
                        <CreditCardOutlined color="action" fontSize="small" />
                      </Box>
                      <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        value={card}
                        onChange={(e) => {
                          paymentsTouchedRef.current = true;
                          if (e.target.value === "") {
                            setCard("");
                          } else {
                            const val = Number(e.target.value);
                            const maxAllowed = Math.max(0, payable - cashNum - insuranceNum - balanceUsed - bonusUsed);
                            setCard(Math.min(val, maxAllowed));
                          }
                        }}
                        InputProps={{ disableUnderline: true }}
                        sx={{ py: 0.5, ...noSpinnersSx }}
                        placeholder="0"
                        disabled={isCancelled}
                      />
                    </Stack>
                  </Stack>
                </Stack>

                {/* Insurance (страховка): сумма + компания + полис */}
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary" display="block">
                      Страховка
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={handleInsuranceRest}
                      sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                      disabled={isCancelled}
                    >
                      Покрыть остаток
                    </Button>
                  </Stack>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0}
                    sx={{
                      border: "1px solid",
                      borderColor: insurerMissing ? "error.main" : "divider",
                      borderRadius: 1,
                      bgcolor: "background.paper",
                    }}
                  >
                    <Box px={1}>
                      <HealthAndSafetyOutlined
                        color={insuranceNum > 0 ? "primary" : "action"}
                        fontSize="small"
                      />
                    </Box>
                    <TextField
                      variant="standard"
                      fullWidth
                      type="number"
                      value={insurance}
                      onChange={(e) => {
                        paymentsTouchedRef.current = true;
                        if (e.target.value === "") {
                          setInsurance("");
                        } else {
                          const val = Number(e.target.value);
                          const maxAllowed = Math.max(0, payable - cashNum - cardNum - balanceUsed - bonusUsed);
                          setInsurance(Math.min(val, maxAllowed));
                        }
                      }}
                      InputProps={{ disableUnderline: true }}
                      sx={{ py: 0.5, ...noSpinnersSx }}
                      placeholder="0"
                      disabled={isCancelled}
                    />
                  </Stack>

                  {insuranceNum > 0 && (
                    <Stack spacing={1.5} sx={{ pt: 1.5 }}>
                      {/* Каждое поле на своей строке, лейбл — заголовком над
                          инпутом (floating-label запрещён по гайду). */}
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Страховая компания
                        </Typography>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={insurerId}
                          onChange={(e) => {
                            setInsurerId(e.target.value === "" ? "" : Number(e.target.value));
                          }}
                          error={insurerMissing}
                          helperText={insurerMissing ? "Выберите компанию" : ""}
                          disabled={isCancelled}
                        >
                          {insurers.length === 0 && (
                            <MenuItem value="" disabled>
                              {insurersQuery.isLoading
                                ? "Загрузка…"
                                : "Справочник пуст — добавьте в настройках"}
                            </MenuItem>
                          )}
                          {insurers.map((i) => (
                            <MenuItem key={i.id} value={i.id}>
                              {i.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Номер полиса
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          value={policyNumber}
                          onChange={(e) => setPolicyNumber(e.target.value)}
                          placeholder="Необязательно"
                          disabled={isCancelled}
                        />
                      </Stack>
                    </Stack>
                  )}
                </Stack>

                {/* Дата кассы для card/insurance — видно решение до сабмита. */}
                {needsDateChoice && (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">
                      Дата кассы:{" "}
                      <strong>
                        {cashDateConfirmed
                          ? (cashDateChoice === "appointment"
                            ? `дата приёма (${dayjs(appointmentDateIso).format("D MMMM")})`
                            : `сегодня (${dayjs(todayIso).format("D MMMM")})`)
                          : "не выбрана"}
                      </strong>
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setShowCashDateDialog(true)}
                      sx={{ minWidth: "auto", px: 1, fontSize: "0.7rem", textTransform: "none" }}
                      disabled={isCancelled}
                    >
                      изменить
                    </Button>
                  </Stack>
                )}

                {/* Balance/bonus/insurance used display */}
                {(balanceUsed > 0 || bonusUsed > 0 || insuranceNum > 0) && (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.25,
                      bgcolor: (t) => alpha(t.palette.success.main, 0.06),
                      border: "1px solid",
                      borderColor: (t) => alpha(t.palette.success.main, 0.2),
                      borderRadius: 1,
                    }}
                  >
                    <Stack spacing={0.5}>
                      {balanceUsed > 0 && (
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="success.main">Со счёта</Typography>
                          <Typography variant="caption" color="success.main" fontWeight={600}>
                            − {balanceUsed.toLocaleString()} с
                          </Typography>
                        </Stack>
                      )}
                      {bonusUsed > 0 && (
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="warning.main">Бонусами</Typography>
                          <Typography variant="caption" color="warning.main" fontWeight={600}>
                            − {bonusUsed.toLocaleString()} с
                          </Typography>
                        </Stack>
                      )}
                      {insuranceNum > 0 && (
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="primary.main">
                            Страховая
                            {insurerId
                              ? ` · ${insurers.find((i) => i.id === insurerId)?.name ?? ""}`
                              : ""}
                          </Typography>
                          <Typography variant="caption" color="primary.main" fontWeight={600}>
                            − {insuranceNum.toLocaleString()} с
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                )}

                <Divider sx={{ my: 1 }} />

                {/* Итого */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    Итого к оплате
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="success.main">
                    {payable.toLocaleString()} с
                  </Typography>
                </Stack>

                {/* Status + debt */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Статус</Typography>
                  <Chip
                    label={PAYMENT_STATUS_LABELS[statusPreview] ?? statusPreview}
                    size="small"
                    color={PAYMENT_STATUS_COLOR[statusPreview] ?? "default"}
                    sx={{ fontWeight: 600 }}
                  />
                </Stack>

                {debt > 0 && (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      bgcolor: (t) => alpha(t.palette.error.main, 0.08),
                      border: "1px solid",
                      borderColor: (t) => alpha(t.palette.error.main, 0.3),
                      borderRadius: 1,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="error.main" fontWeight={600}>Долг</Typography>
                      <Typography variant="h6" color="error.main" fontWeight={700}>
                        {debt.toLocaleString()} с
                      </Typography>
                    </Stack>
                  </Paper>
                )}

                {overpaid && (
                  <Alert severity="error" sx={{ py: 0.5 }}>
                    Переплата: внесено больше суммы к оплате
                  </Alert>
                )}
              </Stack>
            </Stack>
          </Paper>
        )}

        {/* Refund / bonus block guards */}
        {applyBlockedByRefund && (
          <Alert severity="info" icon={false}>
            Изменение оплаты недоступно — по приёму уже оформлен возврат.
          </Alert>
        )}
        {!applyBlockedByRefund && applyBlockedByBonus && (
          <Alert severity="info" icon={false}>
            Изменение оплаты недоступно — по приёму уже списаны бонусы. Для корректировки оформите возврат.
          </Alert>
        )}

        {/* Payment history */}
        {summary && summary.payments.length > 0 && !hasRefunds && !isCancelled && (
          <>
            <Divider />
            <Stack spacing={0.75}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                История платежей
              </Typography>
              {summary.payments.map((p) => (
                <Stack key={p.id} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {METHOD_LABELS[p.method] ?? p.method}
                    {p.method === "insurance" && p.insurerName ? ` · ${p.insurerName}` : ""}
                    {p.method === "insurance" && p.policyNumber ? ` (${p.policyNumber})` : ""}
                    {(p.method === "card" || p.method === "insurance") && p.cashDate
                      ? ` · касса ${dayjs(p.cashDate).format("D MMM")}`
                      : ""}
                  </Typography>
                  <Typography variant="caption" fontWeight={500}>{p.amount} с</Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        {/* Refunds panel */}
        {!paymentQuery.isLoading && summary && appointmentId !== null && (
          <AppointmentRefundsPanel
            appointmentId={appointmentId}
            patientId={patientId}
            summary={summary}
            onSummaryUpdated={handleSummaryUpdated}
          />
        )}

        {/* Comment */}
        {!isCancelled && (
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Комментарий администратора
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={2}
              size="small"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Добавьте комментарий (необязательно)"
            />
          </Stack>
        )}

        {saveError && <Alert severity="error">{saveError}</Alert>}
      </Stack>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={submitDisabled || applyMutation.isPending || isCancelled}
          onClick={handleSave}
          startIcon={applyMutation.isPending ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          {applyMutation.isPending
            ? "Сохранение…"
            : summary?.payments && summary.payments.length > 0
            ? "Обновить оплату"
            : "Подтвердить оплату"}
        </Button>
      </Box>

      <CashDateConfirmDialog
        open={showCashDateDialog}
        todayDate={todayIso}
        appointmentDate={appointmentDateIso}
        onChoose={handleCashDateChoose}
        onCancel={() => setShowCashDateDialog(false)}
      />
    </Drawer>
  );
};

export default DjangoPaymentDrawer;
