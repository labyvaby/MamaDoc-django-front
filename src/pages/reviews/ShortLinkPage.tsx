import React from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import LinkOffRounded from "@mui/icons-material/LinkOffRounded";
import { useNavigate, useParams } from "react-router";

import { resolveShortLink } from "../../api/reviews";
import { MUTED, TEAL, rateTheme, useRateFonts } from "./public/theme";
import { Display, Medallion, Shell } from "./public/ui";

/** Короткая ссылка из WhatsApp/SMS: `/r/<code>` → страница отзыва `/review/<token>`. */
const ShortLinkPage: React.FC = () => {
  useRateFonts();
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    resolveShortLink(code, ctrl.signal)
      .then(({ token }) => navigate(`/review/${token}`, { replace: true }))
      .catch(() => {
        if (!ctrl.signal.aborted) setMissing(true);
      });
    return () => ctrl.abort();
  }, [code, navigate]);

  return (
    <ThemeProvider theme={rateTheme}>
      <Shell>
        {missing ? (
          <Stack
            spacing={2.5}
            alignItems="center"
            textAlign="center"
            sx={{ my: "auto", py: 6 }}
          >
            <Medallion tone="quiet" icon={<LinkOffRounded />} />
            <Display size={28} center>
              Ссылка не найдена
            </Display>
            <Typography sx={{ color: MUTED, fontSize: 16, maxWidth: 340 }}>
              Возможно, она устарела или в ней опечатка. Попросите прислать
              новую ссылку.
            </Typography>
          </Stack>
        ) : (
          <Box sx={{ my: "auto", display: "flex", justifyContent: "center" }}>
            <CircularProgress sx={{ color: TEAL }} />
          </Box>
        )}
      </Shell>
    </ThemeProvider>
  );
};

export default ShortLinkPage;
