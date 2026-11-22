import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { AppShell } from "@/components/layout/AppShell";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <WorkspaceProvider
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
      }}
    >
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
