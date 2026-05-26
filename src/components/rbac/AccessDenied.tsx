import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router';

interface AccessDeniedProps {
  /** Кастомный заголовок */
  title?: string;
  /** Кастомное описание */
  description?: string;
  /** Показать кнопку "Назад" */
  showBack?: boolean;
}

/**
 * Страница / встроенный блок «Нет доступа».
 * Показывается ProtectedRoute и RequirePermission при нехватке прав.
 */
export const AccessDenied: React.FC<AccessDeniedProps> = ({
  title = 'Нет доступа',
  description = 'У вас недостаточно прав для просмотра этого раздела.',
  showBack = true,
}) => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        px: 3,
        textAlign: 'center',
      }}
    >
      <LockOutlinedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
      <Typography variant="h5" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={400}>
        {description}
      </Typography>
      {showBack && (
        <Button variant="outlined" onClick={() => navigate(-1)}>
          Назад
        </Button>
      )}
    </Box>
  );
};

export default AccessDenied;
