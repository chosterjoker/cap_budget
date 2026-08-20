"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Role } from "@prisma/client";

type SessionUser = {
  name?: string | null;
  email: string;
  image?: string | null;
  role: Role;
};

function initialsFor(user: SessionUser) {
  return (
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || user.email[0].toUpperCase()
  );
}

function roleLabel(role: Role) {
  return role === "TREASURER" ? "Treasurer" : "Officer";
}

/** Desktop sidebar footer: the account collapsed into a dropdown. */
export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg p-2 hover:bg-muted">
        <Avatar>
          <AvatarImage src={user.image ?? undefined} />
          <AvatarFallback>{initialsFor(user)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col items-start text-left text-sm">
          <span className="w-full truncate font-medium">
            {user.name || user.email}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {roleLabel(user.role)}
          </Badge>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Mobile drawer footer: the same account, laid flat. A dropdown nested inside
 * the drawer would stack one popup on another on a small screen, so the details
 * and the sign-out action stay visible instead.
 */
export function UserPanel({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarImage src={user.image ?? undefined} />
          <AvatarFallback>{initialsFor(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {user.name || user.email}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {roleLabel(user.role)}
        </Badge>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
