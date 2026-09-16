import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import LockOutlined from "@mui/icons-material/LockOutlined";
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

const REQUIRED_FIELDS: FieldKey[] = ["wabaId", "phoneNumberId", "accessToken"];
const SECRET_FIELDS: ReadonlySet<FieldKey> = new Set(["accessToken", "appSecret"]);

const META_DOCS = "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started";

/**
 * Секреты прячем CSS-маской, а не `type="password"`: поле пароля будит
 * менеджер паролей браузера, и он подставляет сохранённый логин в соседнее
 * текстовое поле — так Phone number ID превращался в e-mail. Где маска не
 * поддерживается (Firefox), остаётся `password` с `new-password`.
 */
const CSS_MASK_SUPPORTED =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("-webkit-text-security", "disc");

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

interface WhatsAppConnectFormProps {
  organizationId: number;
  /** Уже подключено — форма переподключает и говорит об этом словами. */
  reconnect: boolean;
  onConnected: (data: WhatsAppSettings) => void;
  onCancel?: () => void;
}

/**
 * «Подключить WhatsApp»: три значения из Meta — и всё остальное делает
 * Raven. Поля собраны в три шага по тому, где их брать в Meta (аккаунт и
 * номер, приложение, подпись). Пара App ID + App secret необязательна:
 * без неё Raven'у некуда прописать вебхук, сообщения уходят, а статусы
 * доставки нет — форма говорит об этом словами, а не звёздочкой. Токен и
 * App secret через CRM только проходят и после ответа из формы стираются.
 * Отказы Raven приходят по полям (`VALIDATION_ERROR`), поэтому «Meta не
 * приняла токен» встаёт под токен, а «номер уже подключён» — под Phone
 * number ID.
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
        displayName: displayName.trim() || undefined,
        organizationId,
      };
      if (values.appId.trim()) {
        input.appId = values.appId.trim();
        input.appSecret = values.appSecret.trim();
      }
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
    // Пустые поля и половину пары ловим до похода на бэк — те же проверки,
    // что и у него.
    const errors: Record<string, string> = {};
    for (const key of REQUIRED_FIELDS) {
      if (!values[key].trim()) errors[key] = t("whatsapp.connect.required");
    }
    const hasAppId = Boolean(values.appId.trim());
    const hasAppSecret = Boolean(values.appSecret.trim());
    if (hasAppId !== hasAppSecret) {
      errors[hasAppId ? "appSecret" : "appId"] = t("whatsapp.connect.appPair");
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    mutation.mutate();
  };

  const field = (key: FieldKey) => {
    const secret = SECRET_FIELDS.has(key);
    const masked = secret && !(reveal[key] ?? false);
    // `-webkit-text-security` — нестандартное свойство, в типах CSS его нет.
    const inputStyle: React.CSSProperties & { WebkitTextSecurity?: "disc" } = {
      fontFamily: MONO,
      fontSize: 13.5,
    };
    if (masked && CSS_MASK_SUPPORTED) inputStyle.WebkitTextSecurity = "disc";
    return (
      <TextField
        key={key}
        size="small"
        required={REQUIRED_FIELDS.includes(key)}
        fullWidth
        name={`meta-${key}`}
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
        type={masked && !CSS_MASK_SUPPORTED ? "password" : "text"}
        autoComplete={secret ? "new-password" : "off"}
        disabled={mutation.isPending}
        inputProps={{
          spellCheck: false,
          autoCapitalize: "off",
          autoCorrect: "off",
          "data-lpignore": "true",
          "data-1p-ignore": "true",
          "data-bwignore": "true",
          style: inputStyle,
        }}
        InputProps={
          secret
            ? {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={t("whatsapp.connect.reveal")}
                      onClick={() => setReveal((prev) => ({ ...prev, [key]: masked }))}
                      edge="end"
                    >
                      {masked ? (
                        <VisibilityOutlined fontSize="small" />
                      ) : (
                        <VisibilityOffOutlined fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }
            : undefined
        }
      />
    );
  };

  const body = (
    <Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary">
        {t("whatsapp.connect.intro")}{" "}
        <Link href={META_DOCS} target="_blank" rel="noreferrer">
          {t("whatsapp.connect.metaDocs")}
        </Link>
      </Typography>
      {reconnect && <Alert severity="info">{t("whatsapp.connect.reconnectHint")}</Alert>}

      <Step
        n={1}
        title={t("whatsapp.connect.steps.account.title")}
        where={t("whatsapp.connect.steps.account.where")}
      >
        <FieldRow>
          {field("wabaId")}
          {field("phoneNumberId")}
        </FieldRow>
        {field("accessToken")}
      </Step>

      <Step
        n={2}
        title={t("whatsapp.connect.steps.app.title")}
        where={t("whatsapp.connect.steps.app.where")}
        note={t("whatsapp.connect.steps.app.note")}
      >
        <FieldRow>
          {field("appId")}
          {field("appSecret")}
        </FieldRow>
      </Step>

      <Step
        n={3}
        title={t("whatsapp.connect.steps.name.title")}
        where={t("whatsapp.connect.steps.name.where")}
      >
        <TextField
          size="small"
          fullWidth
          name="meta-displayName"
          label={t("whatsapp.connect.fields.displayName")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          helperText={t("whatsapp.connect.hints.displayName")}
          disabled={mutation.isPending}
          autoComplete="off"
          inputProps={{ maxLength: 255 }}
          sx={{ maxWidth: { md: "calc(50% - 6px)" } }}
        />
      </Step>

      {error && <Alert severity="error">{error}</Alert>}

      <Divider />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
          <LockOutlined sx={{ fontSize: 18 }} />
          <Typography variant="caption">{t("whatsapp.connect.privacy")}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexShrink: 0 }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={mutation.isPending}>
              {t("whatsapp.connect.cancel")}
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            startIcon={
              mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <WhatsApp />
            }
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("whatsapp.connect.submitting") : t("whatsapp.connect.submit")}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );

  // Первое подключение живёт прямо в карточке «Подключение» — заголовок у
  // неё уже есть. Переподключение раскрывается под кнопкой, поэтому получает
  // свой заголовок и подложку.
  if (!reconnect) {
    return (
      <Box component="form" noValidate onSubmit={submit} sx={{ pt: 0.5 }}>
        {body}
      </Box>
    );
  }
  return (
    <Box
      component="form"
      noValidate
      onSubmit={submit}
      sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: "action.hover" }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WhatsApp color="success" />
          <Typography variant="subtitle2" fontWeight={700}>
            {t("whatsapp.connect.reconnectTitle")}
          </Typography>
        </Stack>
        {body}
      </Stack>
    </Box>
  );
};

// ── Раскладка ────────────────────────────────────────────────────────────────

interface StepProps {
  n: number;
  title: string;
  /** Где это лежит в Meta — путь по меню, одной строкой. */
  where: string;
  /** Зачем это нужно и что будет без него — для необязательного шага. */
  note?: string;
  children: React.ReactNode;
}

/** Шаг формы: на широком экране номер и «где взять» слева, поля справа; иначе столбиком. */
const Step: React.FC<StepProps> = ({ n, title, where, note, children }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", lg: "minmax(200px, 240px) 1fr" },
      columnGap: 3,
      rowGap: 1.5,
      alignItems: "start",
    }}
  >
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box
        sx={{
          width: 24,
          height: 24,
          mt: "1px",
          borderRadius: "50%",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </Box>
      <Box>
        <Typography variant="subtitle2" fontWeight={700} lineHeight={1.4}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {where}
        </Typography>
        {note && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {note}
          </Typography>
        )}
      </Box>
    </Stack>
    <Stack spacing={1.5}>{children}</Stack>
  </Box>
);

/** Два поля в ряд (на телефоне — одно); помощь разной длины ряды не перекашивает. */
const FieldRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      gap: 1.5,
      alignItems: "start",
    }}
  >
    {children}
  </Box>
);
