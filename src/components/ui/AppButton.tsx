import React from "react";
import { Button, type ButtonProps } from "@mui/material";

/**
 * Единая кнопка для всего приложения.
 *
 * Вариации ТОЛЬКО через props:
 * - variant, color, size, fullWidth, startIcon, endIcon и т.д.
 * - loading: добавляет спиннер и дизейблит кнопку.
 *
 * Размеры (высота и типографика) приходят из MUI-темы и appLayout-токенов,
 * так что все кнопки визуально консистентны.
 */
export type AppButtonProps = ButtonProps & {
  loading?: boolean;
  // Поддержка ссылочных кнопок вида component={RouterLink} to="/path"
  to?: string;
};

export const AppButton: React.FC<AppButtonProps> = ({
  loading = false,
  children,
  disabled,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  return (
    <Button
      {...rest}
      disabled={isDisabled}
    >
      {children}
    </Button>
  );
};

export default AppButton;
