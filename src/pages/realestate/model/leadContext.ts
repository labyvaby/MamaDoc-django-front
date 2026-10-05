import React from "react";

/**
 * Подбор квартиры для заявки CRM: «▣ Бронь» в карточке лида открывает
 * шахматку с `?lead=<id>`. Бронь и договор на шахматке тогда подставляют
 * клиента и уходят с `leadId` — бэк сам двигает лид на «Бронирование» /
 * «Договор / оплата» (гайд `frontend-sales.md` §2, §6).
 */
export interface ChessboardLead {
  id: number;
  client: string;
  phone: string;
}

export const ChessboardLeadContext = React.createContext<ChessboardLead | null>(null);

export const useChessboardLead = () => React.useContext(ChessboardLeadContext);

const digits = (value: string) => value.replace(/\D/g, "");

/**
 * `leadId` для брони/договора — только если покупатель в форме и есть клиент
 * заявки (совпал телефон или ФИО). Иначе подбор для заявки не должен
 * привязать её к чужой сделке: например, договор по брони другого покупателя.
 */
export function leadIdFor(lead: ChessboardLead | null, buyer: string, phone: string): number | null {
  if (!lead) return null;
  const leadPhone = digits(lead.phone).slice(-9);
  if (leadPhone.length === 9 && digits(phone).slice(-9) === leadPhone) return lead.id;
  const norm = (value: string) => value.trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
  return norm(buyer) !== "" && norm(buyer) === norm(lead.client) ? lead.id : null;
}
