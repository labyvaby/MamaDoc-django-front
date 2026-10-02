/**
 * «Вышла новая версия — обновите страницу». Компьютер на ресепшене не
 * выключают сутками, и после деплоя администратор работал на старом коде,
 * пока сам не нажмёт F5. Раз в 5 минут и при возвращении на вкладку
 * сравниваем свой входной бандл (`/assets/index-*.js` в index.html) с тем,
 * что сейчас отдаёт сервер; отличается — мягкая плашка с «Обновить».
 * Сами не перезагружаем: у человека может быть открыта недописанная форма.
 * В dev-режиме бандла нет — проверка молчит.
 */
import React from "react";
import { Button, Paper, Stack, Typography } from "@mui/material";
import SystemUpdateAltOutlined from "@mui/icons-material/SystemUpdateAltOutlined";

const CHECK_EVERY_MS = 5 * 60_000;
/** «Позже» — не спрашивать час. */
const SNOOZE_MS = 60 * 60_000;
const ENTRY_RE = /\/assets\/index-[\w-]+\.js/;

const currentEntry = (): string | null => {
  const tag = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')).find((s) => ENTRY_RE.test(s.src));
  return tag ? (new URL(tag.src).pathname.match(ENTRY_RE)?.[0] ?? null) : null;
};

/** Входной бандл, который сервер отдаёт сейчас; null — не удалось узнать (оффлайн, dev). */
export async function fetchServerEntry(signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store", signal, credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.text()).match(ENTRY_RE)?.[0] ?? null;
}

export const NewVersionNotice: React.FC = () => {
  const [stale, setStale] = React.useState(false);
  const snoozedUntil = React.useRef(0);

  React.useEffect(() => {
    const mine = currentEntry();
    if (!mine) return undefined;
    let aborted = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() < snoozedUntil.current) return;
      try {
        const server = await fetchServerEntry();
        if (!aborted && server && server !== mine) setStale(true);
      } catch {
        // сеть пропала — проверим в следующий раз
      }
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      aborted = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!stale) return null;
  return (
    <Paper
      role="status"
      elevation={8}
      sx={{
        position: "fixed",
        left: "50%",
        bottom: { xs: 16, md: 24 },
        transform: "translateX(-50%)",
        zIndex: (t) => t.zIndex.snackbar,
        width: "min(560px, calc(100vw - 32px))",
        borderRadius: "14px",
        px: 2,
        py: 1.25,
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
        <SystemUpdateAltOutlined color="primary" />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
          <b>Вышла новая версия CRM.</b> Обновите страницу, чтобы работать на актуальной — несохранённое в открытой форме сначала сохраните.
        </Typography>
        <Stack direction="row" gap={0.5}>
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              snoozedUntil.current = Date.now() + SNOOZE_MS;
              setStale(false);
            }}
          >
            Позже
          </Button>
          <Button variant="contained" size="small" disableElevation onClick={() => window.location.reload()}>
            Обновить
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

export default NewVersionNotice;
