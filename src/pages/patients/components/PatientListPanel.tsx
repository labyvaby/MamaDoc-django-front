/**
 * PatientListPanel — левая колонка «Все пациенты» (Django mode).
 * Презентационный компонент: список пациентов с аватаром-инициалами,
 * ФИО, телефоном и подсветкой выбранного. Без Supabase / Refine.
 */
import React from "react";
import { Box, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import { AppCard, ListEmptyState, ListLoadingSkeleton, UserAvatar } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

import type { DjangoPatient } from "../../../api/patients";

type Props = {
  loading: boolean;
  error: string | null;
  patients: DjangoPatient[];
  selectedId: number | null;
  onSelect: (p: DjangoPatient) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
};

const PatientListPanel: React.FC<Props> = ({
  loading,
  error,
  patients,
  selectedId,
  onSelect,
  hasMore = false,
  onLoadMore,
}) => {
  // Infinite scroll: when scrolled near the bottom, request the next page.
  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasMore || loading || !onLoadMore) return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore],
  );

  const isInitialLoading = loading && patients.length === 0 && !error;

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PeopleOutlineOutlined color="primary" />
              <Typography variant="h6">Пациенты</Typography>
            </Stack>
            {patients.length > 0 && !error && (
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {patients.length}{hasMore ? "+" : ""}
              </Typography>
            )}
          </Stack>
        }
        disableContentPadding
        sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          onScroll={handleScroll}
          sx={{
            p: 1,
            borderTop: 1,
            borderColor: "divider",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            msOverflowStyle: "none",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {error ? (
            <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить" description={error} />
          ) : isInitialLoading ? (
            <ListLoadingSkeleton rows={8} />
          ) : patients.length === 0 ? (
            <ListEmptyState
              icon={<PeopleOutlineOutlined />}
              title="Пациенты не найдены"
              description="Измените запрос или добавьте нового пациента"
            />
          ) : (
            <>
              <Stack spacing={0.5}>
                {patients.map((p) => {
                  const active = selectedId === p.id;
                  return (
                    <Box
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(p);
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
                        "&:focus-visible": {
                          outline: "none",
                          borderColor: alpha(t.palette.primary.main, 0.5),
                        },
                      })}
                    >
                      <Box sx={{ position: "relative", flexShrink: 0 }}>
                        <UserAvatar
                          src={p.photoUrl}
                          name={p.fullName}
                          size={38}
                          sx={{ borderRadius: "10px", fontSize: 13 }}
                        />
                        {p.isBlacklisted && (
                          <Tooltip title={p.blacklistReason || "Причина не указана"} arrow>
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
                          {p.fullName || "Без имени"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                          {p.phone || "—"}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>

              {patients.length > 0 && loading && (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ py: 1.5 }}>
                  <CircularProgress size={18} />
                  <Typography variant="caption" color="text.secondary">
                    Загрузка…
                  </Typography>
                </Stack>
              )}
            </>
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientListPanel;
