import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { signOut } from "@/server/auth";
import { SideNav } from "@/components/layout/side-nav";
import { DashboardContent } from "@/components/layout/dashboard-content";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SideNav user={user} signOutAction={signOut} />
      <DashboardContent>{children}</DashboardContent>
    </div>
  );
}
