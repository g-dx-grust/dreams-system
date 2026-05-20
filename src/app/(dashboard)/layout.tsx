import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { AppHeader } from "@/components/layout/app-header";
import { SideNav } from "@/components/layout/side-nav";
import { DashboardContent } from "@/components/layout/dashboard-content";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader user={user} />
      <div className="flex flex-1 overflow-hidden">
        <SideNav role={user.role} />
        <DashboardContent>{children}</DashboardContent>
      </div>
    </div>
  );
}
