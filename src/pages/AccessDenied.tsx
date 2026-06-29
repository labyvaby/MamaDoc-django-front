import React from 'react';
import { useNavigate } from 'react-router';
import { Box, Typography, Button, Paper, Container } from '@mui/material';
import { LockOutlined as LockIcon, ArrowBackOutlined as ArrowBackIcon } from '@mui/icons-material';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Страница "Доступ запрещен"
 * Отображается когда у пользователя нет прав для просмотра запрашиваемой страницы
 */
export const AccessDenied: React.FC = () => {
  const navigate = useNavigate();
  const { role } = usePermissions();

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/home');
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={(theme) => ({
          minHeight: theme.appLayout.fullPage.minHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        })}
      >
        <Paper
          variant="outlined"
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: "14px",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: 'error.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <LockIcon sx={{ fontSize: 40, color: 'error.contrastText' }} />
          </Box>

          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Доступ запрещен
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            У вас недостаточно прав для просмотра этой страницы.
          </Typography>

          {role && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Ваша роль: <strong>{role.display_name}</strong>
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Если вы считаете, что это ошибка, обратитесь к администратору системы.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleGoBack}
              size="large"
            >
              Назад
            </Button>
            <Button variant="contained" onClick={handleGoHome} size="large">
              На главную
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default AccessDenied;
