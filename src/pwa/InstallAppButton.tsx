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
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { useT } from "../i18n/VerticalProvider";
import { useInstallPrompt } from "./useInstallPrompt";
import { detectInAppBrowser, getOpenInSafariUrl } from "./installPrompt";
import { InstallStepArt, type InstallStepArtKind } from "./installStepArt";

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

  // Картинка к каждому шагу: словами «значок „Поделиться“» и «три точки» на
  // незнакомом экране ищутся долго, схема экрана с подсветкой — сразу.
  const stepArt: Record<"ios" | "android" | "desktop", InstallStepArtKind[]> = {
    ios: ["iosShare", "iosAddToHome", "homeScreen"],
    android: ["androidMenu", "androidInstall", "homeScreen"],
    desktop: ["desktopAddressBar", "desktopMenu", "desktopWindow"],
  };

  const steps: Array<{ text: string; art: InstallStepArtKind }> = [1, 2, 3].map((n, index) => ({
    text: t(`install.${platform}Step${n}`),
    art: stepArt[platform][index],
  }));
  // Из встроенного браузера соцсети установка невозможна в принципе — первым
  // шагом отправляем в настоящий браузер, иначе остальные шаги бессмысленны.
  if (inApp) steps.unshift({ text: t("install.inAppBrowserStep"), art: "openInSafari" });

  // Прямой переход в Safari (только iOS) — сокращает ручные шаги, но срабатывает
  // не в каждом встроенном браузере, поэтому инструкцию не заменяет.
  const safariUrl = React.useMemo(getOpenInSafariUrl, []);

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

        <Stack spacing={1}>
          {steps.map((step, index) => (
            <Stack
              key={step.text}
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={(theme) => ({
                p: 1,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
              })}
            >
              <Box
                sx={{
                  position: "relative",
                  flexShrink: 0,
                  lineHeight: 0,
                }}
              >
                <InstallStepArt kind={step.art} />
                <Box
                  sx={(theme) => ({
                    position: "absolute",
                    top: -4,
                    left: -4,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "primary.main",
                    // Непрозрачный фон: иначе цифра сливается с картинкой шага.
                    bgcolor: "background.paper",
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                  })}
                >
                  {index + 1}
                </Box>
              </Box>
              <Typography variant="body2">{step.text}</Typography>
            </Stack>
          ))}
        </Stack>

        {safariUrl && (
          <Button
            component="a"
            href={safariUrl}
            fullWidth
            variant="outlined"
            startIcon={<OpenInNewOutlined />}
            sx={{ mt: 2 }}
          >
            {t("install.openInSafari")}
          </Button>
        )}

        {safariUrl && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
            {t("install.openInSafariHint")}
          </Typography>
        )}

        {copied && (
          <Alert severity="success" variant="outlined" sx={{ mt: 2 }}>
            {t("install.linkCopied")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {(inApp || safariUrl) && (
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
