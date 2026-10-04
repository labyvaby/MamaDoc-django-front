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
import { consentMenu } from "./consentMenu";

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
  /**
   * «Нет» из плашки: запись не начинается — «Весь приём» гаснет с подписью
   * «пациент отказался». Ответ уйдёт на сервер вместе с диктовкой, если
   * врач её выберет (отдельной отметки согласия у врача может не быть).
   */
  const [refused, setRefused] = React.useState(false);
  // Сервер прислал другое согласие (отметили в карточке) — ответ из меню устарел.
  React.useEffect(() => setRefused(false), [consent]);
  const menu = consentMenu(consent, refused);
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
        <MenuItem disabled={!menu.visitEnabled} onClick={() => pick("visit")}>
          <ListItemIcon>
            <GroupsOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t("menu.visit")}
            secondary={menu.shown === "no" ? t("menu.visitRefused") : t("menu.visitHint")}
          />
        </MenuItem>
        {menu.askConsent && (
          <Alert severity="warning" sx={{ mx: 1.5, my: 0.5, maxWidth: 320 }}>
            {t("menu.consentQuestion")}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="contained" onClick={() => pick("visit", "yes")}>
                {t("menu.consentYes")}
              </Button>
              <Button size="small" onClick={() => setRefused(true)}>
                {t("menu.consentNo")}
              </Button>
            </Stack>
          </Alert>
        )}
        {/* Отказ, отмеченный в меню, уходит вместе с диктовкой и сохраняется. */}
        <MenuItem onClick={() => pick("dictation", menu.dictationConsent)}>
          <ListItemIcon>
            <RecordVoiceOverOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("menu.dictation")} secondary={t("menu.dictationHint")} />
        </MenuItem>
      </Menu>
    </>
  );
};
