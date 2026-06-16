import { DashboardLayoutShared } from "@/components/layout/dashboard-layout-shared";
import SettingsClientLayout from "./settings-client-layout";
import React from "react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayoutShared>
      <SettingsClientLayout>{children}</SettingsClientLayout>
    </DashboardLayoutShared>
  );
}
