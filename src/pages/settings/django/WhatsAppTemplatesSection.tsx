import React from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, MenuItem, Pagination, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNotificationTemplatePreset, getWhatsAppTemplateLibrary, saveWhatsAppTemplate,
  submitWhatsAppTemplate, syncWhatsAppTemplate,
  type NotificationTemplatePreset, type WhatsAppTemplate, type WhatsAppTemplateInput,
} from "../../../api/notifications";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";

const EVENTS = ["created_10m", "reminder_2h", "rescheduled_10m", "appointment_change", "appointment_cancel", "appointment_cancel_doctor_absent"];

type Editor = WhatsAppTemplateInput & { id?: number; shared: boolean; code: string };

export const WhatsAppTemplatesSection: React.FC<{ organizationId: number }> = ({ organizationId }) => {
  const { t } = useT("settings");
  const label = (key: string) => t(`whatsappTemplates.${key}`);
  const client = useQueryClient();
  const [tab, setTab] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [feedback, setFeedback] = React.useState<{ severity: "success" | "error"; text: string } | null>(null);
  const library = useQuery({
    queryKey: djangoQueryKeys.notifications.templates(organizationId, page, debouncedSearch),
    queryFn: ({ signal }) => getWhatsAppTemplateLibrary(organizationId, signal, page, debouncedSearch),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: djangoQueryKeys.notifications.templates(organizationId) });
    await client.invalidateQueries({ queryKey: ["django", "notifications", "settings"] });
  };
  const failure = (error: unknown) => setFeedback({ severity: "error", text: error instanceof Error ? error.message : label("error") });
  const save = useMutation({
    mutationFn: async (draft: Editor): Promise<WhatsAppTemplate | NotificationTemplatePreset> => draft.shared
      ? createNotificationTemplatePreset({ code: draft.code, title: draft.title, body: draft.body, notificationType: draft.notificationType, language: draft.language })
      : saveWhatsAppTemplate({ organizationId, name: draft.name, title: draft.title, body: draft.body, notificationType: draft.notificationType, language: draft.language, presetId: draft.presetId }, draft.id),
    onSuccess: async (_data, draft) => {
      setEditor(null);
      setPage(1);
      setSearch("");
      setTab(draft.shared ? 0 : 1);
      setFeedback({ severity: "success", text: label(draft.shared ? "sharedSaved" : "draftSaved") });
      await refresh();
    },
    onError: failure,
  });
  const action = useMutation({
    mutationFn: ({ row, sync }: { row: WhatsAppTemplate; sync: boolean }) => sync
      ? syncWhatsAppTemplate(row.id, organizationId) : submitWhatsAppTemplate(row.id, organizationId),
    onSuccess: async (row) => {
      setFeedback({ severity: "success", text: `${label("statusUpdated")}: ${label(`status.${row.status}`)}` });
      await refresh();
    },
    onError: async (error) => { failure(error); await refresh(); },
  });

  const start = (preset?: NotificationTemplatePreset, shared = false) => {
    setFeedback(null);
    setEditor({
      organizationId, shared, code: "", name: preset ? `${preset.code}_${preset.language}` : "",
      title: preset?.title ?? "", body: preset?.body ?? "", notificationType: preset?.notificationType ?? EVENTS[0],
      language: preset?.language ?? "ru", presetId: preset?.id,
    });
  };
  const update = (patch: Partial<Editor>) => setEditor((previous) => previous ? { ...previous, ...patch } : previous);
  const examples = library.data?.variableExamples ?? {};
  const preview = editor?.body.replace(/{{\s*([a-z_]+)\s*}}/g, (source, name: string) => examples[name] ?? source) ?? "";
  const matches = (row: { title: string; body: string }) => `${row.title} ${row.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const presets = library.data?.presets.filter(matches) ?? [];
  const templates = library.data?.templates.filter(matches) ?? [];

  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h6">{label("title")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "70ch" }}>{label("description")}</Typography>
        </Box>
        <Button startIcon={<AddOutlined />} onClick={() => start(undefined, tab === 0)} disabled={Boolean(editor)} sx={{ flexShrink: 0 }}>
          {label(tab === 0 ? "addShared" : "addDraft")}
        </Button>
      </Stack>
      {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)} role="status">{feedback.text}</Alert>}
      {library.isError && <Alert severity="error" action={<Button onClick={() => void library.refetch()}>{label("retry")}</Button>}>
        {library.error instanceof Error ? library.error.message : label("error")}
      </Alert>}
      {library.isPending ? <CircularProgress size={24} aria-label={label("loading")} /> : library.data && <>
        {!library.data.canSubmit && <Alert severity="info">{library.data.unavailableReason}</Alert>}
        <Tabs value={tab} onChange={(_event, value: number) => { setTab(value); setPage(1); }} variant="scrollable" allowScrollButtonsMobile>
          <Tab label={label("sharedTab")} /><Tab label={label("organizationTab")} />
        </Tabs>
        {editor ? <Stack spacing={2} component="form" onSubmit={(event) => { event.preventDefault(); save.mutate(editor); }}>
          <Typography fontWeight={600}>{label(editor.shared ? "sharedEditor" : "draftEditor")}</Typography>
          {editor.shared && <Alert severity="info">{label("sharedHint")}</Alert>}
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth required label={label("displayName")} value={editor.title} onChange={(event) => update({ title: event.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} disabled={save.isPending} />
            <TextField fullWidth required label={label(editor.shared ? "code" : "metaName")} value={editor.shared ? editor.code : editor.name} onChange={(event) => update(editor.shared ? { code: event.target.value } : { name: event.target.value })} helperText={label("nameHint")} slotProps={{ htmlInput: { maxLength: 128, pattern: "[a-z][a-z0-9_]*" } }} disabled={save.isPending} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select fullWidth label={label("event")} value={editor.notificationType} onChange={(event) => update({ notificationType: event.target.value })} disabled={save.isPending}>
              {EVENTS.map((value) => <MenuItem key={value} value={value}>{label(`events.${value}`)}</MenuItem>)}
            </TextField>
            <TextField select label={label("language")} value={editor.language} onChange={(event) => update({ language: event.target.value })} sx={{ minWidth: 180 }} disabled={save.isPending}>
              <MenuItem value="ru">{label("russian")}</MenuItem><MenuItem value="en_US">{label("english")}</MenuItem>
            </TextField>
          </Stack>
          <TextField multiline minRows={4} required fullWidth label={label("body")} value={editor.body} onChange={(event) => update({ body: event.target.value })} helperText={`${editor.body.length}/1024 · ${label("utilityHint")}`} slotProps={{ htmlInput: { maxLength: 1024 } }} disabled={save.isPending} />
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {Object.keys(examples).map((name) => <Chip key={name} variant="outlined" label={label(`variables.${name}`)} onClick={() => update({ body: `${editor.body} {{${name}}}` })} disabled={save.isPending || editor.body.length + name.length + 5 > 1024} />)}
          </Stack>
          <Box sx={{ bgcolor: "action.hover", p: 2, borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">{label("previewHint")}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1, maxWidth: "70ch", overflowWrap: "anywhere" }}>{preview || label("previewEmpty")}</Typography>
          </Box>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setEditor(null)} disabled={save.isPending}>{label("cancel")}</Button>
            <Button type="submit" variant="contained" disabled={save.isPending || !editor.title.trim() || !editor.body.trim()} startIcon={save.isPending ? <CircularProgress size={18} /> : undefined}>
              {label(editor.shared ? "saveShared" : "saveDraft")}
            </Button>
          </Stack>
        </Stack> : <>
          <TextField size="small" label={label("search")} value={search} onChange={(event) => setSearch(event.target.value)} />
          {tab === 0 ? <Stack divider={<Divider />}>
            {presets.length === 0 && <Typography color="text.secondary" sx={{ py: 2 }}>{label("emptySearch")}</Typography>}
            {presets.map((preset) => <Stack key={preset.id} direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" sx={{ py: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={600}>{preset.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "70ch", overflowWrap: "anywhere" }}>{preset.body}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => start(preset)} sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "center" } }}>{label("usePreset")}</Button>
            </Stack>)}
          </Stack> : <Stack divider={<Divider />}>
            {templates.length === 0 && <Typography color="text.secondary" sx={{ py: 2 }}>{label(search ? "emptySearch" : "emptyTemplates")}</Typography>}
            {templates.map((row) => <Stack key={row.id} spacing={1.5} sx={{ py: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
                <Box><Typography fontWeight={600}>{row.title}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{row.name} · {row.language}</Typography></Box>
                <Chip size="small" label={row.status === "APPROVED" && !row.ready ? label("waitingRoute") : label(`status.${row.status}`)} color={row.ready ? "success" : row.status === "REJECTED" ? "error" : "default"} sx={{ alignSelf: "flex-start" }} />
              </Stack>
              <Typography variant="body2" sx={{ maxWidth: "70ch", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{row.body}</Typography>
              {row.rejectionReason && <Alert severity="warning">{row.rejectionReason}</Alert>}
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {row.status === "DRAFT" && <Button onClick={() => setEditor({ ...row, shared: false, code: "", organizationId })}>{label("edit")}</Button>}
                <Button onClick={() => setEditor({ ...row, id: undefined, name: `${row.name.slice(0, 125)}_v2`, shared: false, code: "", organizationId })}>{label("copy")}</Button>
                {["DRAFT", "SUBMITTING"].includes(row.status) ? <Button variant="outlined" disabled={!library.data?.canSubmit || action.isPending} onClick={() => action.mutate({ row, sync: false })}>
                  {label(row.status === "SUBMITTING" ? row.managementProvider === "meta" ? "checkSubmission" : "retrySubmit" : "submit")}
                </Button> : <Button startIcon={<RefreshOutlined />} disabled={!library.data?.canSubmit || action.isPending} onClick={() => action.mutate({ row, sync: true })}>{label("refreshStatus")}</Button>}
              </Stack>
            </Stack>)}
          </Stack>}
          {(tab === 0 ? library.data.presetCount : library.data.templateCount) > 50 && <Pagination
            count={Math.ceil((tab === 0 ? library.data.presetCount : library.data.templateCount) / 50)}
            page={page} onChange={(_event, value) => setPage(value)} />}
        </>}
      </>}
    </Stack>
  </Paper>;
};
