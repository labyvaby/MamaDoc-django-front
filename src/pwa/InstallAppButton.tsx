import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  type ButtonProps,
} from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import InstallMobileOutlined from "@mui/icons-material/InstallMobileOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";

import { useT } from "../i18n/VerticalProvider";
import { useInstallPrompt } from "./useInstallPrompt";
import { detectInAppBrowser } from "./installPrompt";

/**
 * Кнопка «Установить приложение» — добавляет иконку сайта на главный экран
 * телефона.
 *
 * Где браузер даёт системный диалог (Chrome, Edge, Android), кнопка открывает
 * его сразу. Где не даёт (Safari на iPhone, Firefox) — показывает инструкцию по
 * шагам: другого пути на этих платформах нет, установка делается только руками
 * через меню браузера.
 *
 * Если приложение уже установлено или страница открыта с домашнего экрана,
 * компонент не рендерит ничего.
 */
export interface InstallAppButtonProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  color?: ButtonProps["color"];
  fullWidth?: boolean;
  /** Короткая подпись — для тесной шапки витрины. */
  compact?: boolean;
  /**
   * На телефоне оставить одну иконку без подписи (шапка витрины, где кнопка
   * соседствует с логотипом и входом). Граница — `md`: в теме приложения
   * `sm` начинается с 360px, то есть телефон в неё уже попадает.
   */
  responsiveLabel?: boolean;
  /**
   * Показывать кнопку и на десктопе, когда браузер не дал приглашение. По
   * умолчанию в этом случае кнопка скрыта: инструкция «найдите значок в адресной
   * строке» случайному гостю бесполезна. В CRM, где сотрудник открывает раздел
   * специально, — наоборот, показываем.
   */
  showWithoutPromptOnDesktop?: boolean;
  sx?: SxProps<Theme>;
}

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({
  variant = "outlined",
  size = "small",
  color,
  fullWidth,
  compact,
  responsiveLabel,
  showWithoutPromptOnDesktop,
  sx,
}) => {
  const { t } = useT("common");
  const { mode, platform, install } = useInstallPrompt();
  const [guideOpen, setGuideOpen] = React.useState(false);

  if (mode === "hidden") return null;
  if (mode === "manual" && platform === "desktop" && !showWithoutPromptOnDesktop) return null;

  const handleClick = async () => {
    // В режиме prompt диалог может не открыться (приглашение сгорело) — тогда
    // показываем инструкцию, чтобы клик не остался без реакции.
    if (mode === "prompt") {
      const accepted = await install();
      if (accepted) return;
      return;
    }
    setGuideOpen(true);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size={size}
        color={color}
        fullWidth={fullWidth}
        startIcon={<InstallMobileOutlined />}
        aria-label={t("install.action")}
        sx={{
          whiteSpace: "nowrap",
          ...(responsiveLabel
            ? {
                minWidth: 0,
                px: { xs: 1, md: 2 },
                "& .MuiButton-startIcon": {
                  mr: { xs: 0, md: 1 },
                  ml: { xs: 0, md: -0.5 },
                },
              }
            : null),
          ...sx,
        }}
      >
        <Box
          component="span"
          sx={responsiveLabel ? { display: { xs: "none", md: "inline" } } : undefined}
        >
          {compact ? t("install.actionShort") : t("install.action")}
        </Box>
      </Button>

      <InstallGuideDialog
        open={guideOpen}
        platform={platform}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
};

/** Инструкция по шагам для платформ без системного диалога установки. */
const InstallGuideDialog: React.FC<{
  open: boolean;
  platform: "ios" | "android" | "desktop";
  onClose: () => void;
}> = ({ open, platform, onClose }) => {
  const { t } = useT("common");
  const [copied, setCopied] = React.useState(false);
  const inApp = React.useMemo(detectInAppBrowser, []);

  const steps = [
    t(`install.${platform}Step1`),
    t(`install.${platform}Step2`),
    t(`install.${platform}Step3`),
  ];
  // Из встроенного браузера соцсети установка невозможна в принципе — первым
  // шагом отправляем в настоящий браузер, иначе остальные шаги бессмысленны.
  if (inApp) steps.unshift(t("install.inAppBrowserStep"));

  // На iPhone установка есть только в Safari: Chrome и Firefox там работают на
  // движке WebKit, но пункта «На экран „Домой“» в их меню нет.
  const isIosNonSafari = platform === "ios" && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Буфер обмена недоступен (нет разрешения, старый браузер) — шаги с
      // «Открыть в Safari» работают и без копирования.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{t("install.title")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t("install.subtitle")}
        </Typography>

        {inApp && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            {t("install.inAppBrowser", { app: inApp })}
          </Alert>
        )}

        {isIosNonSafari && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            {t("install.iosSafariOnly")}
          </Alert>
        )}

        {/* Ссылку на запись присылают в мессенджере: на iPhone она откроется во
            встроенном браузере, который своей меткой в user-agent не
            представляется, — поэтому предупреждаем всех, а не только inApp. */}
        {platform === "ios" && !inApp && !isIosNonSafari && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            {t("install.iosSafariRequired")}
          </Alert>
        )}

        <Typography variant="body2" sx={{ mt: 2, mb: 1.5, fontWeight: 600 }}>
          {t("install.manualHint")}
        </Typography>

        <Stack spacing={1.25}>
          {steps.map((step, index) => (
            <Stack key={step} direction="row" spacing={1.25} alignItems="flex-start">
              <Box
                sx={(theme) => ({
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                })}
              >
                {index + 1}
              </Box>
              <Typography variant="body2">{step}</Typography>
            </Stack>
          ))}
        </Stack>

        {copied && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }}>
            {t("install.linkCopied")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {inApp && (
          <Button onClick={copyLink} startIcon={<ContentCopyOutlined />}>
            {t("install.copyLink")}
          </Button>
        )}
        <Button onClick={onClose}>{t("install.done")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default InstallAppButton;
