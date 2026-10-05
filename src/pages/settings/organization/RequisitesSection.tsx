import React from "react";
import { Alert, Box, FormLabel, Stack, TextField, Typography } from "@mui/material";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";

import { updateOrganization, type DjangoOrganization, type OrganizationRequisites } from "../../../api/organization";
import { parseBackendError } from "../../../api/appointments";
import { AppButton } from "../../../components/ui/AppButton";
import { useT } from "../../../i18n/VerticalProvider";
import { changedRequisites, REQUISITE_FIELDS, requisitesErrors } from "./requisitesForm";

interface Props {
  organization: DjangoOrganization;
  canUpdate: boolean;
  onSaved: (organization: DjangoOrganization) => void;
}

/** Реквизиты организации — шапка «Формы №2» в отчёте «Прибыли и убытки». */
export function RequisitesSection({ organization, canUpdate, onSaved }: Props) {
  const { t } = useT("settings");
  const [values, setValues] = React.useState<OrganizationRequisites>(organization.requisites);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => setValues(organization.requisites), [organization.requisites]);

  const errors = requisitesErrors(values);
  const changes = changedRequisites(organization.requisites, values);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await updateOrganization(organization.id, { requisites: changes }));
      setSaved(true);
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" gap={1} alignItems="center">
        <ReceiptLongOutlined fontSize="small" color="action" />
        <FormLabel sx={{ fontWeight: 600 }}>{t("organization.requisites.title")}</FormLabel>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {t("organization.requisites.caption")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        {REQUISITE_FIELDS.map(({ field, half }) => (
          <TextField
            key={field}
            size="small"
            label={t(`organization.requisites.fields.${field}`)}
            value={values[field]}
            disabled={!canUpdate || busy}
            error={Boolean(errors[field])}
            helperText={errors[field]}
            onChange={(e) => {
              setSaved(false);
              setValues((prev) => ({ ...prev, [field]: e.target.value }));
            }}
            sx={{ gridColumn: half ? undefined : "1 / -1" }}
          />
        ))}
      </Box>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {saved && <Alert severity="success" onClose={() => setSaved(false)}>{t("organization.requisites.saved")}</Alert>}
      {canUpdate && (
        <Box>
          <AppButton
            variant="outlined"
            onClick={() => void save()}
            disabled={!dirty || Object.keys(errors).length > 0}
            loading={busy}
            sx={{ width: { xs: "100%", sm: "auto" }, minHeight: { xs: 48, sm: 36 } }}
          >
            {t("organization.requisites.save")}
          </AppButton>
        </Box>
      )}
    </Stack>
  );
}
