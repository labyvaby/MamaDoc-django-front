import React from "react";
import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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

/** Пакет учёта: название, цены, срок, скидки и «Что входит». */
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

  const field = (key: TextKey, hint?: string) => {
    const problem = touched ? errors[key] : undefined;
    return {
      value: form[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm({ ...form, [key]: event.target.value }),
      error: Boolean(problem),
      helperText: problem ? t(problem) : hint,
    };
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {pkg ? t("packages.edit") : t("packages.new")}
        <Typography variant="body2" color="text.secondary">
          {programName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <TextField size="small" label={t("packages.name")} autoFocus inputProps={{ maxLength: 120 }} {...field("name")} />
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <TextField
              size="small"
              label={t("packages.price")}
              inputProps={{ inputMode: "decimal" }}
              sx={{ flex: 1 }}
              {...field("price")}
            />
            <TextField
              size="small"
              label={t("packages.listPrice")}
              inputProps={{ inputMode: "decimal" }}
              sx={{ flex: 1 }}
              {...field("listPrice", t("packages.listPriceHint"))}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <TextField
              size="small"
              type="number"
              label={t("packages.term")}
              inputProps={{ min: 1, max: 60 }}
              sx={{ flex: 1 }}
              {...field("termMonths")}
            />
            <TextField
              size="small"
              type="number"
              label={t("packages.familyDiscount")}
              inputProps={{ min: 0, max: 100 }}
              sx={{ flex: 1 }}
              {...field("familyDiscount", t("packages.familyDiscountHint"))}
            />
            <TextField
              size="small"
              type="number"
              label={t("packages.visitDiscount")}
              inputProps={{ min: 0, max: 100 }}
              sx={{ flex: 1 }}
              {...field("visitDiscount", t("packages.visitDiscountHint"))}
            />
          </Stack>
          <TextField
            label={t("packages.description")}
            multiline
            minRows={4}
            {...field("description", t("packages.descriptionHint"))}
          />
          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />}
            label={t("packages.active")}
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
