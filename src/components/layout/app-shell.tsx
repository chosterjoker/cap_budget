"use client";

import { useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu, UserPanel } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
  touch = false,
}: {
  pathname: string;
  role: Role;
  onNavigate?: () => void;
  /** Roomier rows and icons, for the drawer where these are tapped. */
  touch?: boolean;
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
              "flex items-center gap-3 rounded-lg px-3 font-medium transition-colors",
              touch ? "py-2.5 text-[0.95rem]" : "py-2 text-sm",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={touch ? "h-5 w-5" : "h-4 w-4"} />
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
  // Controlled so tapping a link closes the drawer — otherwise the new page
  // renders behind an open sheet.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    // `h-dvh`, not `h-screen`: mobile browsers report `vh` against the tallest
    // viewport, which pushes the bottom of the layout under the URL bar.
    <div className="flex h-dvh overflow-hidden bg-background">
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
        <div className="space-y-2 pt-4">
          <ThemeToggle className="w-full" />
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile-only. On desktop the sidebar already carries the brand, nav,
            theme toggle and user menu, so this bar would render empty.
            The bar holds nothing but the menu button and the title: theme and
            account live at the bottom of the drawer, where there's room for
            them. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              }
            />
            {/* `w-72!` beats the primitive's `data-[side=left]:w-3/4`, whose
                attribute selector outranks a plain width class. */}
            <SheetContent side="left" className="w-72! max-w-[85vw] gap-0">
              <SheetHeader className="flex-row items-center gap-3 border-b pr-12">
                <Image
                  src="/cap_logo.png"
                  alt="Cap & Gown crest"
                  width={1068}
                  height={1374}
                  className="h-9 w-auto shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cap & Gown
                  </p>
                  <SheetTitle className="truncate text-base font-bold">
                    Budget & Tracking
                  </SheetTitle>
                  {semesterName && (
                    <SheetDescription className="truncate text-xs">
                      {semesterName}
                    </SheetDescription>
                  )}
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-3">
                <NavLinks
                  pathname={pathname}
                  role={user.role}
                  touch
                  onNavigate={() => setMenuOpen(false)}
                />
              </div>
              {/* Padded past the home indicator on phones with a gesture bar. */}
              <SheetFooter className="gap-3 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
                <ThemeToggle showLabels className="w-full" />
                <UserPanel user={user} />
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Image
            src="/cap_logo.png"
            alt="Cap & Gown crest"
            width={1068}
            height={1374}
            className="h-7 w-auto shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">
              Budget & Tracking
            </p>
            {semesterName && (
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {semesterName}
              </p>
            )}
          </div>
        </header>
        {/* One container for every page, so widths and gutters never drift
            between routes. Wide tables scroll inside their own wrapper. */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
