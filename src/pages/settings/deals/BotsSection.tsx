import React from "react";
import {
  Box,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton, ConfirmDialog } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { useT } from "../../../i18n/VerticalProvider";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";
import { getBranches } from "../../../api/organization";
import {
  createBot,
  getBotKeys,
  getBots,
  issueBotKey,
  revokeBotKey,
  updateBot,
  type DealBot,
  type DealBotIssuedKey,
  type DealBotKey,
} from "../../../api/deals";
import { dealsErrorMessage, exactMoment } from "../../deals/meta";
import { relativeTime } from "../../tasks/meta";

/** Палитра ботов — та же, что у этапов, плюс индиго по умолчанию. */
const BOT_COLORS = ["#6366F1", "#22C55E", "#F59E0B", "#06B6D4", "#EC4899", "#8B5CF6", "#EF4444"];

type Toast = { text: string; severity: "success" | "error" };

interface BotsSectionProps {
  orgId: number | undefined;
  onToast: (toast: Toast) => void;
}

/**
 * Боты воронки и их API-ключи.
 *
 * Бот — служебный пользователь, за которого бэк сам заводит роль и членство;
 * здесь только имя, цвет (им подсвечиваются его действия в истории сделки),
 * филиал для новых сделок и переключатель. Ключи — партнёрские токены: секрет
 * показывается один раз в момент выпуска, дальше в списке только префикс.
 */
const BotsSection: React.FC<BotsSectionProps> = ({ orgId, onToast }) => {
  const { t } = useT("deals");
  const theme = useTheme();
  const queryClient = useQueryClient();

  const botsQuery = useQuery({
    queryKey: djangoQueryKeys.deals.bots(orgId),
    queryFn: ({ signal }) => getBots(orgId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const branchesQuery = useQuery({
    queryKey: ["django", "organization", "branches", orgId ?? null] as const,
    queryFn: () => getBranches(orgId),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const [dialog, setDialog] = React.useState<{ bot: DealBot | null } | null>(null);
  const [issueFor, setIssueFor] = React.useState<DealBot | null>(null);
  const [issued, setIssued] = React.useState<DealBotIssuedKey | null>(null);
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const invalidateBots = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.bots(orgId) });

  const botMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "create"; payload: { name: string; color: string; branchId?: number } }
        | {
            kind: "update";
            id: number;
            payload: { name?: string; color?: string; isActive?: boolean; branchId?: number; clearBranch?: boolean };
          },
    ): Promise<DealBot> => {
      if (action.kind === "create") return createBot(action.payload, orgId);
      return updateBot(action.id, action.payload, orgId);
    },
    onSuccess: (_bot, action) => {
      onToast({ text: action.kind === "create" ? t("settings.botCreated") : t("settings.saved"), severity: "success" });
      invalidateBots();
    },
    onError: (error) => onToast({ text: dealsErrorMessage(error, t("settings.saveError")), severity: "error" }),
  });

  const issueMutation = useMutation({
    mutationFn: ({ bot, label }: { bot: DealBot; label: string }) => issueBotKey(bot.id, { label }, orgId),
    onSuccess: (res, { bot }) => {
      setIssueFor(null);
      setIssued(res);
      setExpanded(bot.id);
      invalidateBots();
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.botKeys(bot.id, orgId) });
    },
    onError: (error) => onToast({ text: dealsErrorMessage(error, t("settings.saveError")), severity: "error" }),
  });

  const bots = botsQuery.data ?? [];

  return (
    <Stack gap={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">{t("settings.bots")}</Typography>
        <AppButton size="small" startIcon={<AddOutlined />} onClick={() => setDialog({ bot: null })}>
          {t("settings.botAdd")}
        </AppButton>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {t("settings.botsHint")}
      </Typography>

      <Stack gap={0.75}>
        {bots.map((bot) => (
          <Box
            key={bot.id}
            sx={{ borderRadius: 2, bgcolor: subtleBg(theme), opacity: bot.isActive ? 1 : 0.6 }}
          >
            <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1.25, py: 1 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bgcolor: bot.color,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <SmartToyOutlined sx={{ fontSize: 16 }} />
              </Box>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {bot.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {bot.branchName ?? t("settings.botBranchAny")} ·{" "}
                  {t("settings.botKeysCount", { count: bot.activeKeysCount })} ·{" "}
                  {bot.lastUsedAt
                    ? t("settings.botLastUsed", { value: relativeTime(bot.lastUsedAt) })
                    : t("settings.botNeverUsed")}
                </Typography>
              </Stack>
              {!bot.isActive ? (
                <Chip size="small" variant="outlined" label={t("settings.botInactive")} />
              ) : null}
              <Tooltip title={t("settings.botKeyIssue")}>
                <IconButton size="small" onClick={() => setIssueFor(bot)} disabled={!bot.isActive}>
                  <KeyOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("settings.botEdit")}>
                <IconButton size="small" onClick={() => setDialog({ bot })}>
                  <SettingsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("settings.botKeys")}>
                <IconButton
                  size="small"
                  onClick={() => setExpanded((cur) => (cur === bot.id ? null : bot.id))}
                  sx={{
                    transform: expanded === bot.id ? "rotate(180deg)" : "none",
                    transition: "transform .15s ease",
                  }}
                >
                  <ExpandMoreOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Collapse in={expanded === bot.id} unmountOnExit>
              <BotKeysList bot={bot} orgId={orgId} onToast={onToast} />
            </Collapse>
          </Box>
        ))}
        {bots.length === 0 && !botsQuery.isLoading ? (
          <Typography variant="body2" color="text.disabled">
            {t("settings.botsEmpty")}
          </Typography>
        ) : null}
      </Stack>

      <BotDialog
        open={dialog != null}
        bot={dialog?.bot ?? null}
        branches={(branchesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name }))}
        busy={botMutation.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(payload) => {
          if (dialog?.bot) {
            botMutation.mutate({
              kind: "update",
              id: dialog.bot.id,
              payload: {
                name: payload.name,
                color: payload.color,
                isActive: payload.isActive,
                ...(payload.branchId != null ? { branchId: payload.branchId } : { clearBranch: true }),
              },
            });
          } else {
            botMutation.mutate({
              kind: "create",
              payload: {
                name: payload.name,
                color: payload.color,
                ...(payload.branchId != null ? { branchId: payload.branchId } : {}),
              },
            });
          }
          setDialog(null);
        }}
      />

      <IssueKeyDialog
        bot={issueFor}
        busy={issueMutation.isPending}
        onClose={() => setIssueFor(null)}
        onSubmit={(label) => issueFor && issueMutation.mutate({ bot: issueFor, label })}
      />

      <SecretDialog issued={issued} onClose={() => setIssued(null)} onToast={onToast} />
    </Stack>
  );
};

