import type {
  CaseStatus,
  MapPlatform,
  PublicationStatus,
  PublishConsent,
  ReviewRequestStatus,
  ReviewSentiment,
  StaffGroup,
} from "../../api/reviews";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

export const SENTIMENT_META: Record<
  ReviewSentiment,
  { label: string; color: ChipColor }
> = {
  negative: { label: "Негатив", color: "error" },
  neutral: { label: "Нейтрально", color: "warning" },
  promoter: { label: "Промоутер", color: "success" },
};

export const REQUEST_STATUS_META: Record<
  ReviewRequestStatus,
  { label: string; color: ChipColor }
> = {
  created: { label: "Создан", color: "default" },
  sent: { label: "Отправлен", color: "info" },
  rated: { label: "Оценён", color: "info" },
  awaiting_comment: { label: "Ждём комментарий", color: "warning" },
  completed: { label: "Ответил", color: "success" },
  expired: { label: "Без ответа", color: "default" },
  failed: { label: "Не доставлен", color: "error" },
  skipped: { label: "Пропущен (недавно спрашивали)", color: "default" },
};

export const CASE_META: Record<
  Exclude<CaseStatus, "">,
  { label: string; color: ChipColor }
> = {
  new: { label: "Новый", color: "error" },
  in_progress: { label: "В работе", color: "warning" },
  resolved: { label: "Решён", color: "success" },
};

export const MAP_META: Record<MapPlatform, string> = {
  "2gis": "2ГИС",
  yandex: "Яндекс",
  google: "Google",
};

export const STAFF_GROUP_META: Record<
  StaffGroup,
  { label: string; subLabel: string | null }
> = {
  doctor: { label: "Врачи", subLabel: "Оценка врача" },
  registrar: { label: "Регистраторы", subLabel: "Оценка регистратуры" },
  cashier: { label: "Кассиры", subLabel: null },
};

export const SENTIMENT_OPTIONS: { value: ReviewSentiment; label: string }[] = [
  { value: "negative", label: "Негатив" },
  { value: "neutral", label: "Нейтрально" },
  { value: "promoter", label: "Промоутер" },
];

/** Что разрешил пациент. */
export const CONSENT_META: Record<PublishConsent, string> = {
  private: "Не публиковать",
  anonymous: "Анонимно",
  named: "С именем",
};

export const PUBLICATION_META: Record<
  PublicationStatus,
  { label: string; color: ChipColor }
> = {
  pending: { label: "Ждёт проверки", color: "warning" },
  published: { label: "На сайте", color: "success" },
  hidden: { label: "Скрыт", color: "default" },
};
