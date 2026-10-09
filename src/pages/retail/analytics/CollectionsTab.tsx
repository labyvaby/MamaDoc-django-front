import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";

import { getErrorMessage } from "../../../api/client";
import { updateCollection, type RetailCollection, type RetailCollectionUpdate } from "../../../api/retailAnalytics";
import { AppButton, AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../components/ui";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePermissions } from "../../../hooks/usePermissions";
import { seasonLabel } from "../retailAnalyticsModel";
import { SeasonSelect } from "./filters";
import { ALL_SEASONS } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";

const PAGE = 50;

type Draft = {
  name: string;
  season: string;
  year: string;
  launchedAt: string;
  selloutDue: string;
  comment: string;
};

const toDraft = (c: RetailCollection): Draft => ({
  name: c.name,
  season: c.season,
  year: c.year ? String(c.year) : "",
  launchedAt: c.launchedAt ?? "",
  selloutDue: c.selloutDue ?? "",
  comment: c.comment,
});

/** Только изменённые поля: PATCH не должен затирать то, что правили параллельно. */
function diff(c: RetailCollection, d: Draft): RetailCollectionUpdate {
  const body: RetailCollectionUpdate = {};
  if (d.name.trim() !== c.name) body.name = d.name.trim();
  if (d.season.trim() !== c.season) body.season = d.season.trim();
  const year = d.year ? Number(d.year) : null;
  if (year !== c.year) body.year = year;
  if ((d.launchedAt || null) !== c.launchedAt) {
    if (d.launchedAt) body.launchedAt = d.launchedAt;
    else body.clearLaunchedAt = true;
  }
  if ((d.selloutDue || null) !== c.selloutDue) {
    if (d.selloutDue) body.selloutDue = d.selloutDue;
    else body.clearSelloutDue = true;
  }
  if (d.comment !== c.comment) body.comment = d.comment;
  return body;
}

const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "—");

export const CollectionsTab: React.FC<{
  organizationId: number | undefined;
  collections: RetailCollection[];
  loading: boolean;
  error: unknown;
}> = ({ organizationId, collections, loading, error }) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("retail.manage");
  const queryClient = useQueryClient();
  const [season, setSeason] = React.useState(ALL_SEASONS);
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput.trim().toLowerCase());
  const [limit, setLimit] = React.useState(PAGE);
  const [editing, setEditing] = React.useState<RetailCollection | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const visible = React.useMemo(
    () =>
      collections
        .filter((c) => season === ALL_SEASONS || c.season === season)
        .filter((c) => !search || c.modelName.toLowerCase().includes(search) || c.name.toLowerCase().includes(search))
        .sort((a, b) => a.modelName.localeCompare(b.modelName, "ru")),
    [collections, season, search],
  );
  React.useEffect(() => setLimit(PAGE), [season, search]);

  const save = useMutation({
    mutationFn: ({ modelId, body }: { modelId: number; body: RetailCollectionUpdate }) => updateCollection(modelId, body),
    onSuccess: (saved) => {
      queryClient.setQueryData<RetailCollection[]>(retailKeys.collections(organizationId), (prev) =>
        prev?.map((c) => (c.modelId === saved.modelId ? saved : c)),
      );
      // Сезон и название коллекции видны во всех отчётах.
      void queryClient.invalidateQueries({ queryKey: retailKeys.all });
      setEditing(null);
    },
  });

  const open = (c: RetailCollection) => {
    if (!canEdit) return;
    save.reset();
    setEditing(c);
    setDraft(toDraft(c));
  };
  const set = (field: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));

  const yearInvalid = Boolean(draft?.year) && !/^20\d\d$/.test(draft?.year ?? "");
  const datesInvalid = Boolean(draft?.launchedAt && draft?.selloutDue && draft.selloutDue < draft.launchedAt);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <SeasonSelect collections={collections} value={season} onChange={setSeason} />
        <TextField
          size="small"
          label="Поиск модели"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ minWidth: 220, flex: 1, maxWidth: 360 }}
        />
        <Typography variant="body2" color="text.secondary">
          {visible.length} из {collections.length}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Коллекция — сезон модели целиком, со всеми её цветами и размерами. Отчёты sell-through, размеров и матрицы видят только
        модели с коллекцией.{canEdit ? " Нажмите на строку, чтобы изменить." : ""}
      </Typography>

      {Boolean(error) && <Alert severity="error">{getErrorMessage(error)}</Alert>}
      <AppCard variant="outlined" elevation={0} disableContentPadding>
        {loading ? (
          <ListLoadingSkeleton rows={8} />
        ) : visible.length === 0 ? (
          <ListEmptyState icon={<CategoryOutlined />} title={collections.length ? "Ничего не найдено" : "Коллекций пока нет"} />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Модель</TableCell>
                  <TableCell>Коллекция</TableCell>
                  <TableCell>Сезон</TableCell>
                  <TableCell align="right">Год</TableCell>
                  <TableCell>В продаже с</TableCell>
                  <TableCell>Распродать до</TableCell>
                  <TableCell align="right">SKU</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.slice(0, limit).map((c) => (
                  <TableRow
                    key={c.modelId}
                    hover={canEdit}
                    onClick={() => open(c)}
                    sx={{ cursor: canEdit ? "pointer" : "default" }}
                  >
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" noWrap title={c.modelName}>
                        {c.modelName}
                      </Typography>
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{seasonLabel(c.season)}</TableCell>
                    <TableCell align="right">{c.year ?? "—"}</TableCell>
                    <TableCell>{fmtDate(c.launchedAt)}</TableCell>
                    <TableCell>{fmtDate(c.selloutDue)}</TableCell>
                    <TableCell align="right">{c.skuTotal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {visible.length > limit && (
          <Box sx={{ p: 1.5, textAlign: "center", borderTop: 1, borderColor: "divider" }}>
            <AppButton size="small" variant="text" onClick={() => setLimit((n) => n + PAGE)}>
              Показать ещё ({visible.length - limit})
            </AppButton>
          </Box>
        )}
      </AppCard>

      <Dialog open={Boolean(editing && draft)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>Коллекция модели</DialogTitle>
        {editing && draft && (
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {editing.modelName}
              </Typography>
              <TextField label="Коллекция" value={draft.name} onChange={set("name")} required error={!draft.name.trim()} />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField label="Сезон" value={draft.season} onChange={set("season")} helperText="SS26, AW26/27, Базовая" fullWidth />
                <TextField
                  label="Год"
                  value={draft.year}
                  onChange={set("year")}
                  error={yearInvalid}
                  helperText={yearInvalid ? "Четыре цифры, 2000–2099" : " "}
                  inputProps={{ inputMode: "numeric" }}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  type="date"
                  label="В продаже с"
                  value={draft.launchedAt}
                  onChange={set("launchedAt")}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  type="date"
                  label="Распродать до"
                  value={draft.selloutDue}
                  onChange={set("selloutDue")}
                  InputLabelProps={{ shrink: true }}
                  error={datesInvalid}
                  helperText={datesInvalid ? "Раньше даты ввода в продажу" : " "}
                  fullWidth
                />
              </Stack>
              <TextField label="Комментарий" value={draft.comment} onChange={set("comment")} multiline minRows={2} />
              {save.isError && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <AppButton variant="text" onClick={() => setEditing(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            disabled={!draft?.name.trim() || yearInvalid || datesInvalid || save.isPending}
            onClick={() => {
              if (!editing || !draft) return;
              const body = diff(editing, draft);
              if (Object.keys(body).length === 0) setEditing(null);
              else save.mutate({ modelId: editing.modelId, body });
            }}
          >
            Сохранить
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
