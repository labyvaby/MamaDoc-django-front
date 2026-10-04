import React from "react";
import {
  Alert,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
} from "@mui/material";
import MicNoneOutlined from "@mui/icons-material/MicNoneOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import RecordVoiceOverOutlined from "@mui/icons-material/RecordVoiceOverOutlined";

import type { ScribeConsent, ScribeMode } from "../api/scribe";
import { useT } from "../i18n/VerticalProvider";

/**
 * Кнопка «Запись» в шапке окна заключения: меню «весь приём / надиктовать».
 * «Весь приём» — только с согласием пациента; «не спрашивали» — врач
 * отмечает ответ прямо в меню, и он уходит вместе со стартом записи.
 */
export const ScribeHeaderButton: React.FC<{
  consent: ScribeConsent;
  compact?: boolean;
  disabled?: boolean;
  onStart: (mode: ScribeMode, consent?: "yes" | "no") => void;
}> = ({ consent, compact, disabled, onStart }) => {
  const { t } = useT("scribe");
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const pick = (mode: ScribeMode, answer?: "yes" | "no") => {
    close();
    onStart(mode, answer);
  };
  const icon = <MicNoneOutlined fontSize="small" />;
  return (
    <>
      <Tooltip title={t("tooltip")}>
        <span>
          {compact ? (
            <IconButton
              size="small"
              color="primary"
              aria-label={t("button")}
              disabled={disabled}
              onClick={(e) => setAnchor(e.currentTarget)}
            >
              {icon}
            </IconButton>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={icon}
              disabled={disabled}
              onClick={(e) => setAnchor(e.currentTarget)}
              sx={{ whiteSpace: "nowrap" }}
            >
              {t("button")}
            </Button>
          )}
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor != null} onClose={close}>
        <MenuItem disabled={consent !== "yes"} onClick={() => pick("visit")}>
          <ListItemIcon>
            <GroupsOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t("menu.visit")}
            secondary={consent === "no" ? t("menu.visitRefused") : t("menu.visitHint")}
          />
        </MenuItem>
        {consent === "unknown" && (
          <Alert severity="warning" sx={{ mx: 1.5, my: 0.5, maxWidth: 320 }}>
            {t("menu.consentQuestion")}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="contained" onClick={() => pick("visit", "yes")}>
                {t("menu.consentYes")}
              </Button>
              {/* «Нет» сохраняется вместе со стартом диктовки: отдельной
                  отметки согласия у врача может не быть (scribe.consent.set). */}
              <Button size="small" onClick={() => pick("dictation", "no")}>
                {t("menu.consentNo")}
              </Button>
            </Stack>
          </Alert>
        )}
        <MenuItem onClick={() => pick("dictation")}>
          <ListItemIcon>
            <RecordVoiceOverOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("menu.dictation")} secondary={t("menu.dictationHint")} />
        </MenuItem>
      </Menu>
    </>
  );
};
