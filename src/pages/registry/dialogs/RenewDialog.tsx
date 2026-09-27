import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import { getProgramPackages } from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { createTerm, deleteTerm, getPriceQuote, getTerms } from "../../../api/registry";
import { AppButton, CustomDatePicker, DiscountInput } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";
import { formatMoney } from "../registryTabs";

interface RenewDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Продление — новый оплачиваемый период, а не новое подключение. Здесь же
 * можно удалить ошибочно добавленный последний период без оплат.
 */
export const RenewDialog: React.FC<RenewDialogProps> = ({
  open,
  scope,
  target,
  onClose,
  onDone,
}) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const ready = scope.isReady && scope.orgReady;
  const [packageId, setPackageId] = React.useState<number | "">("");
  const [months, setMonths] = React.useState("12");
  const [startsOn, setStartsOn] = React.useState<Dayjs | null>(null);
  /** Скидка на кассе, сом («% / с» пересчитывает проценты в сомы). */
  const [discount, setDiscount] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setPackageId("");
    setMonths("12");
    setStartsOn(null);
    setDiscount(0);
  }, [open]);

  const terms = useQuery({
    queryKey: ["django", "programs", "terms", target.enrollmentId, scope],
    queryFn: ({ signal }) => getTerms(scope, target.enrollmentId, signal),
    enabled: open && ready,
  });
  const packages = useQuery({
    queryKey: djangoQueryKeys.programs.packages(scope, { programId: target.programId, active: true }),
    queryFn: ({ signal }) => getProgramPackages(scope, { programId: target.programId, active: true }, signal),
    enabled: open && ready,
  });
  const offered = React.useMemo(() => packages.data ?? [], [packages.data]);
  const currentPackageId = target.currentTerm?.package?.id;
  // Текущий пакет ребёнка, а если он выключен — единственный включённый.
  React.useEffect(() => {
    if (!open || packageId !== "" || !offered.length) return;
    const initial =
      offered.find((item) => item.id === currentPackageId) ?? (offered.length === 1 ? offered[0] : undefined);
    if (initial) {
      setPackageId(initial.id);
      setMonths(String(initial.termMonths));
    }
  }, [open, packageId, offered, currentPackageId]);

  const quoteParams = { packageId: Number(packageId), patientId: target.patientId };
  const quote = useQuery({
    queryKey: djangoQueryKeys.programs.priceQuote(scope, quoteParams),
    queryFn: ({ signal }) => getPriceQuote(scope, quoteParams, signal),
    enabled: open && ready && packageId !== "",
  });
  const cost = quote.data ? Number(quote.data.priceAmount) : null;
  const discountInvalid = cost != null && discount > cost + 0.001;
  const amount = (value: number | string) => t("wizard.payment.amount", { amount: formatMoney(value) });

  const monthsValue = Number(months);
  const monthsInvalid = !Number.isInteger(monthsValue) || monthsValue < 1 || monthsValue > 60;
  const renew = useMutation({
    mutationFn: () => createTerm(scope, target.enrollmentId, {
      packageId: packageId === "" ? null : packageId,
      months: monthsValue,
      startsOn: startsOn ? startsOn.format("YYYY-MM-DD") : null,
      discountAmount: discount > 0 ? discount.toFixed(2) : null,
    }),
    onSuccess: () => {
      enqueueSnackbar(t("renew.done"), { variant: "success" });
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: (termId: number) => deleteTerm(scope, target.enrollmentId, termId),
    onSuccess: () => {
      enqueueSnackbar(t("renew.deleted"), { variant: "success" });
      void terms.refetch();
      onDone();
    },
  });

  const list = terms.data ?? [];
  const last = list.length ? list[list.length - 1] : null;
  const error = renew.error ?? remove.error;

  return (
    <Dialog open={open} onClose={renew.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t("renew.title")}
        <Typography variant="body2" color="text.secondary">
          {target.patientName} · {target.programName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <TextField
            select
            size="small"
            label={t("renew.package")}
            value={packageId}
            onChange={(e) => {
              const next = offered.find((item) => item.id === Number(e.target.value));
              setPackageId(next?.id ?? "");
              setDiscount(0);
              if (next) setMonths(String(next.termMonths));
            }}
            helperText={packages.isSuccess && !offered.length ? t("renew.noPackages") : undefined}
          >
            {offered.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name} · {formatMoney(item.priceAmount)} сом
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            label={t("renew.months")}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            error={monthsInvalid}
            helperText={monthsInvalid ? t("wizard.program.termInvalid") : undefined}
            inputProps={{ min: 1, max: 60 }}
          />
          <CustomDatePicker
            label={t("renew.startsOn")}
            value={startsOn}
            onChange={(value) => setStartsOn(value)}
            slotProps={{ textField: { size: "small", helperText: t("renew.startsOnHint") } }}
          />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "auto minmax(0, 1fr)", alignItems: "start" }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                {t("wizard.payment.cost")}
              </Typography>
              <Typography variant="h6" fontWeight={600} noWrap>
                {cost == null ? "—" : amount(cost)}
              </Typography>
              {quote.data && quote.data.familyDiscountPercent > 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {t("wizard.payment.familyNote", {
                    percent: quote.data.familyDiscountPercent,
                    base: formatMoney(quote.data.basePriceAmount),
                  })}
                </Typography>
              )}
            </Box>
            <Box minWidth={0}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                {t("wizard.payment.discount")}
              </Typography>
              <DiscountInput
                total={cost ?? 0}
                amount={discount}
                onAmountChange={setDiscount}
                error={discountInvalid}
                helperText={discountInvalid ? t("wizard.payment.discountTooBig") : ""}
                disabled={cost == null}
              />
            </Box>
          </Box>
          {cost != null && (
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {t("renew.total")}
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                {amount(Math.max(0, cost - discount).toFixed(2))}
              </Typography>
            </Stack>
          )}
          {list.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">{t("renew.terms")}</Typography>
              {list.map((term) => (
                <Stack key={term.id} direction="row" alignItems="center" gap={1}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {dayjs(term.startsOn).format("DD.MM.YYYY")} — {dayjs(term.endsOn).format("DD.MM.YYYY")} ·{" "}
                    {term.package ? `${term.package.name} · ` : ""}
                    {formatMoney(term.priceAmount)} сом
                    {Number(term.discountAmount) > 0
                      ? ` (${t("renew.discountNote", { amount: formatMoney(term.discountAmount) })})`
                      : ""}{" "}
                    · {t(`payment.${term.paymentState}`)}
                  </Typography>
                  {term.id === last?.id && Number(term.paidAmount) === 0 && (
                    <Tooltip title={t("renew.delete")}>
                      <IconButton
                        size="small"
                        aria-label={t("renew.delete")}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(term.id)}
                      >
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </>
          )}
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={renew.isPending}>
          {t("wizard.close")}
        </AppButton>
        <AppButton
          variant="contained"
          disabled={monthsInvalid || discountInvalid || renew.isPending || packageId === ""}
          onClick={() => renew.mutate()}
        >
          {t("renew.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
