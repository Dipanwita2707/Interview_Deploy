import { DashboardShell } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import React from "react";

export async function DashboardLayoutShared({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
