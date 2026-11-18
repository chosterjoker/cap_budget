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
  Users,
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
  { href: "/members", label: "Membership", icon: Users },
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
    <nav className="flex flex-col gap-0.5">
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
              "flex items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors",
              touch ? "py-2.5 text-[0.95rem]" : "py-1.5 text-[0.8125rem]",
              // Active row lifts onto the card surface rather than flooding
              // with ink, so the sidebar stays quiet and the page leads.
              active
                ? "bg-card text-foreground shadow-surface ring-1 ring-foreground/[0.06]"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                touch ? "h-[1.15rem] w-[1.15rem]" : "h-4 w-4",
                active ? "text-foreground" : "text-muted-foreground/80"
              )}
              strokeWidth={1.75}
            />
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
    // Desktop is a frame-and-sheet layout: the sidebar sits directly on the
    // canvas, and every page renders on one inset, rounded sheet beside it.
    <div className="flex h-dvh overflow-hidden bg-background md:bg-canvas">
      <aside className="hidden w-60 shrink-0 flex-col px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2.5">
          <Image
            src="/cap_logo.png"
            alt="Cap & Gown crest"
            width={1068}
            height={1374}
            priority
            className="h-8 w-auto shrink-0"
          />
          <div className="min-w-0">
            <h1 className="truncate text-[0.9rem] font-semibold leading-tight">
              Cap & Gown
            </h1>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {semesterName ?? "Budget & Tracking"}
            </p>
          </div>
        </div>
        <p className="eyebrow mb-1.5 px-2.5">Treasury</p>
        <div className="flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} role={user.role} />
        </div>
        <div className="space-y-2 pt-4">
          <ThemeToggle className="w-full" />
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-2xl md:shadow-surface md:ring-1 md:ring-foreground/[0.06]">
        {/* Mobile-only. On desktop the sidebar already carries the brand, nav,
            theme toggle and user menu, so this bar would render empty.
            The bar holds nothing but the menu button and the title: theme and
            account live at the bottom of the drawer, where there's room for
            them. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:hidden">
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
              <SheetHeader className="flex-row items-center gap-3 border-b bg-canvas pr-12">
                <Image
                  src="/cap_logo.png"
                  alt="Cap & Gown crest"
                  width={1068}
                  height={1374}
                  className="h-9 w-auto shrink-0"
                />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base font-semibold">
                    Cap & Gown
                  </SheetTitle>
                  <SheetDescription className="truncate text-xs">
                    {semesterName ?? "Budget & Tracking"}
                  </SheetDescription>
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
            <p className="truncate text-[0.95rem] font-semibold leading-tight">
              Cap & Gown
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
        <main className="flex-1 overflow-auto px-4 py-6 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
