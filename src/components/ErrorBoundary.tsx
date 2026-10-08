import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Typography, Button, Paper, Container, CircularProgress } from "@mui/material";
import {
  SentimentDissatisfiedOutlined as SadIcon,
  RefreshOutlined as RefreshIcon,
  HomeOutlined as HomeIcon,
  BugReportOutlined as BugIcon,
  CheckCircleOutline as DoneIcon,
} from "@mui/icons-material";
import {
  isStaleBuildError,
  reloadForStaleBuild,
} from "../pwa/staleBuildRecovery";
import { createSupportTicket } from "../api/support";
import { buildAutoDescription } from "../support/autoDescription";
import { IfCanReport } from "../support/RequireSupportAccess";
import {
  collectDiagnostics,
  getActionsForDescription,
  getFrontendBuild,
  getRecentProblem,
  recordReactError,
  screenLabel,
} from "../support/diagnosticsRecorder";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** Отправка обращения прямо с экрана сбоя: приложение уже не живёт, формы нет. */
  report: "idle" | "sending" | "sent" | "failed";
  ticketNumber: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, report: "idle", ticketNumber: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    // Сбой интерфейса — повод предложить «сообщить разработчикам» (src/support).
    recordReactError(error, errorInfo.componentStack ?? undefined);
    if (isStaleBuildError(error)) {
      reloadForStaleBuild();
    }
  }

  /**
   * Одно нажатие: обращение уходит с автоописанием и техническим снимком.
   * Снимок экрана здесь не делаем — упавший интерфейс снимать нечего, а форма
   * недоступна, поэтому текст собирается шаблоном.
   */
  handleReport = async () => {
    this.setState({ report: "sending" });
    try {
      const route = window.location.pathname;
      const auto = buildAutoDescription(getRecentProblem(), route, getActionsForDescription());
      const detail = await createSupportTicket({
        category: "bug",
        title: auto.title || "Страница перестала открываться",
        description:
          auto.description ||
          "Интерфейс остановился с ошибкой и показал экран «Что-то пошло не так».",
        steps: auto.steps,
        impact: "blocked",
        pagePath: route,
        diagnostics: collectDiagnostics(),
        appVersion: getFrontendBuild(),
        userAgent: navigator.userAgent,
        screen: screenLabel(),
      });
      this.setState({ report: "sent", ticketNumber: detail.ticket.number });
    } catch {
      this.setState({ report: "failed" });
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // Корень, а не /appointments: RootRedirect уведёт на доступную страницу
    // (у врача нет права на Регистратуру — иначе после сбоя он попадал бы
    // прямиком на «Нет доступа»).
    window.location.href = "/";
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

            <IfCanReport>
            <Box sx={{ mt: 3 }}>
              {this.state.report === "sent" ? (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    color: "success.main",
                  }}
                >
                  <DoneIcon />
                  <Typography variant="body2" color="text.primary">
                    Спасибо! Обращение {this.state.ticketNumber} отправлено разработчикам.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Button
                    variant="text"
                    color="error"
                    startIcon={
                      this.state.report === "sending" ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <BugIcon />
                      )
                    }
                    onClick={this.handleReport}
                    disabled={this.state.report === "sending"}
                  >
                    {this.state.report === "sending"
                      ? "Отправляем…"
                      : "Сообщить разработчикам"}
                  </Button>
                  {this.state.report === "failed" && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      Не получилось отправить. Обновите страницу и напишите из раздела «Поддержка».
                    </Typography>
                  )}
                </>
              )}
            </Box>
            </IfCanReport>
          </Paper>
        </Box>
      </Container>
    );
  }
}
