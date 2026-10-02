/**
 * «Согласие на обработку данных» в настройках отеля: текст, который ресепшен
 * показывает гостю (и печатает на подпись) перед тем, как прикрепить паспорт.
 * Каждое сохранение — новая редакция (1.0 → 1.1), чтобы было видно, на какой
 * гость согласился. Хранится на сервере (контракт §15); пока он отвечает
 * 404 — демо-режим: редакция живёт на этом устройстве (hotelDemoStore) и
 * сразу видна в формах. Когда сервер появится, а своей редакции у него нет,
 * форма подставит демо-редакцию — сохранить одним нажатием.
 */
import React from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { putConsentTemplate, type HotelProperty } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { DEMO_KEYS, writeDemo } from "./hotelDemoStore";
import { CONSENT_PLACEHOLDERS, consentQueryKey, DEFAULT_CONSENT, fromServer, saveConsentTemplate, useConsentState, type ConsentTemplate } from "./hotelConsent";
import { ConsentDialog, consentEditionLabel } from "./GuestConsent";

export const ConsentSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const canManage = useCan("hotel.manage");
  const { template: saved, source, leftover } = useConsentState(property.id);
  const [title, setTitle] = React.useState(saved.title);
  const [body, setBody] = React.useState(saved.body);
  const [preview, setPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const start = leftover ?? saved;
    setTitle(start.title);
    setBody(start.body);
  }, [saved, leftover]);
  const ready = source === "server" || source === "demo";

  const dirty = leftover != null || title.trim() !== saved.title || body.trim() !== saved.body.trim();
  const isDefault = saved.title === DEFAULT_CONSENT.title && saved.body === DEFAULT_CONSENT.body;
  const draft: ConsentTemplate = { ...saved, title: title.trim() || DEFAULT_CONSENT.title, body };

  /** Подстановка — в место курсора, а не в конец текста. */
  const insert = (token: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (reset: boolean) => {
    setSaving(true);
    try {
      let version: string;
      if (source === "server") {
        const res = await putConsentTemplate(property.id, reset ? { title: null, body: null } : { title: title.trim() || null, body: body.trim() });
        queryClient.setQueryData(consentQueryKey(property.id), res);
        // Текст стал общим — демо-копия этого устройства больше не нужна.
        writeDemo(DEMO_KEYS.consent(property.id), null);
        version = fromServer(res).version;
      } else {
        version = saveConsentTemplate(property.id, reset ? null : { title, body }).version;
      }
      enqueueSnackbar(reset ? `Вернули стандартный текст — редакция ${version}` : `Текст согласия сохранён — редакция ${version}`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить текст согласия"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        Согласие на обработку персональных данных
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Ресепшен показывает этот текст гостю перед тем, как прикрепить и распознать паспорт, и может распечатать его на подпись. Сейчас:{" "}
        {consentEditionLabel(saved)}
        {isDefault ? " · стандартный шаблон" : ""}.
      </Typography>
      {source === "demo" && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          Демо-режим: свой текст хранится на этом устройстве. С обновлением сервера он станет общим для всех сотрудников.
        </Alert>
      )}
      {leftover && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          Сервер начал хранить текст согласия. В форму подставлена редакция, сохранённая на этом устройстве в демо-режиме, — проверьте и нажмите
          «Сохранить текст», чтобы она стала общей.
        </Alert>
      )}
      {source === "error" && (
        <Alert severity="error" variant="outlined" sx={{ mb: 1.5 }}>
          Не удалось загрузить текст согласия с сервера — показан стандартный. Обновите страницу.
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Шаблон составлен по Закону КР «Об информации персонального характера» — перед использованием согласуйте его с юристом.
      </Typography>
      <Stack gap={1.5}>
        <TextField size="small" label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} disabled={!canManage || !ready} fullWidth />
        <TextField
          label="Текст согласия"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 8000))}
          inputRef={bodyRef}
          disabled={!canManage || !ready}
          multiline
          minRows={8}
          maxRows={18}
          fullWidth
          helperText="Абзацы — через пустую строку."
        />
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            Вставить:
          </Typography>
          {CONSENT_PLACEHOLDERS.map((p) => (
            <Chip key={p.token} size="small" variant="outlined" label={`${p.label} ${p.token}`} onClick={canManage ? () => insert(p.token) : undefined} />
          ))}
        </Stack>
      </Stack>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 2 }}>
        <Button variant="contained" disabled={!canManage || !ready || saving || !dirty || body.trim() === ""} onClick={() => void save(false)}>
          {saving ? "Сохранение…" : "Сохранить текст"}
        </Button>
        <Button color="inherit" startIcon={<VisibilityOutlined fontSize="small" />} onClick={() => setPreview(true)}>
          Как увидит гость
        </Button>
        {!isDefault && canManage && ready && (
          <Button color="inherit" startIcon={<RestartAltOutlined fontSize="small" />} disabled={saving} onClick={() => void save(true)}>
            Вернуть стандартный
          </Button>
        )}
      </Stack>
      <ConsentDialog open={preview} onClose={() => setPreview(false)} template={draft} />
    </Box>
  );
};

export default ConsentSettingsCard;
