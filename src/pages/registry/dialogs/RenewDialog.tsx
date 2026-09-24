import React from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import { createTerm, deleteTerm, getTerms } from "../../../api/registry";
import { AppButton, CustomDatePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";
import { formatMoney } from "../registryTabs";

interface RenewDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  defaultMonths?: number;
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
  defaultMonths = 12,
  onClose,
  onDone,
}) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const [months, setMonths] = React.useState(String(defaultMonths));
  const [startsOn, setStartsOn] = React.useState<Dayjs | null>(null);
  const [price, setPrice] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setMonths(String(defaultMonths));
    setStartsOn(null);
    setPrice("");
  }, [open, defaultMonths]);

  const terms = useQuery({
    queryKey: ["django", "programs", "terms", target.enrollmentId, scope],
    queryFn: ({ signal }) => getTerms(scope, target.enrollmentId, signal),
    enabled: open && scope.isReady && scope.orgReady,
  });

  const monthsValue = Number(months);
  const monthsInvalid = !Number.isInteger(monthsValue) || monthsValue < 1 || monthsValue > 60;
  const renew = useMutation({
    mutationFn: () => createTerm(scope, target.enrollmentId, {
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
            helperText={t("renew.priceHint")}
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
          disabled={monthsInvalid || renew.isPending}
          onClick={() => renew.mutate()}
        >
          {t("renew.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
