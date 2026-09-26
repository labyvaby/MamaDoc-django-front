import React from "react";
import {
  Alert,
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
import { AppButton, CustomDatePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";
import { quoteMessage } from "../priceQuote";
import { formatMoney } from "../registryTabs";

interface RenewDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  onClose: () => void;
  onDone: () => void;
}

const MONEY_RE = /^\d{0,10}(?:[.,]\d{0,2})?$/;

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
  const [price, setPrice] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setPackageId("");
    setMonths("12");
    setStartsOn(null);
    setPrice("");
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
  const message = quote.data ? quoteMessage(quote.data) : null;

  const monthsValue = Number(months);
  const monthsInvalid = !Number.isInteger(monthsValue) || monthsValue < 1 || monthsValue > 60;
  const renew = useMutation({
    mutationFn: () => createTerm(scope, target.enrollmentId, {
      packageId: packageId === "" ? null : packageId,
      months: monthsValue,
      startsOn: startsOn ? startsOn.format("YYYY-MM-DD") : null,
      priceAmount: price.trim() ? price.trim().replace(",", ".") : null,
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
          <TextField
            size="small"
            label={t("renew.price")}
            value={price}
            onChange={(e) => {
              if (MONEY_RE.test(e.target.value)) setPrice(e.target.value);
            }}
            helperText={message ? t(message.key, message.values) : t("renew.priceHint")}
            inputProps={{ inputMode: "decimal" }}
          />
          {list.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">{t("renew.terms")}</Typography>
              {list.map((term) => (
                <Stack key={term.id} direction="row" alignItems="center" gap={1}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {dayjs(term.startsOn).format("DD.MM.YYYY")} — {dayjs(term.endsOn).format("DD.MM.YYYY")} ·{" "}
                    {term.package ? `${term.package.name} · ` : ""}
                    {formatMoney(term.priceAmount)} сом · {t(`payment.${term.paymentState}`)}
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
          disabled={monthsInvalid || renew.isPending || packageId === ""}
          onClick={() => renew.mutate()}
        >
          {t("renew.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
