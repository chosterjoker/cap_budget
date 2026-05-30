import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getActiveSemester } from "@/lib/semester";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const semester = await getActiveSemester();

  return (
    <AppShell user={session.user} semesterName={semester?.name}>
      {children}
      <Toaster />
    </AppShell>
  );
}
