import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import dayjs from "dayjs";

import {
  getAutomationCatalog,
  getAutomations,
  updateAutomation,
  type Automation,
  type AutomationStatus,
} from "../../../api/automations";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { PageHeader } from "../../../components/ui";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { useCan } from "../../../hooks/useCan";
import { useActiveScope } from "../../../hooks/useActiveScope";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import { SETTINGS_TAB_PERMISSIONS } from "../../../config/accessPermissions";
import { AutomationEditorDialog } from "./AutomationEditorDialog";
import { AutomationRunsDialog } from "./AutomationRunsDialog";
import { automationToForm, toSaveInput } from "./automationForm";

const STATUS_COLOR: Record<AutomationStatus, "default" | "success" | "warning"> = {
  draft: "default",
  active: "success",
  paused: "warning",
};

/**
 * Конструктор автоматизаций организации.
 *
 * Каталог событий и полей приходит с бэка (`/v2/automations/catalog/`) и
 * является единственным источником правды: своего списка событий здесь нет,
 * поэтому новое событие на бэке появляется в конструкторе без правок фронта.
 */
const AutomationsSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("automations.pageTitle"));
  const queryClient = useQueryClient();

  const canView = useCan(SETTINGS_TAB_PERMISSIONS.automations);
  const { loading: permLoading } = usePermissions();
  const { organizationId, orgReady, isReady } = useActiveScope();
  const enabled = isReady && orgReady && canView;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [runsFor, setRunsFor] = useState<Automation | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; item: Automation } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const catalogQuery = useQuery({
    queryKey: djangoQueryKeys.automations.catalog(organizationId ?? null),
    queryFn: ({ signal }) => getAutomationCatalog({ organizationId }, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const listQuery = useQuery({
    queryKey: djangoQueryKeys.automations.list(organizationId ?? null),
    queryFn: ({ signal }) => getAutomations({ organizationId }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  /**
   * Включение и пауза идут тем же полным `PUT`, что и редактор: `PATCH` у
   * модуля нет, поэтому переключатель обязан отправить всё определение
   * правила целиком, иначе оно потеряет условия и действия.
   */
  const toggleMutation = useMutation({
    mutationFn: ({ item, status }: { item: Automation; status: AutomationStatus }) =>
      updateAutomation(item.id, {
        ...toSaveInput(automationToForm(item), organizationId),
        status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.automations.all });
      setMessage({ type: "success", text: t("automations.toggleSuccess") });
    },
    onError: (err) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("automations.toggleError"),
      });
    },
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  if (!permLoading && !canView) return <AccessDenied />;

  const needsOrg = isReady && !orgReady;

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        maxWidth: 1200,
        mx: "auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PageHeader title={t("automations.pageTitle")} showSearch={false} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", sm: "center" }}
        sx={{ mb: 2 }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {t("automations.subtitle")}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          disabled={!catalogQuery.data || catalogQuery.data.events.length === 0}
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          {t("automations.create")}
        </Button>
      </Stack>

      {needsOrg ? (
        <Alert severity="info">{t("automations.needsOrg")}</Alert>
      ) : catalogQuery.isError ? (
        <Alert severity="error">{t("automations.catalogError")}</Alert>
      ) : listQuery.isError ? (
        <Alert severity="error">{t("automations.loadError")}</Alert>
      ) : listQuery.isLoading || catalogQuery.isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, py: 8, textAlign: "center" }}>
          <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
            <BoltOutlined fontSize="large" />
            <Typography fontWeight={600}>{t("automations.empty")}</Typography>
            <Typography variant="body2">{t("automations.emptyHint")}</Typography>
          </Stack>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: "action.hover" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.name")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.event")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.branch")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.actions")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.status")}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t("automations.columns.updatedAt")}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {item.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{item.eventLabel}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                      {item.eventCode}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.branchName ?? t("automations.allBranches")}</TableCell>
                  <TableCell>
                    {t("automations.actionsCount", { count: item.actions.length })}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={t(`automations.statusHint.${item.status}`)}>
                      <Chip
                        size="small"
                        label={t(`automations.status.${item.status}`)}
                        color={STATUS_COLOR[item.status] ?? "default"}
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{dayjs(item.updatedAt).format("DD.MM.YYYY HH:mm")}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => setMenu({ anchor: e.currentTarget, item })}
                      disabled={toggleMutation.isPending}
                    >
                      <MoreVertOutlined fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu
        open={menu != null}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (!menu) return;
            setEditing(menu.item);
            setEditorOpen(true);
            setMenu(null);
          }}
        >
          {t("automations.rowMenu.edit")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menu) return;
            setRunsFor(menu.item);
            setMenu(null);
          }}
        >
          <HistoryOutlined fontSize="small" sx={{ mr: 1 }} />
          {t("automations.rowMenu.runs")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menu) return;
            toggleMutation.mutate({
              item: menu.item,
              status: menu.item.status === "active" ? "paused" : "active",
            });
            setMenu(null);
          }}
        >
          {menu?.item.status === "active"
            ? t("automations.rowMenu.pause")
            : t("automations.rowMenu.activate")}
        </MenuItem>
      </Menu>

      {catalogQuery.data && (
        <AutomationEditorDialog
          open={editorOpen}
          automation={editing}
          catalog={catalogQuery.data}
          organizationId={organizationId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            queryClient.invalidateQueries({ queryKey: djangoQueryKeys.automations.all });
            setMessage({ type: "success", text: t("automations.editor.saveSuccess") });
          }}
        />
      )}

      <AutomationRunsDialog
        open={runsFor != null}
        automation={runsFor}
        organizationId={organizationId}
        onClose={() => setRunsFor(null)}
      />

      <Snackbar
        open={message != null}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.type ?? "info"}
          sx={{ width: "100%" }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AutomationsSettingsPage;
