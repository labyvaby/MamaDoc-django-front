/**
 * GuestCardPanel — средняя колонка «Карточка гостя» на странице «Гости»
 * (HotelGuestsPage) и содержимое GuestDetailsDialog. Тот же визуальный язык,
 * что PatientCard.tsx (AppCard/UserAvatar/InfoTile/subtleBg — общие,
 * переиспользуются как есть), но поля — отельные, не медицинские: вместо
 * счёта/бонусов/семьи — последнее проживание, документ, особые пожелания.
 * Чёрный список — тот же Alert+кнопка, что у заблокированного пациента.
 */
import React from "react";
import { Alert, AlertTitle, Box, IconButton, Link, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";

import { AppCard, ListEmptyState, UserAvatar } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import {
  formatHotelDate,
  formatHotelDateRange,
  BOARD_TYPE_LABELS,
  GUEST_TYPE_LABELS,
  VISIT_PURPOSE_LABELS,
} from "./mockDemoData";
import type { GuestDetailsState } from "./useGuestDetails";

/** Приглушённая плашка-факт — тот же визуальный приём, что FactBlock в PatientCard.tsx. */
const FactBlock: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <Box sx={(t) => ({ borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t), p: 1.5 })}>
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
      <Box sx={{ color: "text.secondary", display: "flex", "& .MuiSvgIcon-root": { fontSize: 16 } }}>{icon}</Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
    </Stack>
    {children}
  </Box>
);

export interface GuestCardPanelProps {
  guestName: string | null;
  state: GuestDetailsState;
}

export const GuestCardPanel: React.FC<GuestCardPanelProps> = ({ guestName, state }) => {
  const { guest, detailed, blacklistReasonDraft, setBlacklistReasonDraft, addToBlacklist, removeFromBlacklist } =
    state;

  const lastBooking = guest?.bookings[guest.bookings.length - 1];

  return (
    <AppCard
      variant="outlined"
      header={
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.25}>
            <PersonOutlineOutlined color="primary" />
            <Typography variant="h6">Гость</Typography>
          </Stack>
          {guest && (
            <Tooltip title={guest.isBlacklisted ? "Убрать из чёрного списка" : "В чёрный список"}>
              <IconButton
                size="small"
                color="error"
                onClick={guest.isBlacklisted ? removeFromBlacklist : addToBlacklist}
                sx={(th) => ({
                  bgcolor: guest.isBlacklisted
                    ? alpha(th.palette.error.main, th.palette.mode === "dark" ? 0.2 : 0.12)
                    : undefined,
                })}
              >
                {guest.isBlacklisted ? <RemoveCircleOutlineOutlined fontSize="small" /> : <BlockOutlined fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      }
      disableContentPadding
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, borderTop: 1, borderColor: "divider" }}>
        {guest ? (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            {guest.isBlacklisted && (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
                <AlertTitle sx={{ fontWeight: 600 }}>В чёрном списке</AlertTitle>
                {guest.blacklistReason || "Причина не указана."}
              </Alert>
            )}

            {!guest.isBlacklisted && (
              <Stack direction="row" gap={1} alignItems="center">
                <TextField
                  size="small"
                  placeholder="Причина чёрного списка (необязательно)"
                  value={blacklistReasonDraft}
                  onChange={(e) => setBlacklistReasonDraft(e.target.value)}
                  fullWidth
                />
              </Stack>
            )}

            {/* Идентификация: аватар-плашка + имя + телефон/email — тот же приём, что PatientCard. */}
            <Stack direction="row" alignItems="center" spacing={2}>
              <UserAvatar src={guest.photoDataUrl} name={guest.name} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2, lineHeight: 1.25 }}>
                  {guest.name}
                </Typography>
                <Link
                  href={`tel:${guest.phone}`}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    color: "text.secondary",
                    textDecoration: "none",
                    mt: 0.5,
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  <PhoneInTalkOutlined fontSize="small" color="primary" />
                  <Typography variant="body2">{guest.phone}</Typography>
                </Link>
                {detailed?.guestEmail && (
                  <Stack direction="row" alignItems="center" gap={0.75} color="text.secondary" sx={{ mt: 0.5 }}>
                    <EmailOutlined fontSize="small" />
                    <Typography variant="body2">{detailed.guestEmail}</Typography>
                  </Stack>
                )}
              </Box>
            </Stack>

            {/* Последнее проживание */}
            {lastBooking && (
              <FactBlock icon={<HotelOutlined />} title="Последнее проживание">
                <Stack spacing={0.5}>
                  <Typography variant="body2" fontWeight={600}>
                    Номер {lastBooking.roomNumber} · {formatHotelDateRange(lastBooking.checkIn, lastBooking.checkOut)}
                  </Typography>
                  {detailed?.boardType && (
                    <Typography variant="body2">
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                        Тариф:
                      </Typography>
                      {BOARD_TYPE_LABELS[detailed.boardType]}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Всего проживаний: {guest.bookings.length}
                  </Typography>
                </Stack>
              </FactBlock>
            )}

            {/* Документ */}
            {detailed?.guestType && (
              <FactBlock icon={<BadgeOutlined />} title={`Документ · ${GUEST_TYPE_LABELS[detailed.guestType]}`}>
                <Stack spacing={0.5}>
                  {detailed.guestType === "resident" ? (
                    <>
                      {detailed.idNumber && <Typography variant="body2">Паспорт (ID-карта): {detailed.idNumber}</Typography>}
                      {detailed.inn && <Typography variant="body2">ИНН: {detailed.inn}</Typography>}
                    </>
                  ) : (
                    <>
                      {detailed.citizenship && <Typography variant="body2">Гражданство: {detailed.citizenship}</Typography>}
                      {detailed.passportNumber && (
                        <Typography variant="body2">Загранпаспорт: {detailed.passportNumber}</Typography>
                      )}
                      {detailed.passportExpiry && (
                        <Typography variant="body2">Действителен до: {formatHotelDate(detailed.passportExpiry)}</Typography>
                      )}
                      {detailed.visitPurpose && (
                        <Typography variant="body2">Цель визита: {VISIT_PURPOSE_LABELS[detailed.visitPurpose]}</Typography>
                      )}
                    </>
                  )}
                  {!detailed.idNumber && !detailed.inn && !detailed.citizenship && !detailed.passportNumber && (
                    <Typography variant="body2" color="text.disabled">
                      Реквизиты не заполнены.
                    </Typography>
                  )}
                </Stack>
              </FactBlock>
            )}

            {/* Особые пожелания */}
            {detailed?.specialRequests && (
              <FactBlock icon={<NotesOutlined />} title="Особые пожелания">
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {detailed.specialRequests}
                </Typography>
              </FactBlock>
            )}
          </Stack>
        ) : (
          <ListEmptyState
            icon={<PersonOutlineOutlined />}
            title={guestName ? "Гость не найден" : "Гость не выбран"}
            description={guestName ? "Броней с этим именем нет в текущем окне данных." : "Выберите гостя слева, чтобы увидеть карточку."}
          />
        )}
      </Box>
    </AppCard>
  );
};

export default GuestCardPanel;
