import React, { useMemo } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  FormHelperText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
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
    <Stack spacing={1.25}>
      <Typography variant="subtitle2">{t("automations.recipients.title")}</Typography>

      {phones.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
          {phones.map((variable) => {
            const selected = action.recipientFields.includes(variable);
            return (
              <Chip
                key={variable}
                size="small"
                label={variableLabel(event, variable)}
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                onClick={() => toggleField(variable)}
                disabled={disabled}
                sx={{ cursor: "pointer" }}
              />
            );
          })}
        </Box>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <Autocomplete
          multiple
          size="small"
          options={options.employees}
          value={selectedEmployees}
          onChange={(_, next) => onChange({ recipientEmployeeIds: next.map((item) => item.id) })}
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
          sx={{ flex: 1, minWidth: 240 }}
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
              // Роль раздаётся сотрудникам филиала, где сработало правило;
              // без конкретного филиала — всем держателям роли в организации.
              helperText={t(
                scheduled
                  ? "automations.recipients.rolesHintSchedule"
                  : "automations.recipients.rolesHint",
              )}
            />
          )}
          sx={{ flex: 1, minWidth: 240 }}
        />
      </Stack>

      {/* Номер вводится тем же полем, что и в карточке пациента: код
          страны, маска, проверка длины. */}
      <Box sx={{ maxWidth: { md: 360 } }}>
        <PhonePayloadInput
          label={t("automations.action.phoneLabel")}
          helperText={errors?.recipientPhone ?? t("automations.action.phoneHint")}
          value={action.recipientPhone}
          onChange={(phone) => onChange({ recipientPhone: phone })}
          disabled={disabled}
        />
      </Box>

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
