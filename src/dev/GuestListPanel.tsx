/**
 * GuestListPanel — левая колонка «Гости» (HotelGuestsPage). Тот же визуальный
 * язык, что PatientListPanel.tsx: аватар-плашка + ФИО + телефон, бейдж
 * чёрного списка поверх аватара, подсветка выбранной строки. Реальные гости
 * (GET /hotel/guests/, см. src/api/hotel.ts) — ключ строки теперь clientId
 * (число), не имя, поиск/фильтр уходят на бэкенд через listGuests({q}).
 *
 * Источник (g.source, справа в строке) — платформа, с которой пришёл гость.
 */
import React from "react";
import { Box, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";

import { AppCard, ListEmptyState, UserAvatar } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import { HOTEL_BOOKING_SOURCE_LABELS } from "./hotelDisplay";
import { plural } from "./hotelUi";
import type { HotelGuest } from "../api/hotel";

export interface GuestListPanelProps {
  guests: HotelGuest[];
  totalCount: number;
  selectedClientId: number | null;
  onSelect: (clientId: number) => void;
  /** Пока список грузится — спиннер, а не «Гостей пока нет». */
  loading?: boolean;
}

export const GuestListPanel: React.FC<GuestListPanelProps> = ({ guests, totalCount, selectedClientId, onSelect, loading }) => (
  <AppCard
    variant="outlined"
    header={
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
          Список
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
          {totalCount}
        </Typography>
      </Stack>
    }
    disableContentPadding
    sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
  >
    <Box
      sx={{
        p: 1,
        borderTop: 1,
        borderColor: "divider",
        overflowY: "auto",
        flex: 1,
        minHeight: 0,
      }}
    >
      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={26} />
        </Stack>
      ) : guests.length === 0 ? (
        <ListEmptyState
          icon={<PeopleOutlineOutlined />}
          title={totalCount === 0 ? "Гостей пока нет" : "Ничего не найдено"}
          description={totalCount === 0 ? "Новый гость появится после создания брони." : "Попробуйте другой запрос."}
        />
      ) : (
        <Stack spacing={0.5}>
          {guests.map((g) => {
            const active = selectedClientId === g.clientId;
            return (
              <Box
                key={g.clientId}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(g.clientId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(g.clientId);
                  }
                }}
                sx={(t) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  p: 1.25,
                  borderRadius: "10px",
                  cursor: "pointer",
                  border: 1,
                  borderColor: active ? alpha(t.palette.primary.main, 0.4) : "transparent",
                  bgcolor: active
                    ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.09)
                    : "transparent",
                  transition: "background-color .15s ease, border-color .15s ease",
                  "&:hover": {
                    borderColor: active ? undefined : alpha(t.palette.primary.main, 0.24),
                    bgcolor: active ? undefined : subtleBg(t),
                  },
                  "&:focus-visible": { outline: "none", borderColor: alpha(t.palette.primary.main, 0.5) },
                })}
              >
                <Box sx={{ position: "relative", flexShrink: 0 }}>
                  <UserAvatar src={g.photoUrl} name={g.fullName} size={38} sx={{ borderRadius: "10px", fontSize: 13 }} />
                  {g.isBlacklisted && (
                    <Tooltip title={g.blacklistReason || "В чёрном списке"} arrow>
                      <Box
                        sx={(t) => ({
                          position: "absolute",
                          right: -3,
                          bottom: -3,
                          width: 15,
                          height: 15,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: `2.5px solid ${t.palette.background.paper}`,
                          bgcolor: t.palette.error.main,
                        })}
                      >
                        <ReportProblemIcon sx={{ fontSize: 9, color: "common.white" }} />
                      </Box>
                    </Tooltip>
                  )}
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {g.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {g.phone}
                  </Typography>
                </Box>

                <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
                  <Typography variant="caption" fontWeight={600} color={g.staysCount > 0 ? "text.primary" : "text.disabled"} sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {g.staysCount > 0 ? `${g.staysCount} ${plural(g.staysCount, "заезд", "заезда", "заездов")}` : "нет заездов"}
                  </Typography>
                  {g.source && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                      {HOTEL_BOOKING_SOURCE_LABELS[g.source] ?? g.source}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  </AppCard>
);

export default GuestListPanel;
