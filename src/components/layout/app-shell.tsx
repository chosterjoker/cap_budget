"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Table2,
  FileText,
  Receipt,
  Landmark,
  Smartphone,
  Settings,
  Menu,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { UserMenu } from "@/components/layout/user-menu";
import type { Role } from "@prisma/client";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: Table2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/checks", label: "Checks", icon: FileText },
  { href: "/reimbursements", label: "Reimbursements", icon: Receipt },
  { href: "/deposits", label: "Deposits", icon: Landmark },
  { href: "/venmo", label: "Venmo", icon: Smartphone },
  { href: "/settings", label: "Settings", icon: Settings, treasurerOnly: true },
];

function NavLinks({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: Role;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        if (item.treasurerOnly && role !== "TREASURER") return null;
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  user,
  semesterName,
}: {
  children: React.ReactNode;
  user: { name?: string | null; email: string; role: Role };
  semesterName?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/cap_logo.png"
            alt="Cap & Gown crest"
            width={1068}
            height={1374}
            priority
            className="h-10 w-auto shrink-0"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cap & Gown
            </p>
            <h1 className="text-lg font-bold leading-tight">Budget & Tracking</h1>
            {semesterName && (
              <p className="mt-0.5 text-xs text-muted-foreground">{semesterName}</p>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} role={user.role} />
        </div>
        <div className="pt-4">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon">
                    <Menu className="h-4 w-4" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-64">
                <div className="mb-6 flex items-center gap-2">
                  <Image
                    src="/cap_logo.png"
                    alt="Cap & Gown crest"
                    width={1068}
                    height={1374}
                    className="h-8 w-auto shrink-0"
                  />
                  <div>
                    <h1 className="font-bold leading-tight">Budget & Tracking</h1>
                    {semesterName && (
                      <p className="text-xs text-muted-foreground">{semesterName}</p>
                    )}
                  </div>
                </div>
                <NavLinks pathname={pathname} role={user.role} />
              </SheetContent>
            </Sheet>
            <Image
              src="/cap_logo.png"
              alt="Cap & Gown crest"
              width={1068}
              height={1374}
              className="h-6 w-auto"
            />
            <span className="font-semibold">Budget & Tracking</span>
          </div>
          <div className="hidden md:block" />
          <div className="md:hidden">
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
