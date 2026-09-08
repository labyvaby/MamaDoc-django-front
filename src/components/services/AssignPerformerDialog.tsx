/**
 * AssignPerformerDialog.tsx
 * Назначение услуги сотруднику прямо из карточки услуги — обратная сторона
 * дровера «Услуги сотрудника»: там выбирают услуги для одного сотрудника,
 * здесь — сотрудников для одной услуги.
 */
import React from "react";
import {
  Autocomplete,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { assignEmployeeService, type DjangoEmployeeListItem } from "../../api/staff";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  serviceId: number;
  serviceName: string;
  /** Уже назначенные — их не предлагаем: повторное назначение бэк отклонит. */
  assignedIds: number[];
};

const AssignPerformerDialog: React.FC<Props> = ({
  open,
  onClose,
  serviceId,
  serviceName,
  assignedIds,
}) => {
  const { t } = useT("services");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();
  const { employees, isLoading } = useAllActiveEmployees(open);

  const [picked, setPicked] = React.useState<DjangoEmployeeListItem[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setPicked([]);
  }, [open, serviceId]);

  const options = React.useMemo(
    () => employees.filter((e) => !assignedIds.includes(e.id)),
    [employees, assignedIds],
  );

  const optionLabel = React.useCallback(
    (e: DjangoEmployeeListItem) => {
      const spec = e.specializations.map((s) => s.name).join(", ");
      return spec ? `${e.fullName} — ${spec}` : e.fullName;
    },
    [],
  );

  const handleSave = async () => {
    if (picked.length === 0) return;
    setSaving(true);
    const results = await Promise.allSettled(
      picked.map((e) =>
        assignEmployeeService(e.id, {
          serviceId,
          // Тот же выбор, что в дровере «Услуги сотрудника»: назначаем в
          // активном филиале, а в режиме «все филиалы» — без филиала.
          branchId: activeBranch?.id ?? undefined,
          isActive: true,
        }),
      ),
    );
    setSaving(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    const added = results.length - failed;
    if (added > 0) {
      // Перечитать всё, что знает о связи «услуга ↔ сотрудник»: список
      // исполнителей в карточке, матрицу счётчиков в списке услуг и услуги
      // затронутых сотрудников.
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "service-providers"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "service-assignments"],
      });
      for (const e of picked) {
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.staff.employeeServices(
            e.organizationId ?? null,
            e.id,
          ),
        });
      }
      notify?.({ type: "success", message: t("assignPerformer.added", { count: added }) });
    }
    if (failed > 0) {
      notify?.({ type: "error", message: t("assignPerformer.failed", { count: failed }) });
    }
    if (added > 0) onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("assignPerformer.title")}</DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t("assignPerformer.subtitle", { name: serviceName })}
          </Typography>
          <Autocomplete
            multiple
            loading={isLoading}
            options={options}
            value={picked}
            disableCloseOnSelect
            filterSelectedOptions
            getOptionLabel={optionLabel}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            onChange={(_, v) => setPicked(v ?? [])}
            noOptionsText={t("assignPerformer.noOptions")}
            renderOption={(props, option, { selected }) => {
              const { key, ...rest } = props;
              return (
                <li key={key ?? option.id} {...rest}>
                  <Checkbox size="small" style={{ marginRight: 8 }} checked={selected} />
                  {optionLabel(option)}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                size="small"
                placeholder={t("assignPerformer.placeholder")}
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSave}
          disabled={picked.length === 0 || saving}
        >
          {saving ? t("common.saving") : t("assignPerformer.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default AssignPerformerDialog;
