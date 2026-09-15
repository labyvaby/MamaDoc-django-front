import { describe, expect, it } from "vitest";

import ruSettings from "../../../locales/ru/settings.json";

const RECIPIENT_KEYS = [
  "title",
  "employeesLabel",
  "employeesPlaceholder",
  "rolesLabel",
  "rolesPlaceholder",
  "rolesHint",
  "rolesHintSchedule",
  "noEmployees",
  "noRoles",
  "noPhone",
  "selectedWithoutPhone",
  "unknownEmployee",
  "unknownRole",
  "required",
  "limit",
] as const;

describe("automation recipient translations", () => {
  it("keeps every RecipientsEditor label in the automations namespace", () => {
    const recipients = ruSettings.automations.recipients as Record<string, string>;

    for (const key of RECIPIENT_KEYS) {
      expect(
        recipients[key],
        `нет перевода settings:automations.recipients.${key}`,
      ).toBeTruthy();
    }
  });
});
