import React from "react";
import { Alert, Box, InputAdornment, Stack, TextField, Typography } from "@mui/material";

import type { GeneralReaction, LocalReaction } from "../../api/vaccinations";
import { AppButton } from "../ui";
import { ChoiceChips } from "./ChoiceChips";
import {
  DOSE_ML_OPTIONS,
  GENERAL_REACTION_OPTIONS,
  LOCAL_REACTION_OPTIONS,
  doseInput,
  isStrongReaction,
  parseDoseMl,
} from "./reactionMeta";

const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
    {children}
  </Typography>
);

interface DoseReactionFieldsProps {
  /** Объём дозы, как вводят: «0,5». */
  doseMl: string;
  onDoseMl: (value: string) => void;
  localReaction?: LocalReaction | "";
  onLocalReaction?: (value: LocalReaction | "") => void;
  generalReaction?: GeneralReaction | "";
  onGeneralReaction?: (value: GeneralReaction | "") => void;
  /** Только доза: при оформлении реакцию ещё не видно, её вносят позже. */
  doseOnly?: boolean;
  /** Сильная реакция — кнопка «Медотвод» в подсказке. */
  onExemption?: () => void;
}

/**
 * Карта прививок 112/у: объём дозы (мл), местная и общая реакция. При сильной
 * реакции — подсказка про медотвод и аллергию; сами они не создаются.
 */
export const DoseReactionFields: React.FC<DoseReactionFieldsProps> = ({
  doseMl,
  onDoseMl,
  localReaction = "",
  onLocalReaction,
  generalReaction = "",
  onGeneralReaction,
  doseOnly = false,
  onExemption,
}) => {
  const dose = parseDoseMl(doseMl);
  return (
    <Stack spacing={1.75}>
      <Box>
        <Caption>Доза, мл</Caption>
        <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap">
          <Box sx={{ pt: 0.5 }}>
            <ChoiceChips
              options={DOSE_ML_OPTIONS}
              value={dose.value ?? ""}
              onChange={(value) => onDoseMl(value ? doseInput(value) : "")}
              ariaLabel="Доза, мл"
            />
          </Box>
          <TextField
            size="small"
            placeholder="0,5"
            value={doseMl}
            onChange={(event) => onDoseMl(event.target.value.replace(/[^\d.,]/g, ""))}
            error={dose.error != null}
            helperText={dose.error ?? undefined}
            inputProps={{ inputMode: "decimal", "aria-label": "Доза, мл" }}
            InputProps={{ endAdornment: <InputAdornment position="end">мл</InputAdornment> }}
            sx={{ width: 120 }}
          />
        </Stack>
      </Box>
      {!doseOnly && (
        <>
          <Box>
            <Caption>Местная реакция</Caption>
            <ChoiceChips
              options={LOCAL_REACTION_OPTIONS}
              value={localReaction}
              onChange={(value) => onLocalReaction?.(value)}
              ariaLabel="Местная реакция"
            />
          </Box>
          <Box>
            <Caption>Общая реакция</Caption>
            <ChoiceChips
              options={GENERAL_REACTION_OPTIONS}
              value={generalReaction}
              onChange={(value) => onGeneralReaction?.(value)}
              ariaLabel="Общая реакция"
            />
          </Box>
          {isStrongReaction(localReaction, generalReaction) && (
            <Alert
              severity="warning"
              action={
                onExemption && (
                  <AppButton size="small" color="inherit" onClick={onExemption}>
                    Медотвод
                  </AppButton>
                )
              }
            >
              Сильная реакция: по решению врача оформите медотвод на эту вакцину и отметьте
              аллергию в карточке пациента — сами они не создаются.
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
};
