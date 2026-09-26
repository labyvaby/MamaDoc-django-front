import React from "react";
import { Alert, Box, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Link as RouterLink } from "react-router";

import { getErrorMessage } from "../../api/client";
import { updateProgram, type Program } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getBlankTemplates } from "../../api/registry";
import { getSpecializations } from "../../api/staff";
import { AppButton } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { useCanChecker } from "../../hooks/useCan";
import { subtleBg } from "../../theme/uiHelpers";
import {
  programCardPrefix,
  programInactivityMonths,
  programSpecializationIds,
  programTemplateIds,
} from "../registry/registryConstants";

interface ProgramProductSettingsProps {
  program: Program;
  scope: ActiveScope;
  onSaved: (program: Program) => void;
}

/**
 * Настройки учёта программы: кого закреплять врачом, какие бланки печатать
 * в мастере, префикс номера карты и порог «Не приходили». Что продаётся —
 * пакеты (экран «Пакеты» в «Учёте»). Ключи сохраняются сразу PATCH-ом и не
 * зависят от версий конструктора — публикация их не трогает.
 *
 * Строки здесь без глоссария: экран видит только управляющий.
 */
export const ProgramProductSettings: React.FC<ProgramProductSettingsProps> = ({ program, scope, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const ready = scope.isReady && scope.orgReady;
  const [prefix, setPrefix] = React.useState(programCardPrefix(program));
  const [specializationIds, setSpecializationIds] = React.useState<number[]>(programSpecializationIds(program));
  const [templateIds, setTemplateIds] = React.useState<number[]>(programTemplateIds(program));
  const [inactivity, setInactivity] = React.useState(String(programInactivityMonths(program)));

  React.useEffect(() => {
    setPrefix(programCardPrefix(program));
    setSpecializationIds(programSpecializationIds(program));
    setTemplateIds(programTemplateIds(program));
    setInactivity(String(programInactivityMonths(program)));
  }, [program]);

  const specializations = useQuery({
    queryKey: ["django", "staff", "specializations", scope.organizationId ?? null],
    queryFn: ({ signal }) => getSpecializations(signal),
    enabled: ready,
  });
  const templates = useQuery({
    queryKey: djangoQueryKeys.programs.blankTemplates(scope),
    queryFn: ({ signal }) => getBlankTemplates(scope, signal),
    enabled: ready && can("printforms.view"),
    retry: false,
  });

  const inactivityValue = Number(inactivity);
  const inactivityInvalid = !Number.isInteger(inactivityValue) || inactivityValue < 1 || inactivityValue > 24;

  const save = useMutation({
    mutationFn: () =>
      updateProgram(scope, program.id, {
        settings: {
          ...program.settings,
          cardNumberPrefix: prefix.trim(),
          responsibleSpecializationIds: specializationIds,
          documentTemplateIds: templateIds,
          inactivityMonths: inactivityValue,
        },
      }),
    onSuccess: (saved) => {
      enqueueSnackbar("Настройки учёта сохранены", { variant: "success" });
      onSaved(saved);
    },
  });

  return (
    <Box sx={(theme) => ({ p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: subtleBg(theme) })}>
      <Typography variant="subtitle2">Настройки учёта</Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        Кого закреплять врачом, какие бланки печатать при постановке, номер карты и порог «Не приходили».
      </Typography>
      <Stack gap={1.5}>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
          <TextField
            size="small"
            label="Префикс номера карты"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.slice(0, 16))}
            placeholder="МД-"
          />
          <TextField
            size="small"
            type="number"
            label="Не приходили, мес."
            value={inactivity}
            onChange={(event) => setInactivity(event.target.value)}
            error={inactivityInvalid}
            helperText="Порог вкладки «Не приходили» в «Учёте»"
            inputProps={{ min: 1, max: 24 }}
          />
        </Stack>
        <TextField
          select
          size="small"
          label="Специальности закреплённого врача"
          value={specializationIds}
          onChange={(event) => setSpecializationIds((event.target.value as unknown as number[]).map(Number))}
          SelectProps={{ multiple: true }}
          helperText="Пусто — любой врач"
        >
          {(specializations.data ?? []).filter((s) => s.isActive).map((specialization) => (
            <MenuItem key={specialization.id} value={specialization.id}>
              {specialization.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Бланки для мастера постановки"
          value={templateIds}
          onChange={(event) => setTemplateIds((event.target.value as unknown as number[]).map(Number))}
          SelectProps={{ multiple: true }}
          helperText="Пусто — все бланки организации"
          disabled={!templates.data?.length}
        >
          {(templates.data ?? []).map((template) => (
            <MenuItem key={template.id} value={template.id}>
              {template.name}
            </MenuItem>
          ))}
        </TextField>
        {can("printforms.manage") && (
          <Link component={RouterLink} to="/settings/print-blanks" variant="caption" sx={{ alignSelf: "flex-start" }}>
            Изменить тексты бланков
          </Link>
        )}
        {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        <AppButton
          variant="contained"
          size="small"
          disabled={save.isPending || inactivityInvalid}
          onClick={() => save.mutate()}
          sx={{ alignSelf: "flex-start" }}
        >
          Сохранить настройки
        </AppButton>
      </Stack>
    </Box>
  );
};
