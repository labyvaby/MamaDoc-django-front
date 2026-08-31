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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
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
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { useCan } from "../../../hooks/useCan";
import { useActiveScope } from "../../../hooks/useActiveScope";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import { SETTINGS_TAB_PERMISSIONS } from "../../../config/accessPermissions";
import { SettingsLayout } from "../SettingsLayout";
import { AutomationEditorDialog } from "./AutomationEditorDialog";
import { AutomationHistoryTab } from "./AutomationHistoryTab";
import { AutomationRunsDialog } from "./AutomationRunsDialog";
import { automationToForm, toSaveInput } from "./automationForm";

type TabKey = "rules" | "history";

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

  const [tab, setTab] = useState<TabKey>("rules");
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
      invalidateAutomations();
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

  /**
   * Обновить список и историю после записи. Каталог намеренно не трогаем:
   * это справочник, он не меняется от сохранения правила, а его рефетч
   * посреди открытого редактора приводил к пересборке формы поверх ввода.
   */
  const invalidateAutomations = () => {
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.automations.mutable });
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.automations.history(organizationId ?? null, {}), exact: false });
  };

  if (!permLoading && !canView) {
    return (
      <SettingsLayout>
        <AccessDenied />
      </SettingsLayout>
    );
  }

  const needsOrg = isReady && !orgReady;

  // Обёртка SettingsLayout, а не собственный Box: она рисует левое меню
  // настроек и сама держит отступы и прокрутку контента (как на всех
  // остальных вкладках раздела).
  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {t("automations.pageTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("automations.subtitle")}
            </Typography>
          </Box>
          {tab === "rules" && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              disabled={!catalogQuery.data || catalogQuery.data.events.length === 0}
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              sx={{ flexShrink: 0 }}
            >
              {t("automations.create")}
            </Button>
          )}
        </Stack>

        <Tabs
          value={tab}
          onChange={(_, next: TabKey) => setTab(next)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            value="rules"
            icon={<BoltOutlined fontSize="small" />}
            iconPosition="start"
            label={t("automations.tabs.rules")}
          />
          <Tab
            value="history"
            icon={<HistoryOutlined fontSize="small" />}
            iconPosition="start"
            label={t("automations.tabs.history")}
          />
        </Tabs>

      {needsOrg ? (
        <Alert severity="info">{t("automations.needsOrg")}</Alert>
      ) : tab === "history" ? (
        <AutomationHistoryTab
          automations={rows}
          organizationId={organizationId}
          enabled={enabled}
        />
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
      </Stack>

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
            invalidateAutomations();
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
    </SettingsLayout>
  );
};

export default AutomationsSettingsPage;
