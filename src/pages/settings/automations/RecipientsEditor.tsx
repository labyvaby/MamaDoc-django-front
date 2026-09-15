import React, { useMemo } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  FormHelperText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcCallOutlined from "@mui/icons-material/AddIcCallOutlined";
import ContactPhoneOutlined from "@mui/icons-material/ContactPhoneOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import PhoneDisabledOutlined from "@mui/icons-material/PhoneDisabledOutlined";

import {
  variableLabel,
  type AutomationCatalogEvent,
  type AutomationRecipientEmployee,
  type AutomationRecipientOptions,
  type AutomationRecipientRole,
} from "../../../api/automations";
import { useT } from "../../../i18n/VerticalProvider";
import { PhonePayloadInput } from "./PhonePayloadInput";
import { phoneVariables, type ActionForm } from "./automationForm";

export interface RecipientsEditorProps {
  action: ActionForm;
  event: AutomationCatalogEvent | undefined;
  /** Правило по расписанию: данных события нет, переменные-получатели не предлагаем. */
  scheduled: boolean;
  options: AutomationRecipientOptions;
  errors: Record<string, string> | undefined;
  onChange: (patch: Partial<ActionForm>) => void;
  disabled?: boolean;
}

/**
 * «Кому отправить» одного действия.
 *
 * Четыре источника адресатов, каждый своим контролом: телефонные переменные
 * события (клиент, сотрудник записи) — чипами-переключателями, конкретные
 * сотрудники и роли — множественным выбором из справочника организации,
 * плюс фиксированный номер. Бэк создаёт по одной отправке на каждого, дубли
 * по номеру схлопывает.
 */
export const RecipientsEditor: React.FC<RecipientsEditorProps> = ({
  action,
  event,
  scheduled,
  options,
  errors,
  onChange,
  disabled = false,
}) => {
  const { t } = useT("settings");
  const phones = scheduled ? [] : phoneVariables(event);

  const employeeById = useMemo(
    () => new Map(options.employees.map((item) => [item.id, item])),
    [options.employees],
  );
  const roleById = useMemo(
    () => new Map(options.roles.map((item) => [item.id, item])),
    [options.roles],
  );
  // Сохранённый id, которого больше нет в справочнике (уволен, роль
  // удалена), всё равно показываем — иначе он молча пропал бы из правила
  // при следующем сохранении.
  const selectedEmployees = useMemo<AutomationRecipientEmployee[]>(
    () =>
      action.recipientEmployeeIds.map(
        (id) =>
          employeeById.get(id) ?? {
            id,
            name: t("automations.recipients.unknownEmployee", { id }),
            hasPhone: false,
          },
      ),
    [action.recipientEmployeeIds, employeeById, t],
  );
  const selectedRoles = useMemo<AutomationRecipientRole[]>(
    () =>
      action.recipientRoleIds.map(
        (id) =>
          roleById.get(id) ?? {
            id,
            name: t("automations.recipients.unknownRole", { id }),
          },
      ),
    [action.recipientRoleIds, roleById, t],
  );

  const toggleField = (variable: string) => {
    const has = action.recipientFields.includes(variable);
    onChange({
      recipientFields: has
        ? action.recipientFields.filter((item) => item !== variable)
        : [...action.recipientFields, variable],
    });
  };

  const withoutPhone = selectedEmployees.filter((item) => !item.hasPhone);

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          {t("automations.recipients.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {t("automations.recipients.hint")}
        </Typography>
      </Box>

      {phones.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.25,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  flexShrink: 0,
                }}
              >
                <ContactPhoneOutlined fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle2">
                  {t("automations.recipients.recordTitle")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("automations.recipients.recordHint")}
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {phones.map((variable) => {
                const selected = action.recipientFields.includes(variable);
                return (
                  <Chip
                    key={variable}
                    label={variableLabel(event, variable)}
                    color={selected ? "primary" : "default"}
                    variant={selected ? "filled" : "outlined"}
                    onClick={() => toggleField(variable)}
                    disabled={disabled}
                    aria-pressed={selected}
                    sx={{ cursor: "pointer", fontWeight: 600 }}
                  />
                );
              })}
            </Box>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.25,
                display: "grid",
                placeItems: "center",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                flexShrink: 0,
              }}
            >
              <GroupsOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2">
                {t("automations.recipients.staffTitle")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("automations.recipients.staffHint")}
              </Typography>
            </Box>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <Autocomplete
              multiple
              size="small"
              options={options.employees}
              value={selectedEmployees}
              onChange={(_, next) =>
                onChange({ recipientEmployeeIds: next.map((item) => item.id) })
              }
              getOptionLabel={(item) => item.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={disabled}
              disableCloseOnSelect
              noOptionsText={t("automations.recipients.noEmployees")}
              renderOption={(props, item) => (
                <li {...props} key={item.id}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {!item.hasPhone && (
                      <Tooltip title={t("automations.recipients.noPhone")}>
                        <PhoneDisabledOutlined fontSize="small" color="disabled" />
                      </Tooltip>
                    )}
                  </Stack>
                </li>
              )}
              renderTags={(value, getTagProps) =>
                value.map((item, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={item.id}
                    size="small"
                    label={item.name}
                    color={item.hasPhone ? "default" : "warning"}
                    variant="outlined"
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t("automations.recipients.employeesLabel")}
                  placeholder={
                    selectedEmployees.length === 0
                      ? t("automations.recipients.employeesPlaceholder")
                      : undefined
                  }
                />
              )}
              sx={{ flex: 1, minWidth: 0 }}
            />

            <Autocomplete
              multiple
              size="small"
              options={options.roles}
              value={selectedRoles}
              onChange={(_, next) => onChange({ recipientRoleIds: next.map((item) => item.id) })}
              getOptionLabel={(item) => item.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={disabled}
              disableCloseOnSelect
              noOptionsText={t("automations.recipients.noRoles")}
              renderTags={(value, getTagProps) =>
                value.map((item, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={item.id}
                    size="small"
                    label={item.name}
                    variant="outlined"
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t("automations.recipients.rolesLabel")}
                  placeholder={
                    selectedRoles.length === 0
                      ? t("automations.recipients.rolesPlaceholder")
                      : undefined
                  }
                />
              )}
              sx={{ flex: 1, minWidth: 0 }}
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {t(
              scheduled
                ? "automations.recipients.rolesHintSchedule"
                : "automations.recipients.rolesHint",
            )}
          </Typography>
        </Stack>
      </Paper>

      {/* Номер вводится тем же полем, что и в карточке пациента: код
          страны, маска, проверка длины. */}
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.25,
                display: "grid",
                placeItems: "center",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                flexShrink: 0,
              }}
            >
              <AddIcCallOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2">
                {t("automations.recipients.otherTitle")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("automations.recipients.otherHint")}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ maxWidth: { md: 360 } }}>
            <PhonePayloadInput
              label={t("automations.recipients.phoneLabel")}
              helperText={errors?.recipientPhone}
              value={action.recipientPhone}
              onChange={(phone) => onChange({ recipientPhone: phone })}
              disabled={disabled}
            />
          </Box>
        </Stack>
      </Paper>

      {withoutPhone.length > 0 && (
        <FormHelperText sx={{ color: "warning.main", mx: 0 }}>
          {t("automations.recipients.selectedWithoutPhone", {
            names: withoutPhone.map((item) => item.name).join(", "),
          })}
        </FormHelperText>
      )}
      {errors?.recipients && (
        <FormHelperText error sx={{ mx: 0 }}>
          {errors.recipients}
        </FormHelperText>
      )}
    </Stack>
  );
};

export default RecipientsEditor;
