/**
 * Паспорт при заселении. Он необязателен и при брони, и при заселении: местные
 * часто показывают паспорт в Тундуке или фото в телефоне (заказчик, 08.10).
 * Карточка брони показывает эту панель перед заселением как напоминание — тип и
 * номер документа плюс согласие гостя; «Заселить без паспорта» заселяет без
 * номера (сервер документ не требует), его можно вписать позже.
 *
 * Сохраняется правкой одного гостя (PATCH …/guests/{guestId}/): остальные
 * гости и фото документов не трогаются. Старый сервер такого адреса не знает
 * (404) — тогда правкой позиции с guests, но только если фото документов у
 * гостей нет: та правка пересоздаёт гостей, и фото пропали бы.
 */
import React from "react";
import { Alert, Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";

import { ApiError, getErrorMessage } from "../api/client";
import {
  updateReservation,
  updateReservationItem,
  updateStayGuestDocument,
  type HotelReservationDetail,
  type HotelReservationItem,
} from "../api/hotel";
import { FormField } from "./formField";
import { fieldError, GUEST_RULES } from "./formRules";
import { GuestConsentField } from "./GuestConsent";
import { useConsentTemplate } from "./hotelConsent";
import { useHotelProperty } from "./useHotelProperty";

/** Нет номера документа у основного гостя позиции — перед заселением напомнить. null — документ не виден (нет права). */
export function missingDocumentGuest(item: HotelReservationItem) {
  const guest = item.guests.find((g) => g.isPrimary) ?? item.guests[0];
  if (!guest || guest.document === null) return null;
  return guest.document?.documentNumber?.trim() ? null : guest;
}

export const CheckInDocumentPanel: React.FC<{
  reservation: HotelReservationDetail;
  item: HotelReservationItem;
  onSaved: () => void;
  onCancel: () => void;
  /** «Заселить без паспорта» — номер впишут позже. */
  onSkip?: () => void;
}> = ({ reservation, item, onSaved, onCancel, onSkip }) => {
  const theme = useTheme();
  const { property } = useHotelProperty();
  const consentTemplate = useConsentTemplate(property?.id);
  const guest = missingDocumentGuest(item);
  const [guestType, setGuestType] = React.useState<"resident" | "foreign">(guest?.document?.guestType === "foreign" ? "foreign" : "resident");
  const [number, setNumber] = React.useState("");
  const [consent, setConsent] = React.useState(reservation.dataConsent);
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rules = { ...(guestType === "resident" ? GUEST_RULES.idNumber : GUEST_RULES.docNumber), required: true };
  const numberError = fieldError(number, rules);
  const hasPhotos = item.guests.some((g) => g.documentPhotoUrl || g.documentPhotoBackUrl);

  const save = async () => {
    setShowErrors(true);
    if (!guest || numberError || !consent) return;
    setSaving(true);
    setError(null);
    const document = {
      ...(guest.document ?? {}),
      guestType,
      documentType: guestType === "resident" ? "id_card" : "passport",
      documentNumber: number.trim(),
    } as NonNullable<typeof guest.document>;
    try {
      let version = reservation.version;
      let updated: HotelReservationDetail;
      try {
        updated = await updateStayGuestDocument(reservation.id, guest.id, { version, document });
      } catch (err) {
        const oldServer = err instanceof ApiError && (err.status === 404 || err.status === 405);
        if (!oldServer) throw err;
        if (hasPhotos) {
          setError("Сервер ещё не умеет править одного гостя, а правка всей брони стёрла бы фото документов. Впишите номер в карточке гостя.");
          return;
        }
        updated = await updateReservationItem(reservation.id, item.id, {
          version,
          guests: item.guests.map((g) => ({
            fullName: g.fullName,
            phone: g.phone || undefined,
            email: g.email || undefined,
            clientId: g.clientId,
            isPrimary: g.isPrimary,
            isChild: g.isChild,
            document: g.id === guest.id ? document : g.document,
          })),
        });
      }
      version = updated.version;
      if (!reservation.dataConsent) {
        await updateReservation(reservation.id, { version, dataConsent: true, dataConsentVersion: consentTemplate.version });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить документ"));
    } finally {
      setSaving(false);
    }
  };

  if (!guest) return null;
  return (
    <Box sx={{ p: 2, borderRadius: "12px", border: `1px solid ${alpha(theme.palette.warning.main, 0.45)}`, bgcolor: alpha(theme.palette.warning.main, 0.06) }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <BadgeOutlined sx={{ color: "warning.main" }} />
        <Typography fontWeight={700}>Паспорт для заселения</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        У гостя «{guest.fullName}» нет номера документа. Внесите его сейчас или заселите без него — например, если паспорт показали в
        Тундуке или на фото в телефоне. Номер можно вписать позже в карточке гостя.
      </Typography>
      <Stack gap={1.5}>
        <ToggleButtonGroup size="small" exclusive value={guestType} onChange={(_, v) => v && setGuestType(v)}>
          <ToggleButton value="resident">ID карта</ToggleButton>
          <ToggleButton value="foreign">Иностранец</ToggleButton>
        </ToggleButtonGroup>
        <FormField
          icon={<BadgeOutlined />}
          rules={rules}
          showErrors={showErrors}
          label={guestType === "resident" ? "Паспорт (ID-карта)" : "Номер загранпаспорта"}
          value={number}
          onValueChange={setNumber}
          fullWidth
        />
        <GuestConsentField checked={consent} onChange={setConsent} guestName={guest.fullName} disabled={reservation.dataConsent} />
        {showErrors && !consent && (
          <Typography variant="caption" color="error.main">
            Без согласия гостя паспортные данные не сохраняются.
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap">
          <Button color="inherit" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
          {onSkip && (
            <Button variant="outlined" onClick={onSkip} disabled={saving}>
              Заселить без паспорта
            </Button>
          )}
          <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить паспорт"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default CheckInDocumentPanel;
