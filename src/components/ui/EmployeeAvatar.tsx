/**
 * EmployeeAvatar.tsx
 * Презентационный компонент-заглушка аватара сотрудника.
 * До появления реальных аватарок отображает иконку AccountCircle из MUI.
 * Параметры:
 * - name?: строка для alt-атрибута
 * - size?: число (px) для кастомного размера аватара
 */
import React from "react";
import { Avatar } from "@mui/material";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";

type Props = {
  name?: string;
  size?: number; // px
};

const EmployeeAvatar: React.FC<Props> = ({ name, size = 32 }) => {
  return (
    <Avatar
      alt={name}
      sx={{
        width: size,
        height: size,
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255,255,255,0.06)"
            : "rgba(2,6,23,0.06)",
        color: "text.secondary",
      }}
    >
      <AccountCircleOutlined fontSize="small" />
    </Avatar>
  );
};

export default EmployeeAvatar;
