import React from "react";
import {
  Alert,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import type { Relation } from "../../../../api/registry";
import { AppButton } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useT } from "../../../../i18n/VerticalProvider";
import {
  newRepresentative,
  withRelation,
  type RepresentativeState,
  type StepErrors,
} from "../intakeState";
import { RELATIONS } from "../../registryConstants";
import { PersonSearch } from "../PersonSearch";

interface RepresentativeCardProps {
  scope: ActiveScope;
  value: RepresentativeState;
  error?: string;
  canRemove: boolean;
  excludeIds: number[];
  onChange: (next: RepresentativeState) => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}

/** Одна карточка представителя: найти или создать, роль и флаги. */
export const RepresentativeCard: React.FC<RepresentativeCardProps> = ({
  scope,
  value,
  error,
  canRemove,
  excludeIds,
  onChange,
  onMakePrimary,
  onRemove,
}) => {
  const { t } = useT("registry");
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack gap={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={value.mode}
            onChange={(_, mode: RepresentativeState["mode"] | null) => mode && onChange({ ...value, mode })}
          >
            <ToggleButton value="new">{t("wizard.representatives.new")}</ToggleButton>
            <ToggleButton value="existing">{t("wizard.representatives.existing")}</ToggleButton>
          </ToggleButtonGroup>
          {canRemove && (
            <Tooltip title={t("wizard.representatives.remove")}>
              <IconButton size="small" onClick={onRemove} aria-label={t("wizard.representatives.remove")}>
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        {value.mode === "existing" ? (
          <PersonSearch
            scope={scope}
            label={t("wizard.representatives.search")}
            value={value.existing}
            excludeIds={excludeIds}
            error={error}
            onChange={(person) => onChange({ ...value, existing: person })}
          />
        ) : (
          <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
            <TextField
              size="small"
              fullWidth
              label={t("wizard.representatives.fullName")}
              value={value.fullName}
              onChange={(e) => onChange({ ...value, fullName: e.target.value })}
              error={Boolean(error) && !value.fullName.trim()}
            />
            <TextField
              size="small"
              fullWidth
              label={t("wizard.representatives.phone")}
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
              error={Boolean(error)}
              helperText={error}
              inputProps={{ inputMode: "tel" }}
            />
          </Stack>
        )}
        <TextField
          select
          size="small"
          label={t("wizard.representatives.relation")}
          value={value.relation}
          onChange={(e) => onChange(withRelation(value, e.target.value as Relation))}
          sx={{ maxWidth: 240 }}
        >
          {RELATIONS.map((relation) => (
            <MenuItem key={relation} value={relation}>
              {t(`relations.${relation}`)}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" flexWrap="wrap" columnGap={2}>
          <FormControlLabel
            control={<Radio checked={value.isPrimaryContact} onChange={onMakePrimary} />}
            label={t("wizard.representatives.primary")}
          />
          <FormControlLabel
            control={
              <Switch
                checked={value.isLegalRepresentative}
                onChange={(_, checked) => onChange({ ...value, isLegalRepresentative: checked })}
              />
            }
            label={t("wizard.representatives.legal")}
          />
          <FormControlLabel
            control={
              <Switch
                checked={value.receivesNotifications}
                onChange={(_, checked) => onChange({ ...value, receivesNotifications: checked })}
              />
            }
            label={t("wizard.representatives.notify")}
          />
          <FormControlLabel
            control={
              <Switch checked={value.joinFamily} onChange={(_, checked) => onChange({ ...value, joinFamily: checked })} />
            }
            label={t("wizard.representatives.joinFamily")}
          />
        </Stack>
      </Stack>
    </Paper>
  );
};

interface RepresentativesStepProps {
  scope: ActiveScope;
  value: RepresentativeState[];
  errors: StepErrors;
  childId: number | null;
  onChange: (next: RepresentativeState[]) => void;
}

export const RepresentativesStep: React.FC<RepresentativesStepProps> = ({ scope, value, errors, childId, onChange }) => {
  const { t } = useT("registry");
  const update = (key: string, next: RepresentativeState) =>
    onChange(value.map((rep) => (rep.key === key ? next : rep)));
  const makePrimary = (key: string) =>
    onChange(value.map((rep) => ({ ...rep, isPrimaryContact: rep.key === key })));
  const taken = value.flatMap((rep) => (rep.existing ? [rep.existing.id] : []));
  const excludeIds = childId != null ? [childId, ...taken] : taken;

  return (
    <Stack gap={1.5}>
      {value.map((rep) => (
        <RepresentativeCard
          key={rep.key}
          scope={scope}
          value={rep}
          error={errors[rep.key] ? t(errors[rep.key]) : undefined}
          canRemove={value.length > 1}
          excludeIds={excludeIds}
          onChange={(next) => update(rep.key, next)}
          onMakePrimary={() => makePrimary(rep.key)}
          onRemove={() => onChange(value.filter((item) => item.key !== rep.key))}
        />
      ))}
      <AppButton
        variant="outlined"
        startIcon={<AddOutlined />}
        onClick={() => onChange([...value, newRepresentative({ relation: "father", isPrimaryContact: false })])}
        sx={{ alignSelf: "flex-start" }}
      >
        {t("wizard.representatives.add")}
      </AppButton>
      {errors.representatives && <Alert severity="warning">{t(errors.representatives)}</Alert>}
    </Stack>
  );
};
