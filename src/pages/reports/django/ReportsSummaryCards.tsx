import React from "react";
import {
  Grid2,
  Card,
  CardContent,
  Typography,
  Skeleton,
  Stack,
  Box,
  alpha,
  useTheme,
} from "@mui/material";

export type SummaryCardColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info";

export interface SummaryCard {
  title: string;
  primaryValue: string;
  secondaryText: string;
  color: SummaryCardColor;
}

interface ReportsSummaryCardsProps {
  cards: SummaryCard[];
  loading?: boolean;
}

/**
 * Presentational summary-card grid for the reports page. Mirrors the original
 * (Supabase) AppointmentsSummaryCards visuals, but the data is supplied as a
 * ready list of cards computed from the Django backend report.
 */
export const ReportsSummaryCards: React.FC<ReportsSummaryCardsProps> = ({
  cards,
  loading = false,
}) => {
  const theme = useTheme();

  const totalCards = cards.length;
  const useFlex = totalCards > 6;
  const lgSize: number | undefined = useFlex ? undefined : Math.floor(12 / totalCards);

  if (loading) {
    return (
      <Box sx={{ display: "flex", gap: { xs: 1, md: 2 }, flexWrap: "wrap" }}>
        {Array.from({ length: Math.max(totalCards, 6) }).map((_, i) => (
          <Box key={i} sx={{ flex: "1 1 140px", minWidth: 0 }}>
            <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 3 }} />
          </Box>
        ))}
      </Box>
    );
  }

  const renderCard = (card: SummaryCard, idx: number, compact: boolean) => (
    <Card
      key={idx}
      variant="outlined"
      sx={{
        background: `linear-gradient(135deg, ${alpha(theme.palette[card.color].main, 0.02)} 0%, ${alpha(theme.palette[card.color].main, 0.1)} 100%)`,
        border: `1px solid ${alpha(theme.palette[card.color].main, 0.2)}`,
        borderRadius: { xs: 1.5, md: 3 },
        height: "100%",
      }}
    >
      <CardContent sx={{ p: { xs: 1, md: 1.5 }, "&:last-child": { pb: { xs: 1, md: 1.5 } } }}>
        <Stack spacing={0}>
          <Typography
            sx={{
              color: `${card.color}.main`,
              fontWeight: 700,
              fontSize: compact ? { xs: "0.6rem", md: "0.65rem" } : { xs: "0.6rem", md: "0.7rem" },
              letterSpacing: 0.5,
              textTransform: "uppercase",
              lineHeight: 1.3,
            }}
          >
            {card.title}
          </Typography>
          <Box>
            <Typography
              fontWeight={800}
              noWrap
              sx={{
                color: `${card.color}.dark`,
                fontSize: compact
                  ? { xs: "1rem", sm: "1.1rem", md: "1.2rem" }
                  : { xs: "1.1rem", sm: "1.3rem", md: "1.5rem" },
                lineHeight: 1.1,
              }}
            >
              {card.primaryValue}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            noWrap={compact}
            sx={{
              color: "text.secondary",
              fontWeight: 500,
              display: "block",
              fontSize: compact ? { xs: "0.55rem", md: "0.6rem" } : { xs: "0.6rem", md: "0.7rem" },
              lineHeight: 1.3,
            }}
          >
            {card.secondaryText}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );

  if (useFlex) {
    return (
      <Box sx={{ display: "flex", gap: { xs: 1, md: 1.5 }, flexWrap: { xs: "wrap", lg: "nowrap" } }}>
        {cards.map((card, idx) => (
          <Box key={idx} sx={{ flex: "1 1 0", minWidth: { xs: "calc(50% - 4px)", lg: 0 } }}>
            {renderCard(card, idx, true)}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Grid2 container spacing={{ xs: 1, md: 2 }}>
      {cards.map((card, idx) => (
        <Grid2 key={idx} size={{ xs: 6, lg: lgSize }}>
          {renderCard(card, idx, false)}
        </Grid2>
      ))}
    </Grid2>
  );
};
