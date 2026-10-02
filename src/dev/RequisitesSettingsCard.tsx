/**
 * «Реквизиты» в настройках отеля — юрлицо, ИНН, ОКПО, налоговая, банк и
 * подписанты: попадают в шапку счёта на оплату, справки о проживании и
 * согласия на обработку данных. Хранятся только на сервере (контракт §6):
 * пока в ответе объекта этих полей нет, форма закрыта, а счёт, справка и
 * бланк согласия не печатаются — реквизиты одного компьютера давали разные
 * документы с разных мест. Демо-копия прошлых версий подставляется один раз,
 * чтобы сохранить её на сервер.
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
import { DEMO_KEYS, readDemo, writeDemo } from "./hotelDemoStore";

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
  const initial = React.useMemo(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, (supported ? (property[f.key] as string | undefined) : undefined) ?? ""])) as Record<Key, string>,
    [property, supported],
  );
  // Сервер начал хранить реквизиты, у объекта они пустые, а на этом устройстве
  // остались демо-реквизиты — подставляем их в форму, чтобы сохранить одним нажатием.
  const leftover = React.useMemo(() => {
    if (!supported) return null;
    const demo = readDemo<Partial<Record<Key, string>> | null>(DEMO_KEYS.requisites(property.id), null);
    if (!demo || !FIELDS.some((f) => demo[f.key]?.trim())) return null;
    return FIELDS.every((f) => !String((property[f.key] as string | undefined) ?? "").trim()) ? demo : null;
  }, [property, supported]);
  const [form, setForm] = React.useState<Record<Key, string>>(initial);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(
    () => setForm(leftover ? (Object.fromEntries(FIELDS.map((f) => [f.key, leftover[f.key] ?? ""])) as Record<Key, string>) : initial),
    [initial, leftover],
  );
  const dirty = FIELDS.some((f) => form[f.key] !== initial[f.key]);

  const save = async () => {
    if (!supported) return;
    setSaving(true);
    try {
      const patch: HotelPropertyUpdateData = Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key].trim()]));
      await updateHotelProperty(property.id, patch);
      // Реквизиты стали общими — демо-копия этого устройства больше не нужна.
      writeDemo(DEMO_KEYS.requisites(property.id), null);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "properties"] });
      enqueueSnackbar("Реквизиты сохранены — они появятся в счетах, справках и согласии", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить реквизиты"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Ссылка «Заполнить» из карточки брони ведёт сюда — /settings/hotel-property#requisites.
  const anchorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (window.location.hash === "#requisites") anchorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  return (
    <Box ref={anchorRef} id="requisites" sx={{ scrollMarginTop: 16 }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
        Реквизиты для счетов и справок
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Печатаются в шапке счёта на оплату и справки о проживании, а юрлицо и адрес — в согласии на обработку данных. Без них счёт, справка и
        бланк согласия не печатаются.
      </Typography>
      {!supported && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          Сервер пока не хранит реквизиты — заполнить их можно будет после его обновления. До тех пор счёт, справка и бланк согласия не печатаются,
          чтобы с разных компьютеров не выходили разные документы.
        </Alert>
      )}
      {leftover && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          Сервер начал хранить реквизиты. В форму подставлены реквизиты, сохранённые на этом устройстве в демо-режиме, — проверьте и нажмите
          «Сохранить реквизиты», чтобы они стали общими для всех сотрудников.
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
                  disabled={!canManage || saving || !supported}
                  sx={f.key === "legalName" || f.key === "legalAddress" || f.key === "taxAuthority" ? { gridColumn: { sm: "1 / -1" } } : undefined}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
      <Button variant="contained" sx={{ mt: 2 }} disabled={!dirty || saving || !canManage || !supported} onClick={() => void save()}>
        {saving ? "Сохранение…" : "Сохранить реквизиты"}
      </Button>
    </Box>
  );
};

export default RequisitesSettingsCard;
