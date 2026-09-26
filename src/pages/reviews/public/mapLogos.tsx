import React from "react";

import type { MapPlatform } from "../../../api/reviews";
import twoGisUrl from "./logos/2gis-app.png";
import yandexMapsUrl from "./logos/yandex-maps.svg";
import googleMapsUrl from "./logos/google-maps.svg";

/**
 * Значки карт для кнопок «Оставить отзыв». 2ГИС — иконка приложения из
 * App Store (ООО «ДубльГИС»), Яндекс Карты и Google Maps — с Wikimedia
 * Commons (Yandex_Maps_icon.svg, Google_Maps_icon_(2020).svg). Файлы лежат
 * в сборке: страница отзыва ничего не грузит со сторонних сайтов.
 */
const LOGOS: Record<MapPlatform, { src: string; width: number }> = {
  // Иконка приложения — сама плашка; чуть крупнее плашки, чтобы её
  // собственные скруглённые края со светлой каймой ушли за обрез.
  "2gis": { src: twoGisUrl, width: 54 },
  yandex: { src: yandexMapsUrl, width: 28 },
  google: { src: googleMapsUrl, width: 22 },
};

/** Значок сам является плашкой — рамка и фон вокруг не нужны. */
export const isFullTile = (platform: MapPlatform) => platform === "2gis";

export const MapLogo: React.FC<{ platform: MapPlatform }> = ({ platform }) => {
  const { src, width } = LOGOS[platform];
  return (
    <img
      src={src}
      alt=""
      width={width}
      style={{ display: "block", width, height: "auto" }}
    />
  );
};
