import React from "react";
import { Alert, Box, IconButton, InputAdornment, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Link as RouterLink } from "react-router";

import { getErrorMessage } from "../../api/client";
import { updateProgram, type Program } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getBlankTemplates } from "../../api/registry";
import { AppButton } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { useCanChecker } from "../../hooks/useCan";
import { subtleBg } from "../../theme/uiHelpers";
import {
  programCardPrefix,
  programCardStart,
  programContractTemplateId,
  programInactivityMonths,
  programTemplateIds,
} from "../registry/registryConstants";

const CARD_START_MAX = 1_000_000_000;
const INACTIVITY_MIN = 1;
const INACTIVITY_MAX = 24;

/** «− 6 +»: число по центру, кнопки по бокам. */
const MonthsStepper: React.FC<{ value: string; onChange: (value: string) => void; invalid: boolean }> = ({
  value,
  onChange,
  invalid,
}) => {
  const step = (delta: number) => {
    const current = Number(value) || INACTIVITY_MIN;
    onChange(String(Math.min(INACTIVITY_MAX, Math.max(INACTIVITY_MIN, current + delta))));
  };
  return (
    <TextField
      size="small"
      label="Не приходили, мес."
      value={value}
      onChange={(event) => {
        if (/^\d{0,2}$/.test(event.target.value)) onChange(event.target.value);
      }}
      error={invalid}
      helperText={invalid ? `От ${INACTIVITY_MIN} до ${INACTIVITY_MAX} мес.` : "Кого позвать на приём — вкладка «Не приходили»"}
      inputProps={{ inputMode: "numeric", style: { textAlign: "center" } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <IconButton size="small" edge="start" aria-label="Меньше" onClick={() => step(-1)}>
              <RemoveOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" edge="end" aria-label="Больше" onClick={() => step(1)}>
              <AddOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

interface ProgramProductSettingsProps {
  program: Program;
  scope: ActiveScope;
  onSaved: (program: Program) => void;
}

/**
 * Настройки учёта программы: номер карты, бланки и договор при постановке на
 * учёт, порог вкладки «Не приходили». Что продаётся — пакеты (экран «Пакеты»
 * в «Учёте»). Ключи сохраняются сразу PATCH-ом и не зависят от версий
 * конструктора — публикация их не трогает. Закреплённый врач — всегда
 * педиатр, поэтому выбора специальностей здесь больше нет.
 *
 * Строки здесь без глоссария: экран видит только управляющий.
 */
export const ProgramProductSettings: React.FC<ProgramProductSettingsProps> = ({ program, scope, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const ready = scope.isReady && scope.orgReady;
  const [prefix, setPrefix] = React.useState(programCardPrefix(program));
  const [templateIds, setTemplateIds] = React.useState<number[]>(programTemplateIds(program));
  const [inactivity, setInactivity] = React.useState(String(programInactivityMonths(program)));
  const [cardStart, setCardStart] = React.useState(String(programCardStart(program)));
  const [contractId, setContractId] = React.useState<number | "">(programContractTemplateId(program) ?? "");

  React.useEffect(() => {
    setPrefix(programCardPrefix(program));
    setTemplateIds(programTemplateIds(program));
    setInactivity(String(programInactivityMonths(program)));
    setCardStart(String(programCardStart(program)));
    setContractId(programContractTemplateId(program) ?? "");
  }, [program]);

  const templates = useQuery({
    queryKey: djangoQueryKeys.programs.blankTemplates(scope),
    queryFn: ({ signal }) => getBlankTemplates(scope, signal),
    enabled: ready && can("printforms.view"),
    retry: false,
  });

  const inactivityValue = Number(inactivity);
  const inactivityInvalid =
    !Number.isInteger(inactivityValue) || inactivityValue < INACTIVITY_MIN || inactivityValue > INACTIVITY_MAX;
  const cardStartValue = Number(cardStart);
  const cardStartInvalid =
    !Number.isInteger(cardStartValue) || cardStartValue < 1 || cardStartValue > CARD_START_MAX;
  const templateOptions = templates.data ?? [];
  const templateName = (id: number) => templateOptions.find((template) => template.id === id)?.name ?? `Бланк №${id}`;

  const save = useMutation({
    mutationFn: () =>
      updateProgram(scope, program.id, {
        settings: {
          ...program.settings,
          cardNumberPrefix: prefix.trim(),
          cardNumberStart: cardStartValue,
          contractTemplateId: contractId === "" ? null : contractId,
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
        Номер карты, бланки и договор при постановке на учёт, порог вкладки «Не приходили». Врачом закрепляется педиатр.
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          alignItems: "start",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 280px))", md: "repeat(3, minmax(0, 280px))" },
        }}
      >
        <TextField
          size="small"
          label="Префикс номера карты"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value.slice(0, 16))}
          placeholder="МД-"
          helperText="Например, «МД-» → МД-1101"
        />
        <TextField
          size="small"
          label="Номер карты начинается с"
          value={cardStart}
          onChange={(event) => {
            if (/^\d{0,10}$/.test(event.target.value)) setCardStart(event.target.value);
          }}
          error={cardStartInvalid}
          helperText="Новые карты — не меньше этого номера"
          inputProps={{ inputMode: "numeric" }}
        />
        <MonthsStepper value={inactivity} onChange={setInactivity} invalid={inactivityInvalid} />
        <TextField
          select
          size="small"
          label="Договор"
          value={contractId}
          onChange={(event) => setContractId(event.target.value === "" ? "" : Number(event.target.value))}
          helperText="Печатается перед оплатой; без отметки «Договор подписан» на учёт не поставить"
          disabled={!templateOptions.length}
        >
          <MenuItem value="">Без договора</MenuItem>
          {contractId !== "" && !templateOptions.some((template) => template.id === contractId) && (
            <MenuItem value={contractId}>Бланк №{contractId}</MenuItem>
          )}
          {templateOptions.map((template) => (
            <MenuItem key={template.id} value={template.id}>
              {template.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Бланки при постановке на учёт"
          value={templateIds}
          onChange={(event) => setTemplateIds((event.target.value as unknown as number[]).map(Number))}
          SelectProps={{
            multiple: true,
            displayEmpty: true,
            renderValue: (selected) => {
              const ids = selected as number[];
              if (!ids.length) return "Все бланки";
              return ids.length === 1 ? templateName(ids[0]) : `Выбрано: ${ids.length}`;
            },
          }}
          InputLabelProps={{ shrink: true }}
          helperText="Что можно распечатать в окне «Поставить на учёт»"
          disabled={!templateOptions.length}
        >
          {templateOptions.map((template) => (
            <MenuItem key={template.id} value={template.id}>
              {template.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Stack gap={1.5} sx={{ mt: 1.5 }}>
        {can("printforms.manage") && (
          <Link component={RouterLink} to="/settings/print-blanks" variant="caption" sx={{ alignSelf: "flex-start" }}>
            Изменить тексты бланков
          </Link>
        )}
        {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        <AppButton
          variant="contained"
          size="small"
          disabled={save.isPending || inactivityInvalid || cardStartInvalid}
          onClick={() => save.mutate()}
          sx={{ alignSelf: "flex-start" }}
        >
          Сохранить настройки
        </AppButton>
      </Stack>
    </Box>
  );
};
