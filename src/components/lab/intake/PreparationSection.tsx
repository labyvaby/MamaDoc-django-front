import React from "react";
import { Collapse, Link, Skeleton, Stack, Typography } from "@mui/material";

import IntakeSection from "./IntakeSection";

type Props = {
  texts: string[];
  loading: boolean;
};

/**
 * Сводная подготовка ко всей корзине разом (не по анализу): регистратор
 * зачитывает пациенту один список, а не листает памятки по каждой строке.
 *
 * Свёрнута по умолчанию. На четырёх-пяти анализах это несколько абзацев
 * на двух языках сразу, и раскрытыми они превращали дровер в простыню, хотя
 * на экране регистратору нужен только факт «подготовка есть, вот сколько
 * пунктов»: сам текст уходит пациенту печатной памяткой. Раскрывается одним
 * кликом, если надо прочитать вслух.
 *
 * Дедупликация — на бэкенде (`GET /lab/tests/preparation/`); повторять её
 * здесь не нужно и означало бы решать за бэкенд, какие строки совпадают.
 */
const PreparationSection: React.FC<Props> = ({ texts, loading }) => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    // Новый набор — новая памятка: не оставлять раскрытым текст от
    // предыдущей корзины.
    setOpen(false);
  }, [texts]);

  return (
    <IntakeSection
      title="Подготовка к анализам"
      loading={loading}
      action={
        !loading && texts.length > 0 ? (
          <Link
            component="button"
            type="button"
            variant="caption"
            underline="hover"
            onClick={() => setOpen((was) => !was)}
          >
            {open ? "Свернуть" : `Показать · ${texts.length}`}
          </Link>
        ) : null
      }
    >
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
        <>
          {!open && (
            <Typography variant="body2" color="text.secondary">
              {texts.length === 1
                ? "Одна рекомендация — уйдёт пациенту печатной памяткой."
                : `Рекомендаций: ${texts.length} — уйдут пациенту печатной памяткой.`}
            </Typography>
          )}
          <Collapse in={open} unmountOnExit>
            <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
              {texts.map((text, index) => (
                <Typography key={index} component="li" variant="body2">
                  {text}
                </Typography>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </IntakeSection>
  );
};

export default PreparationSection;