/** Ключи одного бота: префикс, статус, срок, отзыв. Секретов здесь нет. */
const BotKeysList: React.FC<{ bot: DealBot; orgId: number | undefined; onToast: (t: Toast) => void }> = ({
  bot,
  orgId,
  onToast,
}) => {
  const { t } = useT("deals");
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = React.useState<DealBotKey | null>(null);

  const keysQuery = useQuery({
    queryKey: djangoQueryKeys.deals.botKeys(bot.id, orgId),
    queryFn: ({ signal }) => getBotKeys(bot.id, orgId, signal),
  });

  const revokeMutation = useMutation({
    mutationFn: (key: DealBotKey) => revokeBotKey(bot.id, key.id, orgId),
    onSuccess: () => {
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.botKeys(bot.id, orgId) });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.bots(orgId) });
    },
    onError: (error) => onToast({ text: dealsErrorMessage(error, t("settings.saveError")), severity: "error" }),
  });

  const keys = keysQuery.data ?? [];

  return (
    <Stack gap={0.5} sx={{ px: 1.25, pb: 1.25, pl: 5.75 }}>
      {keys.map((key) => (
        <Stack key={key.id} direction="row" alignItems="center" gap={1} sx={{ opacity: key.isActive ? 1 : 0.55 }}>
          <Typography variant="body2" sx={{ minWidth: 0, flex: 1 }} noWrap>
            {key.label}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
            {key.prefix}…
          </Typography>
          <Typography variant="caption" color="text.disabled" noWrap>
            {key.lastUsedAt ? relativeTime(key.lastUsedAt) : t("settings.botNeverUsed")}
          </Typography>
          {key.expiresAt ? (
            <Typography variant="caption" color="text.disabled" noWrap>
              {t("settings.botKeyExpires")}: {exactMoment(key.expiresAt)}
            </Typography>
          ) : null}
          {key.isActive ? (
            <AppButton size="small" variant="text" color="error" onClick={() => setConfirm(key)}>
              {t("settings.botKeyRevoke")}
            </AppButton>
          ) : (
            <Chip size="small" variant="outlined" label={t("settings.botKeyRevoked")} />
          )}
        </Stack>
      ))}
      {keys.length === 0 && !keysQuery.isLoading ? (
        <Typography variant="caption" color="text.disabled">
          {t("settings.botKeysEmpty")}
        </Typography>
      ) : null}

      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && revokeMutation.mutate(confirm)}
        title={t("settings.botKeyRevoke")}
        message={t("settings.botKeyRevokeConfirm", { label: confirm?.label ?? "" })}
        confirmText={t("settings.botKeyRevoke")}
        variant="error"
        loading={revokeMutation.isPending}
      />
    </Stack>
  );
};

