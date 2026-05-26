import React from "react";
import { Card, CardContent, CardHeader, type CardProps } from "@mui/material";

/**
 * Единая карточка для всего приложения.
 *
 * Вариации ТОЛЬКО через props/slots:
 * - variant, elevation, color (через sx/background) и т.п. — стандартные CardProps
 * - title / subheader / actions — шапка карточки
 * - header / footer — полностью кастомные слоты сверху/снизу
 * - disableContentPadding — отключить CardContent-обёртку, если нужен "raw" layout
 *
 * Размеры (радиусы, отступы) контролируются через MUI-тему и appLayout-токены
 * (`MuiCard`, `MuiCardContent` overrides), а не через локальные magic numbers.
 */
export type AppCardProps = CardProps & {
  /** Заголовок карточки (обёртка над CardHeader.title) */
  title?: React.ReactNode;
  /** Подзаголовок (CardHeader.subheader) */
  subheader?: React.ReactNode;
  /** Экшены в шапке (CardHeader.action) */
  headerActions?: React.ReactNode;
  /** Полный кастомный header-слот, если стандартного CardHeader недостаточно */
  header?: React.ReactNode;
  /** Кастомный footer-слот (например, кнопки) */
  footer?: React.ReactNode;
  /**
   * Отключить CardContent-обёртку вокруг children.
   * Используется, если содержимое само управляет паддингами/лейаутом.
   */
  disableContentPadding?: boolean;
};

export const AppCard: React.FC<AppCardProps> = ({
  title,
  subheader,
  headerActions,
  header,
  footer,
  disableContentPadding = false,
  children,
  ...cardProps
}) => {
  const hasCardHeader = title || subheader || headerActions;

  return (
    <Card {...cardProps}>
      {header ??
        (hasCardHeader ? (
          <CardHeader title={title} subheader={subheader} action={headerActions} />
        ) : null)}

      {disableContentPadding ? (
        children
      ) : (
        <CardContent>
          {children}
        </CardContent>
      )}

      {footer}
    </Card>
  );
};

export default AppCard;
