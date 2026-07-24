import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../../hooks/usePageTitle";
import { SettingsLayout } from "./SettingsLayout";
import {
  DiagnosisFormDrawer,
  type DiagnosisFormTarget,
} from "./DiagnosisFormDrawer";
import {
  getDiagnosesPaginated,
  updateDiagnosis,
  deleteDiagnosis,
  type CatalogDiagnosis,
} from "../../api/medical";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";

// ── error parsing ───────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const DiagnosesSettingsPage: React.FC = () => {
  usePageTitle("Диагнозы");
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [formTarget, setFormTarget] = React.useState<DiagnosisFormTarget>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogDiagnosis | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [snack, setSnack] = React.useState<string | null>(null);
  // IDs currently mid-toggle, to disable their switch and avoid double clicks.
  const [togglingIds, setTogglingIds] = React.useState<ReadonlySet<number>>(new Set());

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryKey = ["django", "medical", "diagnoses", "infinite", debouncedSearch] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 0, signal }) =>
      getDiagnosesPaginated(debouncedSearch || undefined, signal, {
        includeInactive: true,
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((acc, p) => acc + p.items.length, 0);
      if (loadedCount < lastPage.totalCount && lastPage.items.length > 0) {
        return loadedCount;
      }
      return undefined;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const allItems = React.useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  const totalCount = query.data?.pages[0]?.totalCount ?? 0;
  const loadedCount = allItems.length;

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  // refetch (не просто invalidate) — гарантируем перезапрос свежего списка
  const refresh = () => queryClient.refetchQueries({ queryKey });

  const handleToggleActive = async (d: CatalogDiagnosis) => {
    setTogglingIds((prev) => new Set(prev).add(d.id));
    try {
      await updateDiagnosis(d.id, { isActive: !d.isActive });
      await refresh();
    } catch (err) {
      setSnack(extractErrorMessage(err));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(d.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteDiagnosis(deleteTarget.id);
      enqueueSnackbar("Диагноз удалён из справочника", { variant: "success" });
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDeleteTarget(null);
        await refresh();
      } else {
        setSnack(extractErrorMessage(err));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ height: "100%" }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="h6" fontWeight={600}>
              Диагнозы (МКБ-10)
            </Typography>
            {!query.isLoading && (
              <Tooltip title={`Показано ${loadedCount} из ${totalCount}`}>
                <Chip label={totalCount} size="small" sx={{ height: 20 }} />
              </Tooltip>
            )}
          </Stack>

          <Stack
            direction="row"
            gap={1}
            alignItems="center"
            sx={{ width: { xs: "100%", md: "auto" } }}
          >
            <TextField
              size="small"
              placeholder="Поиск по коду или названию…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: { xs: 1, md: "none" }, width: { md: 240 }, minWidth: 0 }}
            />
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setFormTarget("new")}
              sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              Добавить
            </Button>
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Справочник диагнозов, из которого врачи выбирают значения в заключении.
          Список настраивается отдельно для каждой организации.
        </Typography>

        {query.error && (
          <Alert
            severity="error"
            action={
              <Button size="small" color="inherit" onClick={() => refresh()}>
                Повторить
              </Button>
            }
          >
            {extractErrorMessage(query.error)}
          </Alert>
        )}

        {snack && (
          <Alert severity="error" onClose={() => setSnack(null)}>
            {snack}
          </Alert>
        )}

        {query.isLoading ? (
          <Stack alignItems="center" py={6}>
            <CircularProgress />
          </Stack>
        ) : loadedCount === 0 ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 160,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "text.secondary",
              border: (theme) => `1px dashed ${theme.palette.divider}`,
              borderRadius: 1,
              p: 4,
              gap: 1.5,
            }}
          >
            {search ? (
              <Typography variant="body2">Ничего не найдено по запросу «{search}».</Typography>
            ) : (
              <>
                <Typography variant="body2">Справочник диагнозов пуст.</Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddOutlined />}
                  onClick={() => setFormTarget("new")}
                >
                  Добавить первый диагноз
                </Button>
              </>
            )}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 110 }}>Код</TableCell>
                  <TableCell>Название</TableCell>
                  <TableCell>Название для печати</TableCell>
                  <TableCell sx={{ width: 110 }} align="center">Активен</TableCell>
                  <TableCell sx={{ width: 96 }} align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allItems.map((d) => (
                  <TableRow
                    key={d.id}
                    hover
                    onDoubleClick={() => setFormTarget(d)}
                    sx={{ opacity: d.isActive ? 1 : 0.55, cursor: "default" }}
                  >
                    <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {d.code}
                    </TableCell>
                    <TableCell>
                      {d.title}
                    </TableCell>
                    <TableCell sx={{ color: d.displayName ? "text.primary" : "text.disabled" }}>
                      {d.displayName || "—"}
                    </TableCell>

                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={d.isActive}
                        disabled={togglingIds.has(d.id)}
                        onChange={() => handleToggleActive(d)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Редактировать">
                        <IconButton size="small" onClick={() => setFormTarget(d)}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(d)}>
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Infinite scroll sentinel & status footer */}
            <Box
              ref={sentinelRef}
              sx={{
                py: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              {query.isFetchingNextPage ? (
                <Stack direction="row" alignItems="center" gap={1}>
                  <CircularProgress size={20} />
                  <Typography variant="caption" color="text.secondary">
                    Загрузка следующих 50...
                  </Typography>
                </Stack>
              ) : query.hasNextPage ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => query.fetchNextPage()}
                  sx={{ color: "text.secondary" }}
                >
                  Показать ещё ({loadedCount} из {totalCount})
                </Button>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Показаны все {totalCount} диагнозов
                </Typography>
              )}
            </Box>
          </TableContainer>
        )}
      </Stack>


      {/* Create / edit drawer */}
      <DiagnosisFormDrawer
        target={formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={() => refresh()}
      />

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onClose={deleteBusy ? undefined : () => setDeleteTarget(null)}>
        <DialogTitle>Удалить диагноз?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            «{deleteTarget?.code} — {deleteTarget?.title}» будет удалён из справочника.
            Уже созданные заключения сохранят свой диагноз (история не меняется).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Отмена
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteBusy}>
            {deleteBusy ? "Удаление…" : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsLayout>
  );
};

export default DiagnosesSettingsPage;
