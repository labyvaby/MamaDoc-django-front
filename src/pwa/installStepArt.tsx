import React from "react";
import { useTheme, alpha } from "@mui/material/styles";

import { subtleBg } from "../theme";

/**
 * Картинки к шагам инструкции по установке приложения.
 *
 * Скриншотами это не решить: экраны отличаются у каждой версии iOS/Android и у
 * каждого браузера, а картинки пришлось бы держать в двух темах и обновлять
 * руками. Поэтому шаги рисуем схематично — телефон/окно браузера и подсвеченный
 * акцентом элемент, который нужно нажать. Цвета — только токены темы.
 */
export type InstallStepArtKind =
  | "iosShare"
  | "iosAddToHome"
  | "homeScreen"
  | "androidMenu"
  | "androidInstall"
  | "desktopAddressBar"
  | "desktopMenu"
  | "desktopWindow"
  | "openInSafari";

export const InstallStepArt: React.FC<{ kind: InstallStepArtKind; size?: number }> = ({
  kind,
  size = 56,
}) => {
  const theme = useTheme();
  const frame = theme.palette.divider;
  const muted = theme.palette.text.disabled;
  const accent = theme.palette.primary.main;
  const accentSoft = alpha(theme.palette.primary.main, 0.16);
  const plate = subtleBg(theme, true);

  const phone = (
    <rect x={18} y={5} width={36} height={62} rx={7} fill={plate} stroke={frame} strokeWidth={1.5} />
  );

  const content = (() => {
    switch (kind) {
      case "iosShare":
        return (
          <>
            {phone}
            <rect x={24} y={14} width={24} height={3} rx={1.5} fill={muted} />
            <rect x={24} y={21} width={18} height={3} rx={1.5} fill={muted} />
            {/* Нижняя панель Safari со значком «Поделиться». */}
            <path
              d="M18 48h36v12a7 7 0 0 1-7 7H25a7 7 0 0 1-7-7V48z"
              fill={plate}
              stroke={frame}
              strokeWidth={1.5}
            />
            <circle cx={36} cy={57} r={8.5} fill={accentSoft} />
            <path
              d="M36 53v8M32.8 56.2 36 53l3.2 3.2"
              stroke={accent}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M31.5 58.5v3.5h9v-3.5"
              stroke={accent}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={25} cy={57} r={2.2} fill={muted} />
            <circle cx={47} cy={57} r={2.2} fill={muted} />
          </>
        );
      case "iosAddToHome":
        return (
          <>
            {phone}
            {/* Лист «Поделиться» с пунктом «На экран „Домой“». */}
            <rect x={22} y={24} width={28} height={36} rx={5} fill={plate} stroke={frame} strokeWidth={1.5} />
            <rect x={26} y={29} width={20} height={3} rx={1.5} fill={muted} />
            <rect x={23.5} y={36} width={25} height={10} rx={3} fill={accentSoft} />
            <rect
              x={26}
              y={38.5}
              width={5}
              height={5}
              rx={1.4}
              stroke={accent}
              strokeWidth={1.3}
              fill="none"
            />
            <path
              d="M28.5 39.8v2.4M27.3 41h2.4"
              stroke={accent}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            <rect x={34} y={39.8} width={12} height={2.4} rx={1.2} fill={accent} />
            <rect x={26} y={51} width={20} height={3} rx={1.5} fill={muted} />
          </>
        );
      case "homeScreen":
        return (
          <>
            {phone}
            {/* Домашний экран: иконка приложения среди прочих. */}
            <rect x={23} y={18} width={12} height={12} rx={3.5} fill={accentSoft} stroke={accent} strokeWidth={1.4} />
            <rect x={25} y={33} width={8} height={2.2} rx={1.1} fill={accent} />
            <rect x={39} y={18} width={12} height={12} rx={3.5} fill={muted} opacity={0.5} />
            <rect x={23} y={40} width={12} height={12} rx={3.5} fill={muted} opacity={0.5} />
            <rect x={39} y={40} width={12} height={12} rx={3.5} fill={muted} opacity={0.5} />
          </>
        );
      case "androidMenu":
        return (
          <>
            {/* Окно браузера, три точки в правом верхнем углу. */}
            <rect x={6} y={14} width={60} height={44} rx={6} fill={plate} stroke={frame} strokeWidth={1.5} />
            <path d="M6 28h60" stroke={frame} strokeWidth={1.5} />
            <rect x={12} y={18} width={34} height={6} rx={3} fill={muted} opacity={0.45} />
            <circle cx={57} cy={21} r={7} fill={accentSoft} />
            <circle cx={57} cy={18} r={1.6} fill={accent} />
            <circle cx={57} cy={21} r={1.6} fill={accent} />
            <circle cx={57} cy={24} r={1.6} fill={accent} />
            <rect x={12} y={35} width={30} height={3} rx={1.5} fill={muted} />
            <rect x={12} y={43} width={40} height={3} rx={1.5} fill={muted} />
          </>
        );
      case "androidInstall":
        return (
          <>
            <rect x={6} y={14} width={60} height={44} rx={6} fill={plate} stroke={frame} strokeWidth={1.5} />
            <rect x={12} y={20} width={22} height={3} rx={1.5} fill={muted} opacity={0.6} />
            {/* Меню браузера с пунктом «Установить приложение». */}
            <rect x={32} y={18} width={30} height={34} rx={4} fill={plate} stroke={frame} strokeWidth={1.5} />
            <rect x={36} y={23} width={20} height={2.8} rx={1.4} fill={muted} />
            <rect x={33.5} y={29} width={27} height={10} rx={3} fill={accentSoft} />
            <path
              d="M38 31.5v4.5M36.2 34.4 38 36.2l1.8-1.8M36 38h4"
              stroke={accent}
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x={43} y={32.8} width={14} height={2.6} rx={1.3} fill={accent} />
            <rect x={36} y={44} width={20} height={2.8} rx={1.4} fill={muted} />
          </>
        );
      case "desktopAddressBar":
        return (
          <>
            {/* Адресная строка десктопного браузера со значком установки. */}
            <rect x={5} y={16} width={62} height={40} rx={5} fill={plate} stroke={frame} strokeWidth={1.5} />
            <path d="M5 29h62" stroke={frame} strokeWidth={1.5} />
            <circle cx={11} cy={22.5} r={1.8} fill={muted} />
            <circle cx={17} cy={22.5} r={1.8} fill={muted} />
            <circle cx={23} cy={22.5} r={1.8} fill={muted} />
            <rect x={29} y={19} width={32} height={7} rx={3.5} fill={muted} opacity={0.35} />
            <circle cx={56} cy={22.5} r={5.5} fill={accentSoft} />
            <path
              d="M56 19.5v4.6M54 22.3l2 1.8 2-1.8M53.6 26h4.8"
              stroke={accent}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x={11} y={36} width={30} height={3} rx={1.5} fill={muted} />
            <rect x={11} y={44} width={44} height={3} rx={1.5} fill={muted} />
          </>
        );
      case "desktopMenu":
        return (
          <>
            <rect x={5} y={16} width={62} height={40} rx={5} fill={plate} stroke={frame} strokeWidth={1.5} />
            <path d="M5 29h62" stroke={frame} strokeWidth={1.5} />
            <rect x={11} y={19} width={30} height={7} rx={3.5} fill={muted} opacity={0.35} />
            <circle cx={60} cy={22.5} r={6} fill={accentSoft} />
            <circle cx={60} cy={19.8} r={1.5} fill={accent} />
            <circle cx={60} cy={22.5} r={1.5} fill={accent} />
            <circle cx={60} cy={25.2} r={1.5} fill={accent} />
            <rect x={36} y={31} width={26} height={22} rx={4} fill={plate} stroke={frame} strokeWidth={1.5} />
            <rect x={40} y={36} width={18} height={2.6} rx={1.3} fill={muted} />
            <rect x={40} y={42} width={14} height={2.6} rx={1.3} fill={accent} />
            <rect x={40} y={48} width={18} height={2.6} rx={1.3} fill={muted} />
          </>
        );
      case "desktopWindow":
        return (
          <>
            {/* Приложение в отдельном окне, без вкладок и адресной строки. */}
            <rect x={5} y={14} width={44} height={32} rx={5} fill={plate} stroke={frame} strokeWidth={1.5} opacity={0.6} />
            <rect x={23} y={26} width={44} height={32} rx={5} fill={plate} stroke={accent} strokeWidth={1.6} />
            <path d="M23 36h44" stroke={accent} strokeWidth={1.4} opacity={0.5} />
            <rect x={27} y={29.5} width={9} height={3.5} rx={1.75} fill={accent} />
            <rect x={28} y={42} width={22} height={3} rx={1.5} fill={muted} />
            <rect x={28} y={49} width={30} height={3} rx={1.5} fill={muted} />
          </>
        );
      case "openInSafari":
        return (
          <>
            {/* Из встроенного браузера — в Safari. */}
            <rect x={5} y={24} width={24} height={24} rx={6} fill={plate} stroke={frame} strokeWidth={1.5} />
            <circle cx={12} cy={36} r={1.7} fill={muted} />
            <circle cx={17} cy={36} r={1.7} fill={muted} />
            <circle cx={22} cy={36} r={1.7} fill={muted} />
            <path
              d="M33 36h8M38 33l3 3-3 3"
              stroke={accent}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={55} cy={36} r={12} fill={accentSoft} stroke={accent} strokeWidth={1.6} />
            <path d="M61 30 51.5 34 47 43.5 56.5 39.5 61 30z" fill={accent} />
          </>
        );
      default:
        return phone;
    }
  })();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
};

export default InstallStepArt;
