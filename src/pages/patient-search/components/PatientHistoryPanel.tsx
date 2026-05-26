/**
 * PatientHistoryPanel.tsx
 * Компонент отображает среднюю колонку с истории приемов выбранного пациента.
 * Состояния:
 *  - Если пациент не выбран — показывает подсказку
 *  - Загрузка / ошибка
 *  - Список приемов с навигацией к карточке приема
 * Презентационный компонент: не содержит API-логики, принимает данные через пропсы.
 */
import React from "react";
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
  List,
  ListItemButton,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import { formatKGS } from "../../../utility/format";
import type { HistoryRow } from "../../../types/models";

type Props = {
  selected: boolean;
  loading: boolean;
  errorMsg: string | null;
  history: HistoryRow[];
  onClick: (row: HistoryRow) => void;
};

type FilterType = 'all' | 'doctor' | 'procedure';

const PatientHistoryPanel: React.FC<Props> = ({
  selected,
  loading,
  errorMsg,
  history,
  onClick,
}) => {
  const [filter, setFilter] = React.useState<FilterType>('all');

  const filtered = React.useMemo(() => {
    if (filter === 'all') return history;
    return history.filter(h => (h.appointment_type ?? 'doctor') === filter);
  }, [history, filter]);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Stack direction="row" alignItems="center" gap={1.25}>
                <HistoryOutlined color="primary" />
                <Typography variant="h6">История приемов</Typography>
              </Stack>
              <Chip size="small" label={filtered.length} />
            </Stack>
          }
          subheader={
            <ToggleButtonGroup
              value={filter}
              exclusive
              onChange={(_, v) => setFilter(prev => prev === v ? 'all' : (v ?? 'all'))}
              size="small"
              sx={{ mt: 1 }}
            >
              <ToggleButton
                value="doctor"
                sx={{
                  px: 1.5, py: 0.5, fontSize: '0.75rem',
                  '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700,
                    '&:hover': { bgcolor: 'primary.dark' } },
                }}
              >
                Врачи
              </ToggleButton>
              <ToggleButton
                value="procedure"
                sx={{
                  px: 1.5, py: 0.5, fontSize: '0.75rem',
                  '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700,
                    '&:hover': { bgcolor: 'primary.dark' } },
                }}
              >
                Процедуры
              </ToggleButton>
            </ToggleButtonGroup>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!selected ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              Выберите пациента слева
            </Typography>
          ) : loading ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              Загрузка…
            </Typography>
          ) : errorMsg ? (
            <Typography sx={{ p: 2 }} variant="body2" color="error" align="center">
              Ошибка: {errorMsg}
            </Typography>
          ) : filtered.length === 0 ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              {history.length === 0 ? "История пуста" : "Нет записей по выбранному фильтру"}
            </Typography>
          ) : (
            <List disablePadding sx={{ px: 1, py: 0.5 }}>
              {filtered.map((h) => (
                <ListItemButton
                  key={h.ID}
                  onClick={() => onClick(h)}
                  sx={{
                    px: 2,
                    py: 1.25,
                    my: "5px",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    alignItems: "flex-start",
                    "&:hover": {
                      bgcolor: (theme) => theme.palette.action.hover,
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap={2}
                    sx={{ width: "100%" }}
                  >
                    <Stack>
                      <Typography variant="subtitle2">
                        {h["Дата и время"]}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {h.appointment_type === 'procedure' ? 'Медсестра' : 'Врач'}: {h["Доктор ФИО"] || "—"}
                      </Typography>
                      {h["Услуга"] && (
                        <Typography variant="body2" color="text.secondary">
                          Услуга: {h["Услуга"]}
                        </Typography>
                      )}
                    </Stack>
                    <Stack alignItems="flex-end">
                      {typeof h["Итого, сом"] !== "undefined" ||
                        typeof h["Стоимость"] !== "undefined" ? (
                        <Typography variant="body2" color="text.secondary" fontWeight="medium">
                          {formatKGS(h["Итого, сом"] ?? h["Стоимость"] ?? 0)}
                        </Typography>
                      ) : null}
                      {h.Статус && (
                        <Chip
                          label={h.Статус}
                          size="small"
                          color={
                            h.Статус === "Оплачено"
                              ? "success"
                              : h.Статус === "Ожидаем"
                                ? "warning"
                                : "default"
                          }
                          variant={h.Статус === "Со скидкой" ? "outlined" : "filled"}
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientHistoryPanel;

