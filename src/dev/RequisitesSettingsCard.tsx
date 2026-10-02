/**
 * «Реквизиты» в настройках отеля — юрлицо, ИНН, ОКПО, налоговая, банк и
 * подписанты: попадают в шапку счёта на оплату и справки о проживании
 * (hotelPrintDocs.ts уже печатает блок, когда поля заполнены). Бэкенд их
 * хранит в объекте (контракт §6) — пока в ответе объекта этих полей нет,
 * карточка говорит, что включится после обновления сервера.
 */
import React from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { updateHotelProperty, type HotelProperty, type HotelPropertyUpdateData } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { FormField } from "./formField";

type Key = "legalName" | "legalAddress" | "inn" | "okpo" | "taxAuthority" | "bankName" | "bankAccount" | "bik" | "directorName" | "accountantName";

const FIELDS: { key: Key; label: string; placeholder: string; digits?: number; group: "org" | "bank" | "sign" }[] = [
  { key: "legalName", label: "Юридическое название", placeholder: "ОсОО «Вива Отель»", group: "org" },
  { key: "legalAddress", label: "Юридический адрес", placeholder: "г. Бишкек, ул. Киевская, 1", group: "org" },
  { key: "inn", label: "ИНН", placeholder: "14 цифр", digits: 14, group: "org" },
  { key: "okpo", label: "ОКПО", placeholder: "8 цифр", digits: 10, group: "org" },
  { key: "taxAuthority", label: "Налоговая (УГНС)", placeholder: "УГНС по Первомайскому району", group: "org" },
  { key: "bankName", label: "Банк", placeholder: "ОАО «Kompanion Bank»", group: "bank" },
  { key: "bankAccount", label: "Расчётный счёт", placeholder: "16 цифр", digits: 20, group: "bank" },
  { key: "bik", label: "БИК", placeholder: "6 цифр", digits: 9, group: "bank" },
  { key: "directorName", label: "Руководитель", placeholder: "Фамилия И. О.", group: "sign" },
  { key: "accountantName", label: "Бухгалтер", placeholder: "Фамилия И. О.", group: "sign" },
];

const GROUPS: { id: "org" | "bank" | "sign"; title: string; icon: React.ReactNode }[] = [
  { id: "org", title: "Организация", icon: <BusinessOutlined fontSize="small" /> },
  { id: "bank", title: "Банк", icon: <AccountBalanceOutlined fontSize="small" /> },
  { id: "sign", title: "Подписи в документах", icon: <PersonOutlineOutlined fontSize="small" /> },
];

export const RequisitesSettingsCard: React.FC<{ property: HotelProperty }> = ({ property }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("hotel.manage");
  // Бэкенд уже хранит реквизиты, если в ответе объекта есть хотя бы поле legalName.
  const supported = "legalName" in property;
  const initial = React.useMemo(() => Object.fromEntries(FIELDS.map((f) => [f.key, (property[f.key] as string | undefined) ?? ""])) as Record<Key, string>, [property]);
  const [form, setForm] = React.useState<Record<Key, string>>(initial);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setForm(initial), [initial]);
  const dirty = FIELDS.some((f) => form[f.key] !== initial[f.key]);

  const save = async () => {
    setSaving(true);
    try {
      const patch: HotelPropertyUpdateData = Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key].trim()]));
      await updateHotelProperty(property.id, patch);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "properties"] });
      enqueueSnackbar("Реквизиты сохранены — они появятся в счетах и справках", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить реквизиты"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        Реквизиты для счетов и справок
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Печатаются в шапке счёта на оплату и справки о проживании — как в документах, которые отель выдаёт сейчас.
      </Typography>
      {!supported && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          Сохранение реквизитов включится после обновления сервера. Счёт и справка уже готовы их печатать.
        </Alert>
      )}
      <Stack gap={2}>
        {GROUPS.map((g) => (
          <Box key={g.id}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1, color: "text.secondary" }}>
              {g.icon}
              <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {g.title}
              </Typography>
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              {FIELDS.filter((f) => f.group === g.id).map((f) => (
                <FormField
                  key={f.key}
                  size="small"
                  label={f.label}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onValueChange={(v) => setForm((s) => ({ ...s, [f.key]: f.digits ? v.replace(/\D/g, "").slice(0, f.digits) : v }))}
                  rules={{ maxLength: f.digits ?? 200 }}
                  disabled={!supported || !canManage || saving}
                  sx={f.key === "legalName" || f.key === "legalAddress" || f.key === "taxAuthority" ? { gridColumn: { sm: "1 / -1" } } : undefined}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
      {supported && (
        <Button variant="contained" sx={{ mt: 2 }} disabled={!dirty || saving || !canManage} onClick={() => void save()}>
          {saving ? "Сохранение…" : "Сохранить реквизиты"}
        </Button>
      )}
    </Box>
  );
};

export default RequisitesSettingsCard;
