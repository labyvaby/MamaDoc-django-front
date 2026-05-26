import React from "react";
import SettingsLayout from "./SettingsLayout";
import SettingsPlaceholder from "./SettingsPlaceholder";

const OrganizationSettingsPage: React.FC = () => (
  <SettingsLayout>
    <SettingsPlaceholder
      title="Организация"
      hint="Профиль организации появится здесь после подключения API."
    />
  </SettingsLayout>
);

export default OrganizationSettingsPage;
