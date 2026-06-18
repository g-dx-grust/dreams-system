import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { signOut } from "@/server/auth";
import { AppShell } from "@/components/layout/app-shell";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const collapsed = (await cookies()).get("sidenav_collapsed")?.value === "1";

  return (
    <ToastProvider>
      <NavigationProgress />
      <AppShell user={user} signOutAction={signOut} initialCollapsed={collapsed}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
