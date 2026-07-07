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
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCanChecker } from "../../hooks/useCan";
import { SettingsLayout } from "./SettingsLayout";
import { BranchFormDrawer, type BranchFormTarget } from "./BranchFormDrawer";
import {
  getBranches,
  deleteBranch,
  type DjangoBranch,
} from "../../api/organization";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

/** Пары «подпись — ссылка» картографических сервисов филиала (без пустых). */
function mapLinksOf(b: DjangoBranch): { label: string; url: string }[] {
  return [
    { label: "2ГИС", url: b.twoGisUrl },
    { label: "Яндекс", url: b.yandexMapsUrl },
    { label: "Google", url: b.googleMapsUrl },
  ].filter((l) => Boolean(l.url));
}

const BranchesSettingsPage: React.FC = () => {
  usePageTitle("Филиалы");
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { activeOrganization } = usePermissions();
  const { can } = useCanChecker();

  const canCreate = can("branches.create");
  const canUpdate = can("branches.update");
  const canDelete = can("branches.delete");

  const [search, setSearch] = React.useState("");
  const [formTarget, setFormTarget] = React.useState<BranchFormTarget>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DjangoBranch | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [snack, setSnack] = React.useState<string | null>(null);

  const queryKey = ["django", "organization", "branches"] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getBranches(),
    // Свежесть важнее экономии: справочник филиалов меняется редко, но после
    // правок таблица не должна держать устаревшие строки.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const allFromApi = query.data ?? [];

  // Суперюзеру/мультиорг-пользователю backend отдаёт филиалы ВСЕХ организаций.
  // Показываем только филиалы активной организации, иначе они двоятся и можно
  // отредактировать чужую клинику. Пока активная орг не определена — показываем
  // всё (обычным юзерам backend и так отдаёт только их организацию).
  const all = React.useMemo(() => {
    if (activeOrganization?.id == null) return allFromApi;
    return allFromApi.filter((b) => b.organizationId === activeOrganization.id);
  }, [allFromApi, activeOrganization?.id]);

  const activeCount = all.filter((b) => b.isActive).length;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.address.toLowerCase().includes(q) ||
        b.phones.some((p) => p.toLowerCase().includes(q)),
    );
  }, [all, search]);

  const refresh = () => queryClient.refetchQueries({ queryKey });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteBranch(deleteTarget.id);
      enqueueSnackbar("Филиал отключён", { variant: "success" });
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      // 404 — уже удалён в другой вкладке: трактуем как успех.
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
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <StoreOutlined color="action" />
            <Typography variant="h6" fontWeight={600}>
              Филиалы
            </Typography>
            {!query.isLoading && (
              <Tooltip title={`Активных: ${activeCount} из ${all.length}`}>
                <Chip label={all.length} size="small" sx={{ height: 20 }} />
              </Tooltip>
            )}
          </Stack>

          <Stack direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              placeholder="Поиск по названию, адресу…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ width: { xs: "100%", sm: 240 } }}
            />
            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => setFormTarget("new")}
              >
                Добавить
              </Button>
            )}
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Точки обслуживания организации. Филиал используется при записи на приём,
          продажах и в кассе.
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
        ) : all.length === 0 ? (
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
            <Typography variant="body2">Филиалов пока нет.</Typography>
            {canCreate && (
              <Button
                variant="outlined"
                startIcon={<AddOutlined />}
                onClick={() => setFormTarget("new")}
              >
                Добавить первый филиал
              </Button>
            )}
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body2">Ничего не найдено по запросу «{search}».</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Адрес</TableCell>
                  <TableCell sx={{ width: 170 }}>Телефоны</TableCell>
                  <TableCell sx={{ width: 200 }}>Карты</TableCell>
                  <TableCell sx={{ width: 110 }} align="center">Статус</TableCell>
                  <TableCell sx={{ width: 96 }} align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow
                    key={b.id}
                    hover
                    onDoubleClick={canUpdate ? () => setFormTarget(b) : undefined}
                    sx={{ opacity: b.isActive ? 1 : 0.55 }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>{b.name}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {b.address || "—"}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {b.phones.length === 0
                        ? "—"
                        : b.phones.map((p, i) => (
                            <Typography
                              key={`${p}-${i}`}
                              variant="body2"
                              sx={{ whiteSpace: "nowrap" }}
                            >
                              {p}
                            </Typography>
                          ))}
                    </TableCell>
                    <TableCell>
                      {mapLinksOf(b).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      ) : (
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {mapLinksOf(b).map(({ label, url }) => (
                            <Chip
                              key={label}
                              size="small"
                              icon={<PlaceOutlined />}
                              label={label}
                              component="a"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              clickable
                              variant="outlined"
                              sx={{ height: 22 }}
                              // Даблклик по строке открывает редактирование —
                              // клик по ссылке не должен его провоцировать.
                              onDoubleClick={(e: React.MouseEvent) =>
                                e.stopPropagation()
                              }
                            />
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={b.isActive ? "Работает" : "Отключён"}
                        color={b.isActive ? "success" : "default"}
                        variant={b.isActive ? "filled" : "outlined"}
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {canUpdate && (
                        <Tooltip title="Редактировать">
                          <IconButton size="small" onClick={() => setFormTarget(b)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && b.isActive && (
                        <Tooltip title="Отключить">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteTarget(b)}
                          >
                            <DeleteOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      {/* Create / edit drawer */}
      <BranchFormDrawer
        target={formTarget}
        organizationId={activeOrganization?.id ?? undefined}
        onClose={() => setFormTarget(null)}
        onSaved={() => refresh()}
      />

      {/* Delete (deactivate) confirm */}
      <Dialog
        open={deleteTarget !== null}
        onClose={deleteBusy ? undefined : () => setDeleteTarget(null)}
      >
        <DialogTitle>Отключить филиал?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            «{deleteTarget?.name}» будет деактивирован и скрыт из выбора.
            Связанные данные (приёмы, продажи) сохраняются, филиал можно снова
            включить через редактирование.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Отмена
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteBusy}>
            {deleteBusy ? "Отключение…" : "Отключить"}
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsLayout>
  );
};

export default BranchesSettingsPage;
