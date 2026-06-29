import type {
  ReviewChannel,
  ReviewRequestStatus,
  ReviewSentiment,
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
  completed: { label: "Завершён", color: "success" },
  expired: { label: "Истёк", color: "default" },
  failed: { label: "Не доставлен", color: "error" },
};

export const CHANNEL_LABELS: Record<ReviewChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  whatsapp_then_sms: "WhatsApp → SMS",
};

export const SENTIMENT_OPTIONS: { value: ReviewSentiment; label: string }[] = [
  { value: "negative", label: "Негатив" },
  { value: "neutral", label: "Нейтрально" },
  { value: "promoter", label: "Промоутер" },
];
