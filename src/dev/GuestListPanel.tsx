/**
 * GuestListPanel — левая колонка «Гости» (HotelGuestsPage). Тот же визуальный
 * язык, что PatientListPanel.tsx: аватар-плашка + ФИО + телефон, бейдж
 * чёрного списка поверх аватара, подсветка выбранной строки. Без бесконечной
 * подгрузки — список гостей отеля собирается целиком на клиенте (не тысячи
 * записей, как в реальной картотеке), фильтрация тоже локальная.
 *
 * Источник (g.source, справа в строке) — платформа, с которой пришёл гость
 * (сайт/OTA/звонок и т.п., см. HotelGuestSummary.source в mockDemoData.ts) —
 * запрошен отдельно как колонка списка, не только карточка гостя.
 */
import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";

import { AppCard, ListEmptyState, UserAvatar } from "../components/ui";
import { subtleBg } from "../theme/uiHelpers";
import { BOOKING_SOURCE_LABELS, type HotelGuestSummary } from "./mockDemoData";

export interface GuestListPanelProps {
  guests: HotelGuestSummary[];
  totalCount: number;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export const GuestListPanel: React.FC<GuestListPanelProps> = ({ guests, totalCount, selectedName, onSelect }) => (
  <AppCard
    variant="outlined"
    header={
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <PeopleOutlineOutlined color="primary" />
          <Typography variant="h6">Гости</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
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
      {guests.length === 0 ? (
        <ListEmptyState
          icon={<PeopleOutlineOutlined />}
          title={totalCount === 0 ? "Гостей пока нет" : "Ничего не найдено"}
          description={totalCount === 0 ? "Новый гость появится после создания брони." : "Попробуйте другой запрос."}
        />
      ) : (
        <Stack spacing={0.5}>
          {guests.map((g) => {
            const active = selectedName === g.name;
            return (
              <Box
                key={g.name}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(g.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(g.name);
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
                  <UserAvatar src={g.photoDataUrl} name={g.name} size={38} sx={{ borderRadius: "10px", fontSize: 13 }} />
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
                    {g.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {g.phone}
                  </Typography>
                </Box>

                <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
                  {g.source && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.65rem" }}>
                      {BOOKING_SOURCE_LABELS[g.source]}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {g.bookings.length}
                  </Typography>
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
