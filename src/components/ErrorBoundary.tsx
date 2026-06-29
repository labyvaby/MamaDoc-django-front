import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Typography, Button, Paper, Container } from "@mui/material";
import {
  SentimentDissatisfiedOutlined as SadIcon,
  RefreshOutlined as RefreshIcon,
  HomeOutlined as HomeIcon,
} from "@mui/icons-material";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/home";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Container maxWidth="sm">
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            py: 4,
          }}
        >
          <Paper
            variant="outlined"
            elevation={0}
            sx={{
              p: 4,
              textAlign: "center",
              borderRadius: "14px",
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                backgroundColor: "warning.light",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <SadIcon sx={{ fontSize: 40, color: "warning.contrastText" }} />
            </Box>

            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              fontWeight="bold"
            >
              Упс!
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              Что-то пошло не так.
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Попробуйте обновить страницу. Если проблема повторится, обратитесь
              к администратору.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={this.handleReload}
                size="large"
              >
                Обновить
              </Button>
              <Button
                variant="contained"
                startIcon={<HomeIcon />}
                onClick={this.handleGoHome}
                size="large"
              >
                На главную
              </Button>
            </Box>
          </Paper>
        </Box>
      </Container>
    );
  }
}
