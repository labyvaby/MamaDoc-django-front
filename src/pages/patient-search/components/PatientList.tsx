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
  Stack,
  Typography,
  CircularProgress,
} from '@mui/material';
import PeopleOutlineOutlined from '@mui/icons-material/PeopleOutlineOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import { AppCard, ListEmptyState, ListLoadingSkeleton } from '../../../components/ui';
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

  const isInitialLoading = loading && patients.length === 0 && !errorMsg;

  return (
    <Box sx={{ height: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <PeopleOutlineOutlined color="primary" />
              <Typography variant="h6">Пациенты</Typography>
            </Stack>
            {patients.length > 0 && !errorMsg && (
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {patients.length}{hasMore ? "+" : ""}
              </Typography>
            )}
          </Stack>
        }
        disableContentPadding
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Box
          sx={{
            p: 1,
            borderTop: 1,
            borderColor: 'divider',
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
            <ListEmptyState
              icon={<ErrorOutlineOutlined />}
              title="Не удалось загрузить"
              description={errorMsg}
            />
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
                    <PatientListRow
                      key={p.id}
                      patient={p}
                      selected={active}
                      onClick={() => onSelect(p)}
                    />
                  );
                })}
              </Stack>

              {loading && (
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

export default PatientList;
