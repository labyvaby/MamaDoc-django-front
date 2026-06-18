/**
 * UserAvatar.tsx
 * Единый аватар пользователя для профиля, хедера и модалки — чтобы вид
 * совпадал во всех местах.
 *
 * Логика отображения:
 *  1. есть фото (`src`) → показываем фото;
 *  2. иначе есть имя → инициалы (первая буква имени + первая буква фамилии);
 *  3. иначе → контурная иконка person.
 */
import React from "react";
import { Avatar } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";

export type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  /** Диаметр в px. */
  size?: number;
  sx?: SxProps<Theme>;
};

const getInitials = (name?: string | null): string => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ src, name, size = 40, sx }) => {
  const initials = getInitials(name);

  return (
    <Avatar
      src={src || undefined}
      alt={name || undefined}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: 700,
        // Фон-заглушка (без фото) — тон выбранного основного цвета.
        bgcolor: (theme) =>
          src
            ? undefined
            : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.28 : 0.16),
        // Инициалы/иконка — контраст-безопасный primary на этом тоне.
        color: (theme) => (src ? undefined : theme.palette.primary.onSurface),
        ...sx,
      }}
    >
      {initials || <PersonOutlineOutlined sx={{ fontSize: size * 0.55 }} />}
    </Avatar>
  );
};

export default UserAvatar;
