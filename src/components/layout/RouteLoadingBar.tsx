/**
 * Тонкая полоска загрузки над шапкой, пока подгружается код новой страницы
 * (см. lazyWithProgress). Появляется не сразу, а через 150 мс: уже скачанная
 * страница открывается мгновенно, и полоска не должна мигать на каждом клике.
 */
import React from "react";
import { LinearProgress } from "@mui/material";

import { getRouteLoadingCount, subscribeRouteLoading } from "../../utility/lazyWithProgress";

const SHOW_DELAY_MS = 150;

export const RouteLoadingBar: React.FC = () => {
  const loading = React.useSyncExternalStore(subscribeRouteLoading, () => getRouteLoadingCount() > 0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!visible) return null;
  return (
    <LinearProgress
      aria-label="Страница загружается"
      sx={(theme) => ({ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: theme.zIndex.appBar + 2 })}
    />
  );
};

export default RouteLoadingBar;
