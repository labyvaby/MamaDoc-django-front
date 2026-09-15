import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";

import { getErrorFields } from "../../../api/client";
import {
  connectWhatsApp,
  type WhatsAppConnectInput,
  type WhatsAppSettings,
} from "../../../api/whatsapp";
import { useT } from "../../../i18n/VerticalProvider";

type FieldKey = "wabaId" | "phoneNumberId" | "accessToken" | "appId" | "appSecret";

const FIELDS: FieldKey[] = ["wabaId", "phoneNumberId", "accessToken", "appId", "appSecret"];
const SECRET_FIELDS: ReadonlySet<FieldKey> = new Set(["accessToken", "appSecret"]);

const META_DOCS = "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started";

interface WhatsAppConnectFormProps {
  organizationId: number;
  /** Уже подключено — форма переподключает и говорит об этом словами. */
  reconnect: boolean;
  onConnected: (data: WhatsAppSettings) => void;
  onCancel?: () => void;
}

/**
 * «Подключить WhatsApp»: пять значений из Meta — и всё остальное делает
 * Raven. Токен и App secret вводятся как пароли, через CRM только проходят
 * и после ответа из формы стираются. Отказы Raven приходят по полям
 * (`VALIDATION_ERROR`), поэтому «Meta не приняла токен» встаёт под токен,
 * а «номер уже подключён» — под Phone number ID.
 */
export const WhatsAppConnectForm: React.FC<WhatsAppConnectFormProps> = ({
  organizationId,
  reconnect,
  onConnected,
  onCancel,
}) => {
  const { t } = useT("settings");
  const [values, setValues] = useState<Record<FieldKey, string>>({
    wabaId: "",
    phoneNumberId: "",
    accessToken: "",
    appId: "",
    appSecret: "",
  });
  const [displayName, setDisplayName] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const input: WhatsAppConnectInput = {
        wabaId: values.wabaId.trim(),
        phoneNumberId: values.phoneNumberId.trim(),
        accessToken: values.accessToken.trim(),
        appId: values.appId.trim(),
        appSecret: values.appSecret.trim(),
        displayName: displayName.trim() || undefined,
        organizationId,
      };
      return connectWhatsApp(input);
    },
    onSuccess: (data) => {
      setError(null);
      setFieldErrors({});
      // Секреты своё дело сделали — в состоянии формы им больше не место.
      setValues((prev) => ({ ...prev, accessToken: "", appSecret: "" }));
      onConnected(data);
    },
    onError: (err) => {
      const fields = getErrorFields(err);
      setFieldErrors(fields ?? {});
      setError(fields ? null : err instanceof Error ? err.message : t("whatsapp.connect.error"));
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // Пустые поля ловим до похода на бэк — та же проверка, что и у него.
    const missing = FIELDS.filter((key) => !values[key].trim());
    if (missing.length) {
      const errors: Record<string, string> = {};
      for (const key of missing) errors[key] = t("whatsapp.connect.required");
      setFieldErrors(errors);
      return;
    }
    mutation.mutate();
  };

  return (
    <Box
      component="form"
      onSubmit={submit}
      sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: "action.hover" }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WhatsApp color="success" />
          <Typography variant="subtitle2" fontWeight={700}>
            {reconnect ? t("whatsapp.connect.reconnectTitle") : t("whatsapp.connect.title")}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t("whatsapp.connect.intro")}{" "}
          <Link href={META_DOCS} target="_blank" rel="noreferrer">
            {t("whatsapp.connect.metaDocs")}
          </Link>
        </Typography>
        {reconnect && <Alert severity="info">{t("whatsapp.connect.reconnectHint")}</Alert>}

        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          }}
        >
          <TextField
            size="small"
            label={t("whatsapp.connect.fields.displayName")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            helperText={t("whatsapp.connect.hints.displayName")}
            disabled={mutation.isPending}
            inputProps={{ maxLength: 255 }}
          />
          {FIELDS.map((key) => {
            const secret = SECRET_FIELDS.has(key);
            const shown = reveal[key] ?? false;
            return (
              <TextField
                key={key}
                size="small"
                required
                label={t(`whatsapp.connect.fields.${key}`)}
                value={values[key]}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [key]: e.target.value }));
                  if (fieldErrors[key]) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }
                }}
                error={Boolean(fieldErrors[key])}
                helperText={fieldErrors[key] ?? t(`whatsapp.connect.hints.${key}`)}
                type={secret && !shown ? "password" : "text"}
                autoComplete="off"
                disabled={mutation.isPending}
                inputProps={{ spellCheck: false, autoCapitalize: "off" }}
                InputProps={
                  secret
                    ? {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              aria-label={t("whatsapp.connect.reveal")}
                              onClick={() => setReveal((prev) => ({ ...prev, [key]: !shown }))}
                              edge="end"
                            >
                              {shown ? (
                                <VisibilityOffOutlined fontSize="small" />
                              ) : (
                                <VisibilityOutlined fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }
                    : undefined
                }
              />
            );
          })}
        </Box>

        <Alert severity="info">{t("whatsapp.connect.privacy")}</Alert>
        {error && <Alert severity="error">{error}</Alert>}

        <Stack direction="row" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            size="small"
            startIcon={
              mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <WhatsApp />
            }
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("whatsapp.connect.submitting") : t("whatsapp.connect.submit")}
          </Button>
          {onCancel && (
            <Button size="small" onClick={onCancel} disabled={mutation.isPending}>
              {t("whatsapp.connect.cancel")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};
