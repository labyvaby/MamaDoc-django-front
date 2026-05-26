import React from "react";
import { Box, Stack, Typography, Paper } from "@mui/material";

export type SubHeaderProps = {
  title: string;
  actions?: React.ReactNode;
};

export const SubHeader: React.FC<SubHeaderProps> = ({ title, actions }) => {
  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        px: 2,
        py: 1.25,
        position: "sticky",
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderLeft: 0,
        borderRight: 0,
        backgroundColor: (theme) =>
          theme.palette.mode === "dark" ? "rgba(17, 25, 40, .65)" : "rgba(255,255,255,.60)",
        backdropFilter: "saturate(180%) blur(10px)",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        gap={1.25}
        sx={{ width: 1 }}
      >
        <Typography
          variant="h5"
          sx={{
            fontSize: { xs: "1.1rem", sm: "1.25rem", md: "1.5rem" },
            lineHeight: 1.2,
            background: (theme) =>
              theme.palette.mode === "dark"
                ? `linear-gradient(90deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`
                : `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {title}
        </Typography>
        {actions && (
          <Box
            sx={{
              width: { xs: 1, md: "auto" },
              display: "flex",
              justifyContent: { xs: "flex-start", md: "flex-end" },
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            {actions}
          </Box>
        )}
      </Stack>
    </Paper>
  );
};
