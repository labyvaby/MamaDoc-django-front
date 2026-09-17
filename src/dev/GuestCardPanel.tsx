/**
 * GuestCardPanel — средняя колонка «Карточка гостя» на странице «Гости».
 * Реальный профиль (useGuestDetails → GET /hotel/guests/{clientId}/) + самая
 * свежая бронь из истории для «последнего проживания»/тарифа/цели визита.
 * Тот же визуальный язык, что PatientCard.tsx (AppCard/UserAvatar/InfoTile/
 * subtleBg — общие, переиспользуются как есть), но поля — отельные.
 */
import React from "react";
import { Alert, AlertTitle, Box, CircularProgress, IconButton, Link, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";

import { AppCard, ListEmptyState, UserAvatar } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import { HOTEL_BOARD_TYPE_LABELS, HOTEL_BOOKING_SOURCE_LABELS, HOTEL_GUEST_TYPE_LABELS, HOTEL_VISIT_PURPOSE_LABELS } from "./hotelDisplay";
import { formatHotelDate, formatHotelDateRange } from "./mockDemoData";
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
  clientId: number | null;
  state: GuestDetailsState;
}

export const GuestCardPanel: React.FC<GuestCardPanelProps> = ({ clientId, state }) => {
  const {
    guest,
    guestLoading,
    reservations,
    blacklistReasonDraft,
    setBlacklistReasonDraft,
    addToBlacklist,
    removeFromBlacklist,
    blacklistBusy,
  } = state;

  const lastReservation = reservations[0];
  const lastItem = lastReservation?.items[0];

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
                disabled={blacklistBusy}
                onClick={() => void (guest.isBlacklisted ? removeFromBlacklist() : addToBlacklist())}
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
        {guestLoading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : guest ? (
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
              <UserAvatar src={guest.photoUrl} name={guest.fullName} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700} noWrap sx={{ letterSpacing: -0.2, lineHeight: 1.25 }}>
                  {guest.fullName}
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
                {guest.email && (
                  <Stack direction="row" alignItems="center" gap={0.75} color="text.secondary" sx={{ mt: 0.5 }}>
                    <EmailOutlined fontSize="small" />
                    <Typography variant="body2">{guest.email}</Typography>
                  </Stack>
                )}
              </Box>
            </Stack>

            {/* Последнее проживание */}
            {lastItem && (
              <FactBlock icon={<HotelOutlined />} title="Последнее проживание">
                <Stack spacing={0.5}>
                  <Typography variant="body2" fontWeight={600}>
                    Номер {lastItem.roomNumber ?? "—"} · {formatHotelDateRange(lastItem.checkIn, lastItem.checkOut)}
                  </Typography>
                  <Typography variant="body2">
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                      Тариф:
                    </Typography>
                    {HOTEL_BOARD_TYPE_LABELS[lastItem.boardType] ?? lastItem.boardType}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Всего проживаний: {guest.staysCount}
                  </Typography>
                </Stack>
              </FactBlock>
            )}

            {/* Источник — платформа, с которой пришёл гость — та же колонка, что в списке слева. */}
            {guest.source && (
              <FactBlock icon={<PublicOutlined />} title="Источник">
                <Typography variant="body2">{HOTEL_BOOKING_SOURCE_LABELS[guest.source] ?? guest.source}</Typography>
              </FactBlock>
            )}

            {/* Документ — реквизиты личности гостя, видны только с правом hotel.guests.documents. */}
            {guest.guestType && (
              <FactBlock icon={<BadgeOutlined />} title={`Документ · ${HOTEL_GUEST_TYPE_LABELS[guest.guestType] ?? guest.guestType}`}>
                <Stack spacing={0.5}>
                  {guest.guestType === "resident" ? (
                    <>
                      {guest.documentNumber && <Typography variant="body2">Паспорт (ID-карта): {guest.documentNumber}</Typography>}
                      {guest.inn && <Typography variant="body2">ИНН: {guest.inn}</Typography>}
                    </>
                  ) : (
                    <>
                      {guest.citizenship && <Typography variant="body2">Гражданство: {guest.citizenship}</Typography>}
                      {guest.documentNumber && <Typography variant="body2">Загранпаспорт: {guest.documentNumber}</Typography>}
                      {guest.passportExpiry && (
                        <Typography variant="body2">Действителен до: {formatHotelDate(guest.passportExpiry)}</Typography>
                      )}
                      {lastItem?.guests[0]?.document?.visitPurpose && (
                        <Typography variant="body2">
                          Цель визита: {HOTEL_VISIT_PURPOSE_LABELS[lastItem.guests[0].document.visitPurpose] ?? lastItem.guests[0].document.visitPurpose}
                        </Typography>
                      )}
                    </>
                  )}
                  {!guest.documentNumber && !guest.inn && !guest.citizenship && (
                    <Typography variant="body2" color="text.disabled">
                      Реквизиты не заполнены — либо не указаны, либо скрыты (нужно право «Паспортные данные»).
                    </Typography>
                  )}
                </Stack>
              </FactBlock>
            )}

            {/* Особые пожелания — последняя бронь. */}
            {lastReservation?.guestComment && (
              <FactBlock icon={<PublicOutlined />} title="Особые пожелания">
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {lastReservation.guestComment}
                </Typography>
              </FactBlock>
            )}
          </Stack>
        ) : (
          <ListEmptyState
            icon={<PersonOutlineOutlined />}
            title={clientId != null ? "Гость не найден" : "Гость не выбран"}
            description={clientId != null ? "Не удалось загрузить карточку гостя." : "Выберите гостя слева, чтобы увидеть карточку."}
          />
        )}
      </Box>
    </AppCard>
  );
};

export default GuestCardPanel;
