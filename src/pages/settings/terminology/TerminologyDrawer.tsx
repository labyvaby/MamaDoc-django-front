import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";

import { AppButton } from "../../../components/ui/AppButton";
import { useT } from "../../../i18n/VerticalProvider";
import {
  changedTermKeys,
  type GlossaryOverrides,
} from "../../../i18n/glossaryOverrides";
import { VERTICAL_LABELS } from "../../../i18n/glossary";
import {
  TERM_KEYS,
  type Glossary,
  type TermForms,
  type TermKey,
  type Vertical,
} from "../../../i18n/types";
import TermEditorDialog from "./TermEditorDialog";

export type TerminologyDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Вертикаль организации — её профиль служит основой и точкой сброса. */
  vertical: Vertical;
  /** Профиль вертикали без оверрайдов. */
  base: Glossary;
  /** Сохранённая терминология организации. */
  value: GlossaryOverrides;
  onSave: (next: GlossaryOverrides) => Promise<void>;
  saving: boolean;
  saveError: string | null;
};

/**
 * Конструктор терминологии организации.
 *
 * Слева от каждого термина — его роль в интерфейсе, справа — слово, которым
 * организация его называет. Изменённые термины помечаются чипом, чтобы было
 * видно, что именно уехало от профиля вертикали.
 *
 * Черновик живёт в стейте дровера и уходит на бэкенд одним PATCH: пока
 * пользователь перебирает слова, интерфейс вокруг не должен переименовываться
 * у него под руками.
 */
export const TerminologyDrawer: React.FC<TerminologyDrawerProps> = ({
  open,
  onClose,
  vertical,
  base,
  value,
  onSave,
  saving,
  saveError,
}) => {
  const { t } = useT("settings");

  const [draft, setDraft] = React.useState<GlossaryOverrides>(value);
  const [editing, setEditing] = React.useState<TermKey | null>(null);

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const changed = changedTermKeys(base, draft);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(value) && !saving;

  const current = (key: TermKey): TermForms => draft[key] ?? base[key];

  const handleApply = (key: TermKey, forms: TermForms) => {
    setDraft((prev) => {
      const next = { ...prev };
      // Слово, совпавшее с профилем, оверрайдом не считается — иначе в
      // themeConfig копится мусор, а чип «изменено» врёт.
      const same =
        forms.gender === base[key].gender &&
        Object.entries(base[key]).every(
          ([formKey, formValue]) =>
            forms[formKey as keyof TermForms] === formValue,
        );
      if (same) delete next[key];
      else next[key] = forms;
      return next;
    });
    setEditing(null);
  };

  const handleResetTerm = (key: TermKey) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditing(null);
  };

  const handleResetAll = () => setDraft({});

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={saving ? undefined : onClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 480, md: 560 },
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2.5, py: 2 }}
        >
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("terminology.drawerTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("terminology.basedOn", { profile: VERTICAL_LABELS[vertical] })}
            </Typography>
          </Box>
          <IconButton onClick={onClose} disabled={saving} size="small">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">{t("terminology.drawerHint")}</Alert>

            <Stack spacing={0}>
              {TERM_KEYS.map((key, index) => {
                const forms = current(key);
                const isChanged = changed.includes(key);
                return (
                  <Box
                    key={key}
                    onClick={() => setEditing(key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setEditing(key);
                    }}
                    sx={(theme) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.25,
                      cursor: "pointer",
                      borderTop:
                        index === 0 ? "none" : `1px solid ${theme.palette.divider}`,
                      "&:hover": { bgcolor: theme.palette.action.hover },
                    })}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {forms.nom}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {t(`terminology.terms.${key}.label`)}
                      </Typography>
                    </Box>
                    {isChanged && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="primary"
                        label={t("terminology.changedChip")}
                      />
                    )}
                    <EditOutlined fontSize="small" color="action" />
                  </Box>
                );
              })}
            </Stack>

            {saveError && <Alert severity="error">{saveError}</Alert>}
          </Stack>
        </Box>

        <Divider />
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 2.5, py: 2 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            {changed.length > 0
              ? t("terminology.changedCount", { count: changed.length })
              : t("terminology.noChanges")}
          </Typography>
          <AppButton
            color="inherit"
            startIcon={<RestartAltOutlined fontSize="small" />}
            onClick={handleResetAll}
            disabled={saving || changed.length === 0}
          >
            {t("terminology.resetAll")}
          </AppButton>
          <AppButton
            variant="contained"
            onClick={() => onSave(draft)}
            disabled={!dirty}
            loading={saving}
          >
            {t("common:actions.save")}
          </AppButton>
        </Stack>
      </Drawer>

      {editing && (
        <TermEditorDialog
          open
          termKey={editing}
          base={base[editing]}
          value={current(editing)}
          onClose={() => setEditing(null)}
          onApply={(forms) => handleApply(editing, forms)}
          onReset={() => handleResetTerm(editing)}
        />
      )}
    </>
  );
};

export default TerminologyDrawer;
