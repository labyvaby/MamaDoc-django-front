/**
 * PatientListPanel — левая колонка «Все пациенты» (Django mode).
 * Презентационный компонент: список пациентов с аватаром-инициалами,
 * ФИО, телефоном и подсветкой выбранного. Без Supabase / Refine.
 * Визуально повторяет оригинальный PatientList + PatientListRow.
 */
import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  CardHeader,
  Divider,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";

import type { DjangoPatient } from "../../../api/patients";

function getInitials(fullName?: string): string {
  if (!fullName) return "—";
  const parts = String(fullName).trim().split(/\s+/);
  const a = (parts[0] || "").charAt(0);
  const b = (parts[1] || "").charAt(0);
  return ((a + b) || a || "—").toUpperCase();
}

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

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Card variant="outlined" sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PeopleOutlineIcon color="primary" />
              <Typography variant="h6">Пациенты</Typography>
            </Stack>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent
          onScroll={handleScroll}
          sx={{
            p: 0,
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            msOverflowStyle: "none",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {error ? (
            <Typography sx={{ p: 2 }} variant="body2" color="error" align="center">
              Ошибка: {error}
            </Typography>
          ) : patients.length === 0 ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              {loading ? "Загрузка…" : "Нет пациентов"}
            </Typography>
          ) : (
            <List disablePadding sx={{ px: 1, py: 0.5 }}>
              {patients.map((p) => {
                const active = selectedId === p.id;
                return (
                  <ListItemButton
                    key={p.id}
                    selected={active}
                    onClick={() => onSelect(p)}
                    sx={{
                      px: 2,
                      py: 1.25,
                      my: "5px",
                      border: "1px solid transparent",
                      borderRadius: 1,
                      "&:hover": { bgcolor: (theme) => theme.palette.action.hover },
                      "&.Mui-selected": {
                        borderColor: (theme) => theme.palette.primary.main,
                        bgcolor: (theme) => theme.palette.action.selected,
                        borderLeft: "3px solid",
                        borderLeftColor: (theme) => theme.palette.primary.main,
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ width: 1 }}>
                      <ListItemAvatar sx={{ minWidth: "auto" }}>
                        <Avatar
                          src={p.photoUrl ?? undefined}
                          sx={{
                            width: 28,
                            height: 28,
                            bgcolor: (theme) => theme.palette.primary.main,
                            fontSize: 12,
                          }}
                        >
                          {getInitials(p.fullName)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="subtitle2" noWrap>
                              {p.fullName || "Без имени"}
                            </Typography>
                            {p.isBlacklisted && (
                              <Tooltip title={p.blacklistReason || "Причина не указана"} arrow>
                                <ReportProblemIcon color="error" sx={{ fontSize: 16 }} />
                              </Tooltip>
                            )}
                          </Stack>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {p.phone || "—"}
                          </Typography>
                        }
                      />
                    </Stack>
                  </ListItemButton>
                );
              })}
            </List>
          )}
          {patients.length > 0 && loading && (
            <Typography
              sx={{ p: 1.5 }}
              variant="caption"
              color="text.secondary"
              align="center"
              display="block"
            >
              Загрузка…
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientListPanel;
