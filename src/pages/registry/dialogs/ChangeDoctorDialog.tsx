import React from "react";
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import { changeResponsibleEmployee } from "../../../api/registry";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../../hooks/useAllActiveEmployees";
import { useT } from "../../../i18n/VerticalProvider";
import type { EnrollmentTarget } from "../enrollmentTarget";

interface ChangeDoctorDialogProps {
  open: boolean;
  scope: ActiveScope;
  target: EnrollmentTarget;
  onClose: () => void;
  onDone: () => void;
}

/** Смена закреплённого врача; бэк пишет «Смена врача: A → B» в историю. */
export const ChangeDoctorDialog: React.FC<ChangeDoctorDialogProps> = ({ open, scope, target, onClose, onDone }) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const { employees, isLoading } = useAllActiveEmployees(open);
  const doctors = React.useMemo(() => doctorEmployeesOnly(employees), [employees]);
  const [employeeId, setEmployeeId] = React.useState<number | "">(target.responsibleEmployeeId ?? "");

  React.useEffect(() => {
    if (open) setEmployeeId(target.responsibleEmployeeId ?? "");
  }, [open, target.responsibleEmployeeId]);

  const mutation = useMutation({
    mutationFn: () => changeResponsibleEmployee(scope, target.enrollmentId, employeeId === "" ? null : employeeId),
    onSuccess: () => {
      enqueueSnackbar(t("doctor.done"), { variant: "success" });
      onDone();
    },
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t("doctor.title")} — {target.patientName}
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <TextField
            select
            size="small"
            label={t("doctor.field")}
            value={employeeId}
            disabled={isLoading}
            onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <MenuItem value="">{t("doctor.none")}</MenuItem>
            {doctors.map((employee) => (
              <MenuItem key={employee.id} value={employee.id}>
                {employee.fullName}
              </MenuItem>
            ))}
          </TextField>
          {mutation.error && <Alert severity="error">{getErrorMessage(mutation.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={mutation.isPending}>
          {t("wizard.close")}
        </AppButton>
        <AppButton
          variant="contained"
          disabled={mutation.isPending || employeeId === (target.responsibleEmployeeId ?? "")}
          onClick={() => mutation.mutate()}
        >
          {t("doctor.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
