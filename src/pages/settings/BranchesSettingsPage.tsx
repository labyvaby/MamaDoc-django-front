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
import { useT } from "../../i18n/VerticalProvider";

/** Пары «подпись — ссылка» картографических сервисов филиала (без пустых). */
function mapLinksOf(b: DjangoBranch): { label: string; url: string }[] {
  return [
    { label: "2ГИС", url: b.twoGisUrl },
    { label: "Яндекс", url: b.yandexMapsUrl },
    { label: "Google", url: b.googleMapsUrl },
  ].filter((l) => Boolean(l.url));
}

const BranchesSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("branches.title"));
  const queryClient = useQueryClient();

  function extractErrorMessage(err: unknown): string {
    if (err instanceof ApiError) return extractApiError(err.payload, err.status);
    if (err instanceof Error) return err.message;
    return t("branches.unknownError");
  }
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

  const queryKey = ["django", "organization", "branches", activeOrganization?.id] as const;
  const query = useQuery({
    queryKey,
    // Фильтрация по активной организации — внутри getBranches: бэкенд отдаёт
    // суперюзеру филиалы всех его организаций.
    queryFn: () => getBranches(activeOrganization?.id),
    // Свежесть важнее экономии: справочник филиалов меняется редко, но после
    // правок таблица не должна держать устаревшие строки.
    staleTime: 0,
    refetchOnMount: "always",
  });
  // Пока активная орг не определена, getBranches отдаёт всё как есть (обычным
  // юзерам backend и так возвращает только их организацию).
  const all = query.data ?? [];

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
      enqueueSnackbar(t("branches.disableSuccess"), { variant: "success" });
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
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <StoreOutlined color="action" />
            <Typography variant="h6" fontWeight={600}>
              {t("branches.title")}
            </Typography>
            {!query.isLoading && (
              <Tooltip title={t("branches.activeOfTotal", { active: activeCount, total: all.length })}>
                <Chip label={all.length} size="small" sx={{ height: 20 }} />
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
              placeholder={t("branches.searchPlaceholder")}
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
            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => setFormTarget("new")}
                sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {t("branches.addButton")}
              </Button>
            )}
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {t("branches.description")}
        </Typography>

        {query.error && (
          <Alert
            severity="error"
            action={
              <Button size="small" color="inherit" onClick={() => refresh()}>
                {t("common:actions.retry")}
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
            <Typography variant="body2">{t("branches.empty")}</Typography>
            {canCreate && (
              <Button
                variant="outlined"
                startIcon={<AddOutlined />}
                onClick={() => setFormTarget("new")}
              >
                {t("branches.addFirst")}
              </Button>
            )}
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body2">{t("branches.emptySearch", { query: search })}</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("branches.columns.name")}</TableCell>
                  <TableCell>{t("branches.columns.address")}</TableCell>
                  <TableCell sx={{ width: 170 }}>{t("branches.columns.phones")}</TableCell>
                  <TableCell sx={{ width: 200 }}>{t("branches.columns.maps")}</TableCell>
                  <TableCell sx={{ width: 110 }} align="center">{t("branches.columns.status")}</TableCell>
                  <TableCell sx={{ width: 96 }} align="right">{t("branches.columns.actions")}</TableCell>
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
                        label={b.isActive ? t("branches.status.active") : t("branches.status.inactive")}
                        color={b.isActive ? "success" : "default"}
                        variant={b.isActive ? "filled" : "outlined"}
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {canUpdate && (
                        <Tooltip title={t("branches.tooltips.edit")}>
                          <IconButton size="small" onClick={() => setFormTarget(b)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && b.isActive && (
                        <Tooltip title={t("branches.tooltips.disable")}>
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
        <DialogTitle>{t("branches.disableConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("branches.disableConfirmBody", { name: deleteTarget?.name })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            {t("common:actions.cancel")}
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteBusy}>
            {deleteBusy ? t("branches.disabling") : t("branches.disableButton")}
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsLayout>
  );
};

export default BranchesSettingsPage;
