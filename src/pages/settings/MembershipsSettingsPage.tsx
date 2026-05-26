import React from "react";
import SettingsLayout from "./SettingsLayout";
import SettingsPlaceholder from "./SettingsPlaceholder";

const MembershipsSettingsPage: React.FC = () => (
  <SettingsLayout>
    <SettingsPlaceholder
      title="Сотрудники и доступы"
      hint="Участники организации и их доступы появятся здесь после подключения API."
    />
  </SettingsLayout>
);

export default MembershipsSettingsPage;
