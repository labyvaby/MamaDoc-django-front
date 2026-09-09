import React from "react";
import { Skeleton, Stack, Typography } from "@mui/material";

type Props = {
  texts: string[];
  loading: boolean;
};

/**
 * Сводная подготовка ко всей корзине разом (не по анализу): регистратор
 * зачитывает пациенту один список, а не листает памятки по каждой строке.
 *
 * Дедупликация — на бэкенде (`GET /lab/tests/preparation/`); повторять её
 * здесь не нужно и означало бы решать за бэкенд, какие строки совпадают.
 */
const PreparationSection: React.FC<Props> = ({ texts, loading }) => {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" fontWeight={600}>
        Подготовка к анализам
      </Typography>

      {loading ? (
        <Stack spacing={0.75}>
          <Skeleton variant="text" />
          <Skeleton variant="text" width="70%" />
        </Stack>
      ) : texts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Особой подготовки не требуется
        </Typography>
      ) : (
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
          {texts.map((text, index) => (
            <Typography key={index} component="li" variant="body2">
              {text}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default PreparationSection;