type BotForm = { name: string; color: string; branchId: number | null; isActive: boolean };

const BotDialog: React.FC<{
  open: boolean;
  bot: DealBot | null;
  branches: { id: number; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: BotForm) => void;
}> = ({ open, bot, branches, busy, onClose, onSubmit }) => {
  const { t } = useT("deals");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(BOT_COLORS[0]);
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setName(bot?.name ?? "");
    setColor(bot?.color ?? BOT_COLORS[0]);
    setBranchId(bot?.branchId ?? "");
    setIsActive(bot?.isActive ?? true);
  }, [open, bot]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, branchId: branchId === "" ? null : branchId, isActive });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>{bot ? t("settings.botEdit") : t("settings.botAdd")}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 0.5 }}>
          <TextField
            size="small"
            label={t("settings.botName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
          />
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {BOT_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => setColor(c)}
                role="button"
                aria-label={`${t("settings.botColor")} ${c}`}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  bgcolor: c,
                  cursor: "pointer",
                  outline: color === c ? "2px solid" : "none",
                  outlineColor: "text.primary",
                  outlineOffset: 2,
                }}
              />
            ))}
          </Stack>
          <TextField
            select
            size="small"
            label={t("settings.botBranch")}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value === "" ? "" : Number(e.target.value))}
            fullWidth
          >
            <MenuItem value="">{t("settings.botBranchAny")}</MenuItem>
            {branches.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
          {bot ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              <Switch size="small" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <Tooltip title={t("settings.botInactiveHint")}>
                <Typography variant="body2">{t("settings.botActive")}</Typography>
              </Tooltip>
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          {t("settings.cancel")}
        </AppButton>
        <AppButton onClick={submit} disabled={busy || !name.trim()}>
          {t("settings.save")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

const IssueKeyDialog: React.FC<{
  bot: DealBot | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (label: string) => void;
}> = ({ bot, busy, onClose, onSubmit }) => {
  const { t } = useT("deals");
  const [label, setLabel] = React.useState("");
  React.useEffect(() => {
    if (bot) setLabel("");
  }, [bot]);

  return (
    <Dialog open={bot != null} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        {t("settings.botKeyIssue")} · {bot?.name}
      </DialogTitle>
      <DialogContent>
        <TextField
          size="small"
          label={t("settings.botKeyLabel")}
          helperText={t("settings.botKeyLabelHint")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && label.trim()) onSubmit(label.trim());
          }}
          autoFocus
          fullWidth
          sx={{ mt: 0.5 }}
        />
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={busy}>
          {t("settings.cancel")}
        </AppButton>
        <AppButton onClick={() => onSubmit(label.trim())} disabled={busy || !label.trim()}>
          {t("settings.botKeyIssue")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Единственный показ секрета. Закрыть можно только осознанно: клик мимо
 * диалога не закрывает его, чтобы ключ не пропал по неосторожности.
 */
const SecretDialog: React.FC<{
  issued: DealBotIssuedKey | null;
  onClose: () => void;
  onToast: (t: Toast) => void;
}> = ({ issued, onClose, onToast }) => {
  const { t } = useT("deals");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.secret);
      onToast({ text: t("settings.botKeyCopied"), severity: "success" });
    } catch {
      // Clipboard API недоступен (http, старый браузер): выделяем текст,
      // пользователь копирует сам.
      inputRef.current?.select();
    }
  };

  return (
    <Dialog open={issued != null} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        {t("settings.botKeySecretTitle")}
        {issued ? ` · ${issued.key.label}` : ""}
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t("settings.botKeySecretHint")}
          </Typography>
          <Stack direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              value={issued?.secret ?? ""}
              inputRef={inputRef}
              onFocus={(e) => e.target.select()}
              InputProps={{ readOnly: true, sx: { fontFamily: "monospace", fontSize: 13 } }}
              fullWidth
            />
            <Tooltip title={t("settings.botKeyCopy")}>
              <IconButton onClick={copy}>
                <ContentCopyOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton onClick={onClose}>{t("settings.close")}</AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default BotsSection;
