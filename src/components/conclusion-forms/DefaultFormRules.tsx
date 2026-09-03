/**
 * Секция «Бланк по умолчанию» в настройках бланков заключений.
 *
 * Правило отвечает на один вопрос: какой бланк раскроется врачу, когда он
 * откроет НОВОЕ заключение по этой услуге. Задаётся парой «филиал × услуга»,
 * обе части можно оставить общими («Все филиалы», «Любая услуга»).
 *
 * Ключ — услуга, а не специализация врача: заключение привязано к строке
 * услуги, и специализацию существующему сотруднику всё равно не назначить
 * (PATCH сотрудника её игнорирует — см. api/conclusionFormDefaults).
 *
 * Правила применяются от точного к общему (см. resolveDefaultFormId), поэтому
 * порядок в списке — порядок добавления, а не приоритет: правило по услуге
 * победит общее, даже если стоит ниже. Чтобы это не приходилось угадывать,
 * каждая строка подписана уровнем действия.
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";

import type { RbacBranch } from "../../api/auth";
import type { Service } from "../../api/catalog";
import type { ConclusionFormTemplate } from "../../api/conclusionForms";
import type { ConclusionFormDefaultRule } from "../../api/conclusionFormDefaults";

/** Значение «любой» в Select: пустая строка, MUI не умеет null как value. */
const ANY = "";

type Props = {
  forms: ConclusionFormTemplate[];
  services: Service[];
  branches: RbacBranch[];
  rules: ConclusionFormDefaultRule[];
  /** Правку гейтит organization.update — правила лежат в themeConfig. */
  canEdit: boolean;
  saving: boolean;
  error: string | null;
  onChange: (next: ConclusionFormDefaultRule[]) => void;
};

export const DefaultFormRules: React.FC<Props> = ({
  forms,
  services,
  branches,
  rules,
  canEdit,
  saving,
  error,
  onChange,
}) => {
  const [branchId, setBranchId] = React.useState<number | "">(ANY);
  const [service, setService] = React.useState<Service | null>(null);
  const [formId, setFormId] = React.useState<number | "">(ANY);

  const formName = (id: number) => forms.find((f) => f.id === id)?.name ?? `#${id}`;
  const serviceName = (id: number) => services.find((s) => s.id === id)?.name ?? `#${id}`;
  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `#${id}`;

  /** Бланк, удалённый или выключенный после записи правила: молчать нельзя. */
  const isStale = (rule: ConclusionFormDefaultRule) =>
    !forms.some((form) => form.id === rule.formId && form.isActive);

  const handleAdd = () => {
    if (formId === ANY) return;
    const next: ConclusionFormDefaultRule = {
      branchId: branchId === ANY ? null : branchId,
      serviceId: service?.id ?? null,
      formId,
    };
    // Пара «филиал + услуга» уникальна: два бланка на одну пару означали бы,
    // что подставляемый зависит от порядка записи. Повторный выбор той же пары
    // — замена бланка, а не второе правило.
    onChange([
      ...rules.filter(
        (rule) => rule.branchId !== next.branchId || rule.serviceId !== next.serviceId,
      ),
      next,
    ]);
    setFormId(ANY);
    setService(null);
  };

  const handleRemove = (rule: ConclusionFormDefaultRule) =>
    onChange(
      rules.filter(
        (item) => item.branchId !== rule.branchId || item.serviceId !== rule.serviceId,
      ),
    );

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="subtitle2" fontWeight={600}>
          Бланк по умолчанию
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Подставляется сразу при создании нового заключения — врачу не нужно
          выбирать бланк вручную. Правило по услуге важнее общего.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {forms.length === 0 ? (
        <Alert severity="info">Сначала соберите хотя бы один бланк.</Alert>
      ) : (
        <>
          {rules.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              Правил нет: врач выбирает бланк сам.
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {rules.map((rule) => (
                <Stack
                  key={`${rule.branchId ?? "any"}:${rule.serviceId ?? "any"}`}
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {formName(rule.formId)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {rule.serviceId == null ? "любая услуга" : serviceName(rule.serviceId)}
                      {" · "}
                      {rule.branchId == null ? "все филиалы" : branchName(rule.branchId)}
                    </Typography>
                  </Box>

                  {isStale(rule) && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label="бланк недоступен"
                    />
                  )}

                  {canEdit && (
                    <Tooltip title="Убрать правило">
                      <IconButton
                        size="small"
                        disabled={saving}
                        onClick={() => handleRemove(rule)}
                      >
                        <DeleteOutline fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </Stack>
          )}

          {canEdit && (
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              {/* Услуг в прайсе сотни — выбор с поиском, а не выпадающий список. */}
              <Autocomplete
                size="small"
                options={services}
                value={service}
                onChange={(_, next) => setService(next)}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                sx={{ minWidth: 240 }}
                renderInput={(params) => (
                  <TextField {...params} label="Услуга" placeholder="Любая" />
                )}
              />

              <TextField
                select
                size="small"
                label="Филиал"
                value={branchId}
                onChange={(e) =>
                  setBranchId(e.target.value === ANY ? ANY : Number(e.target.value))
                }
                sx={{ minWidth: 180 }}
              >
                <MenuItem value={ANY}>Все филиалы</MenuItem>
                {branches.map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Бланк"
                value={formId}
                onChange={(e) => setFormId(e.target.value === ANY ? ANY : Number(e.target.value))}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value={ANY} disabled>
                  Выберите бланк
                </MenuItem>
                {forms.map((form) => (
                  <MenuItem key={form.id} value={form.id}>
                    {form.name}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                size="small"
                startIcon={<AddOutlined />}
                disabled={formId === ANY || saving}
                onClick={handleAdd}
              >
                Добавить
              </Button>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
};

export default DefaultFormRules;
