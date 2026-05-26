import React from "react";
import SettingsLayout from "./SettingsLayout";
import SettingsPlaceholder from "./SettingsPlaceholder";

const RolesSettingsPage: React.FC = () => (
  <SettingsLayout>
    <SettingsPlaceholder
      title="Роли"
      hint="Управление ролями появится здесь после подключения API."
    />
  </SettingsLayout>
);

export default RolesSettingsPage;
