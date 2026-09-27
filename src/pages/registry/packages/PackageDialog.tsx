import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import { createProgramPackage, updateProgramPackage, type ProgramPackage } from "../../../api/programs";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import { formToPayload, packageToForm, validatePackageForm, type PackageForm } from "./packageForm";

interface PackageDialogProps {
  scope: ActiveScope;
  programId: number;
  programName: string;
  /** `null` — новый пакет. */
  pkg: ProgramPackage | null;
  onClose: () => void;
  onSaved: () => void;
}

type TextKey = Exclude<keyof PackageForm, "isActive">;

/** Что можно набрать в поле: деньги — цифры и одна запятая, остальное — цифры. */
const MONEY_INPUT = /^\d{0,10}(?:[.,]\d{0,2})?$/;
const INT_INPUT = /^\d{0,3}$/;

// Не больше двух колонок, и только на широком экране: подписи и подсказки
// помещаются целиком. В теме приложения `sm` — это 360px, поэтому граница — `md`.
const pairSx = {
  display: "grid",
  gap: 1.5,
  alignItems: "start",
  gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
} as const;

const unit = (text: string) => ({ endAdornment: <InputAdornment position="end">{text}</InputAdornment> });

/** Пакет учёта: название и срок, цены, скидки, «Что входит». */
export const PackageDialog: React.FC<PackageDialogProps> = ({ scope, programId, programName, pkg, onClose, onSaved }) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = React.useState<PackageForm>(() => packageToForm(pkg));
  const [touched, setTouched] = React.useState(false);
  const errors = validatePackageForm(form);

  const save = useMutation({
    mutationFn: () =>
      pkg
        ? updateProgramPackage(scope, pkg.id, formToPayload(form))
        : createProgramPackage(scope, { ...formToPayload(form), programId }),
    onSuccess: () => {
      enqueueSnackbar(t("packages.saved"), { variant: "success" });
      onSaved();
    },
  });

  const field = (key: TextKey, hint?: string, pattern?: RegExp) => {
    const problem = touched ? errors[key] : undefined;
    return {
      value: form[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!pattern || pattern.test(event.target.value)) setForm({ ...form, [key]: event.target.value });
      },
      error: Boolean(problem),
      helperText: problem ? t(problem) : hint,
    };
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { maxWidth: 600 } }}
    >
      <DialogTitle>
        {pkg ? t("packages.edit") : t("packages.new")}
        <Typography variant="body2" color="text.secondary">
          {programName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Box sx={{ ...pairSx, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 150px" } }}>
            <TextField
              size="small"
              required
              label={t("packages.name")}
              autoFocus
              inputProps={{ maxLength: 120 }}
              {...field("name")}
            />
            <TextField
              size="small"
              required
              label={t("packages.term")}
              inputProps={{ inputMode: "numeric" }}
              InputProps={unit(t("packages.unitMonths"))}
              {...field("termMonths", undefined, INT_INPUT)}
            />
          </Box>
          <Box sx={pairSx}>
            <TextField
              size="small"
              required
              label={t("packages.price")}
              inputProps={{ inputMode: "decimal" }}
              InputProps={unit(t("packages.unitMoney"))}
              {...field("price", undefined, MONEY_INPUT)}
            />
            <TextField
              size="small"
              label={t("packages.listPrice")}
              inputProps={{ inputMode: "decimal" }}
              InputProps={unit(t("packages.unitMoney"))}
              {...field("listPrice", t("packages.listPriceHint"), MONEY_INPUT)}
            />
          </Box>
          <Box sx={pairSx}>
            <TextField
              size="small"
              label={t("packages.familyDiscount")}
              inputProps={{ inputMode: "numeric" }}
              InputProps={unit("%")}
              {...field("familyDiscount", t("packages.familyDiscountHint"), INT_INPUT)}
            />
            <TextField
              size="small"
              label={t("packages.visitDiscount")}
              inputProps={{ inputMode: "numeric" }}
              InputProps={unit("%")}
              {...field("visitDiscount", t("packages.visitDiscountHint"), INT_INPUT)}
            />
          </Box>
          <TextField
            label={t("packages.description")}
            multiline
            minRows={3}
            {...field("description", t("packages.descriptionHint"))}
          />
          <FormControlLabel
            sx={{ alignItems: "flex-start", m: 0, gap: 1 }}
            control={
              <Switch
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                sx={{ mt: -0.5 }}
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {t("packages.active")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("packages.activeHint")}
                </Typography>
              </Box>
            }
          />
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={save.isPending}>
          {t("wizard.close")}
        </AppButton>
        <AppButton variant="contained" onClick={submit} disabled={save.isPending}>
          {t("packages.save")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
