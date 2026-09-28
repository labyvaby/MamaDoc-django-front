import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  downloadAuditCsv,
  getAuditCatalog,
  getAuditEvents,
  type AuditEvent,
  type AuditFilters,
  type AuditOutcome,
} from "../../../api/audit";
import { ApiError } from "../../../api/client";
import { DJANGO_LIST_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { DateRangeField, DEFAULT_RANGE_PRESETS, TonedChip, type DateRange } from "../../../components/ui";
import { useActiveScope } from "../../../hooks/useActiveScope";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import { SettingsLayout } from "../SettingsLayout";
import { AuditEventDrawer } from "./AuditEventDrawer";
import { OUTCOME_LABELS, actionText, actorText, categoryText, outcomeTone, resourceText } from "./auditFormat";

const OUTCOMES: AuditOutcome[] = ["success", "failure", "denied"];

function defaultRange(): DateRange {
  return { from: dayjs().subtract(6, "day").startOf("day"), to: dayjs().endOf("day") };
}

/**
 * Настройки → Доступы → История действий.
 *
 * Один экран для всех видов бизнеса: коды событий и их подписи приходят из
 * `/v2/audit/catalog/`, поэтому новая вертикаль добавляет события без
 * правок фронта. Доступ решает бэк (владелец, суперадмин или `audit.view`);
 * 403 каталога показывает «Нет доступа».
 */
export const AuditLogSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { organizationId, isReady, orgReady } = useActiveScope();
  const { activeMembership } = usePermissions();
  const scope = { organizationId };
  const enabled = isReady && orgReady;

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState<AuditOutcome | "">("");
  const [branchId, setBranchId] = useState<number | "">("");
  const [actor, setActor] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters: AuditFilters = {
    from: range.from.format("YYYY-MM-DD"),
    to: range.to.format("YYYY-MM-DD"),
    category: category || undefined,
    action: action || undefined,
    outcome: outcome || undefined,
    branchId: branchId === "" ? undefined : branchId,
    actorId: actor?.id,
    search: debouncedSearch || undefined,
  };

  const catalogQuery = useQuery({
    queryKey: djangoQueryKeys.audit.catalog(organizationId ?? null),
    queryFn: ({ signal }) => getAuditCatalog(scope, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });

  const eventsQuery = useInfiniteQuery({
    queryKey: djangoQueryKeys.audit.events(organizationId ?? null, { ...filters }),
    queryFn: ({ pageParam, signal }) => getAuditEvents(filters, pageParam, scope, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && catalogQuery.isSuccess,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const catalog = catalogQuery.data;
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data],
  );
  const actionsForCategory = (catalog?.actions ?? []).filter(
    (item) => !category || item.category === category,
  );
  const branches = activeMembership?.branches ?? [];

  const forbidden = catalogQuery.error instanceof ApiError && catalogQuery.error.status === 403;
  if (forbidden) {
    return (
      <SettingsLayout>
        <AccessDenied />
      </SettingsLayout>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadAuditCsv(filters, scope);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "flex-start" }}
        >
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {t("audit.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("audit.description")}
            </Typography>
          </Box>
          {catalog?.canExport && (
            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={16} /> : <FileDownloadOutlined />}
              disabled={exporting}
              onClick={handleExport}
            >
              {t("audit.export")}
            </Button>
          )}
        </Stack>

        {exportError && <Alert severity="error">{exportError}</Alert>}
        {isReady && !orgReady && <Alert severity="info">{t("layout.noOrgSelected")}</Alert>}

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap flexWrap="wrap">
          <DateRangeField value={range} onChange={(value) => setRange(value)} presets={DEFAULT_RANGE_PRESETS} />
          <TextField
            select
            size="small"
            label={t("audit.filters.category")}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setAction("");
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{t("audit.filters.all")}</MenuItem>
            {(catalog?.categories ?? []).map((item) => (
              <MenuItem key={item.code} value={item.code}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label={t("audit.filters.action")}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">{t("audit.filters.all")}</MenuItem>
            {actionsForCategory.map((item) => (
              <MenuItem key={item.code} value={item.code}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          {branches.length > 1 && (
            <TextField
              select
              size="small"
              label={t("audit.filters.branch")}
              value={branchId === "" ? "" : String(branchId)}
              onChange={(e) => setBranchId(e.target.value === "" ? "" : Number(e.target.value))}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">{t("audit.filters.all")}</MenuItem>
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label={t("audit.filters.outcome")}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as AuditOutcome | "")}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">{t("audit.filters.all")}</MenuItem>
            {OUTCOMES.map((item) => (
              <MenuItem key={item} value={item}>
                {OUTCOME_LABELS[item]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t("audit.filters.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 220 }}
          />
        </Stack>

        {actor && (
          <Box>
            <Chip
              label={t("audit.filters.actorChip", { name: actor.name })}
              onDelete={() => setActor(null)}
            />
          </Box>
        )}

        {eventsQuery.isLoading || catalogQuery.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
            <CircularProgress />
          </Box>
        ) : eventsQuery.isError || catalogQuery.isError ? (
          <Alert severity="error">{t("audit.loadError")}</Alert>
        ) : events.length === 0 ? (
          <Paper variant="outlined" sx={{ borderRadius: 2, py: 8, textAlign: "center" }}>
            <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
              <HistoryOutlined fontSize="large" />
              <Typography>{t("audit.empty")}</Typography>
              <Typography variant="body2">{t("audit.emptyHint")}</Typography>
            </Stack>
          </Paper>
        ) : isDesktop ? (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("audit.columns.when")}</TableCell>
                  <TableCell>{t("audit.columns.actor")}</TableCell>
                  <TableCell>{t("audit.columns.action")}</TableCell>
                  <TableCell>{t("audit.columns.object")}</TableCell>
                  <TableCell>{t("audit.columns.branch")}</TableCell>
                  <TableCell>{t("audit.columns.device")}</TableCell>
                  <TableCell>{t("audit.columns.outcome")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} hover sx={{ cursor: "pointer" }} onClick={() => setSelected(event)}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {dayjs(event.occurredAt).format("DD.MM.YYYY HH:mm")}
                    </TableCell>
                    <TableCell>{actorText(event)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{actionText(event, catalog)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {categoryText(event.category, catalog)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, overflowWrap: "anywhere" }}>{resourceText(event)}</TableCell>
                    <TableCell>{event.branchName ?? "—"}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{event.ipAddress ?? "—"}</Typography>
                      {event.device && (
                        <Typography variant="caption" color="text.secondary">
                          {event.device}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <TonedChip label={OUTCOME_LABELS[event.outcome]} toneName={outcomeTone(event.outcome)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        ) : (
          <Stack spacing={1}>
            {events.map((event) => (
              <Paper
                key={event.id}
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 2, cursor: "pointer" }}
                onClick={() => setSelected(event)}
              >
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(event.occurredAt).format("DD.MM.YYYY HH:mm")}
                  </Typography>
                  <TonedChip label={OUTCOME_LABELS[event.outcome]} toneName={outcomeTone(event.outcome)} />
                </Stack>
                <Typography variant="body2" fontWeight={600}>
                  {actorText(event)}
                </Typography>
                <Typography variant="body2">{actionText(event, catalog)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                  {resourceText(event)}
                  {event.branchName ? ` · ${event.branchName}` : ""}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}

        {eventsQuery.hasNextPage && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button onClick={() => void eventsQuery.fetchNextPage()} disabled={eventsQuery.isFetchingNextPage}>
              {eventsQuery.isFetchingNextPage ? t("audit.loadingMore") : t("audit.loadMore")}
            </Button>
          </Box>
        )}
      </Stack>

      <AuditEventDrawer
        event={selected}
        catalog={catalog}
        onClose={() => setSelected(null)}
        onFilterByActor={(id, name) => {
          setActor({ id, name });
          setSelected(null);
        }}
      />
    </SettingsLayout>
  );
};

export default AuditLogSettingsPage;
