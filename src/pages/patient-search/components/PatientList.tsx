/**
 * PatientList.tsx
 * Компонент отображает левую колонку со списком пациентов:
 * - Кнопка "Добавить пациента"
 * - Поисковая строка
 * - Список пациентов с выделением выбранного
 * - Бесконечная прокрутка (без пагинации)
 * Является "презентационным" компонентом и не содержит API-логики.
 */
import React from 'react';
import {
  Box,
  Button,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
  List,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import PatientListRow from './PatientListRow';

export type PatientListItem = {
  id: string;
  fio: string;
  phone?: string;
  photo?: string | null;
  is_blacklisted?: boolean | null;
  blacklist_reason?: string | null;
};

type Props = {
  loading: boolean;
  errorMsg: string | null;
  patients: PatientListItem[];
  selectedId?: string | null;
  hasMore: boolean;
  loadMore: () => void;
  onSelect: (p: PatientListItem) => void;
};

const PatientList: React.FC<Props> = ({
  loading,
  errorMsg,
  patients,
  selectedId,
  hasMore,
  loadMore,
  onSelect,
}) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Подгружаем раньше: когда до конца остаётся ~40 строк (по 60px каждая)
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const rowHeight = 60; // px
    const preloadCount = 40; // сколько элементов до конца считаем порогом
    const threshold = rowHeight * preloadCount; // 2400px

    if (distanceToBottom < threshold && hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  return (
    <Box
      sx={{ height: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Card
        variant='outlined'
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PeopleOutlineIcon color="primary" />
              <Typography variant='h6'>Пациенты</Typography>
            </Stack>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent
          sx={{
            p: 0,
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            msOverflowStyle: 'none', // IE/Edge legacy
            scrollbarWidth: 'none', // Firefox
            '&::-webkit-scrollbar': { display: 'none' }, // Chrome/Safari/Edge (Chromium)
          }}
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {errorMsg ? (
            <Typography sx={{ p: 2 }} variant='body2' color='error' align="center">
              Ошибка: {errorMsg}
            </Typography>
          ) : patients.length === 0 ? (
            <Typography sx={{ p: 2 }} variant='body2' color='text.secondary' align="center">
              {loading ? 'Загрузка…' : 'Нет пациентов'}
            </Typography>
          ) : (
            <>
              <List disablePadding sx={{ px: 1, py: 0.5 }}>
                {patients.map((p) => {
                  const active = selectedId === p.id;
                  return (
                    <PatientListRow
                      key={p.id}
                      patient={p}
                      selected={active}
                      onClick={() => onSelect(p)}
                    />
                  );
                })}
              </List>

              <Box sx={{ px: 2, py: 1.25 }}>
                {loading && (
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                    <CircularProgress size={20} />
                    <Typography variant='caption' color='text.secondary'>
                      Загрузка…
                    </Typography>
                  </Stack>
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientList;
