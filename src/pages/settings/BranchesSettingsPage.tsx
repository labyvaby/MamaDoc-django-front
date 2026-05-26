import React from "react";
import SettingsLayout from "./SettingsLayout";
import SettingsPlaceholder from "./SettingsPlaceholder";

const BranchesSettingsPage: React.FC = () => (
  <SettingsLayout>
    <SettingsPlaceholder
      title="Филиалы"
      hint="Список филиалов появится здесь после подключения API."
    />
  </SettingsLayout>
);

export default BranchesSettingsPage;
