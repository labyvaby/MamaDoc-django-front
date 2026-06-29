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
import { subtleBg } from "../../theme";

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
        borderRadius: "18px",
        bgcolor: (theme) => subtleBg(theme, true),
        color: "text.secondary",
      }}
    >
      <AccountCircleOutlined fontSize="small" />
    </Avatar>
  );
};

export default EmployeeAvatar;
