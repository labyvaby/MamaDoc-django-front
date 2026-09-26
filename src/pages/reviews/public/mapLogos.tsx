import React from "react";

import type { MapPlatform } from "../../../api/reviews";
import twoGisUrl from "./logos/2gis.svg";
import yandexMapsUrl from "./logos/yandex-maps.svg";
import googleMapsUrl from "./logos/google-maps.svg";

/**
 * Значки карт для кнопок «Оставить отзыв». Файлы — с Wikimedia Commons
 * (2GIS_logo.svg, Yandex_Maps_icon.svg, Google_Maps_icon_(2020).svg) и лежат
 * в сборке: страница отзыва ничего не грузит со сторонних сайтов.
 */
const LOGOS: Record<MapPlatform, { src: string; width: number }> = {
  // Логотип 2ГИС горизонтальный — ему нужна почти вся ширина плашки.
  "2gis": { src: twoGisUrl, width: 40 },
  yandex: { src: yandexMapsUrl, width: 28 },
  google: { src: googleMapsUrl, width: 22 },
};

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
