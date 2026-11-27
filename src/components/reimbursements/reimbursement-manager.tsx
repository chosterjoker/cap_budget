"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, toDateInput, todayInput } from "@/lib/format";
import { downscaleImage } from "@/lib/image";
import {
  createReimbursement,
  updateReimbursement,
  deleteReimbursement,
  scanReceipt,
} from "@/actions/reimbursements";
import { createCheck, createChecks } from "@/actions/checks";
import {
  frontReimbursements,
  bulkUpdateReimbursements,
  bulkDeleteReimbursements,
  type BulkResult,
} from "@/actions/reimbursements";
import { CameraCapture } from "@/components/common/camera-capture";
import { LoggedAt } from "@/components/common/logged-at";
import { Checkbox } from "@/components/ui/checkbox";
import type { PaymentMethod, ReimbursementStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventSelectContent, type EventOption } from "@/components/common/event-select-content";
import { toast } from "sonner";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Sparkles,
  Loader2,
  Upload,
  Check,
  Camera,
  HandCoins,
  ChevronDown,
  Landmark,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Reimbursement = {
  id: string;
  name: string;
  memberName: string | null;
  amount: number;
  date: Date;
  createdAt: Date;
  status: ReimbursementStatus;
  categoryId: string | null;
  eventId: string | null;
  tags: string | null;
  notes: string | null;
  receiptUrl: string | null;
  parsedData: string | null;
  officer: { id: string; name: string | null; email: string };
  category: { name: string } | null;
  event: { name: string } | null;
  frontedBy: Officer | null;
  frontedAt: Date | null;
  frontedMethod: PaymentMethod | null;
  check: { checkNumber: string } | null;
};

const STATUS_LABEL: Record<ReimbursementStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  // Paid by the treasurer personally; the club still owes the treasurer.
  FRONTED: "Fronted",
  PAID: "Paid",
};

// How the treasurer can pay a member out of pocket. A paper check from a
// personal account is possible but rare, so it sits under "Other".
const FRONT_METHODS = {
  VENMO: "Venmo",
  CASH: "Cash",
  OTHER: "Other",
} as const satisfies Partial<Record<PaymentMethod, string>>;
type FrontMethod = keyof typeof FRONT_METHODS;

type Officer = { id: string; name: string | null; email: string };
type Category = { id: string; name: string };

type SortKey =
  | "name"
  | "member"
  | "officer"
  | "category"
  | "event"
  | "date"
  | "amount"
  | "status";

// Who the reimbursement is paid to. Older rows predate the member field, so
// fall back to the submitting officer.
function payeeOf(r: { memberName: string | null; officer: Officer }) {
  return r.memberName?.trim() || r.officer.name || r.officer.email;
}

// Member names are typed free-hand, so "alex kim " and "Alex Kim" have to land
// in the same filter bucket.
function memberKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function reimbursementCheckNumber() {
  return `R-${Date.now().toString().slice(-6)}`;
}

export function ReimbursementManager({
  semesterId,
  reimbursements,
  officers,
  categories,
  events,
  currentUserId,
  currentUserName,
  isTreasurer,
  ocrEnabled,
}: {
  semesterId: string;
  reimbursements: Reimbursement[];
  officers: Officer[];
  categories: Category[];
  events: EventOption[];
  currentUserId: string;
  currentUserName: string;
  isTreasurer: boolean;
  ocrEnabled: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Reimbursement | null>(null);

  const [search, setSearch] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [officerFilter, setOfficerFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ReimbursementStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Everyone who is owed (or was paid) something this semester. Built from the
  // reimbursements rather than the roster or the officer list: the member being
  // paid is often not the officer who submitted it, and need not be either.
  const members = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const r of reimbursements) {
      const name = payeeOf(r);
      const key = memberKey(name);
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reimbursements]);
  // If the chosen member's last reimbursement is deleted or renamed, fall back
  // to "all" instead of filtering on a name that no longer exists.
  const activeMember = members.some((m) => m.key === memberFilter) ? memberFilter : "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const since = sinceDate ? new Date(sinceDate).getTime() : null;
    return reimbursements.filter((r) => {
      if (q) {
        const hay = `${r.name} ${payeeOf(r)} ${r.officer.name ?? ""} ${r.officer.email} ${r.tags ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const ts = new Date(r.date).getTime();
      if (since && ts < since) return false;
      if (activeMember !== "all" && memberKey(payeeOf(r)) !== activeMember) return false;
      if (officerFilter !== "all" && r.officer.id !== officerFilter) return false;
      if (categoryFilter !== "all" && r.categoryId !== categoryFilter) return false;
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [reimbursements, search, sinceDate, activeMember, officerFilter, categoryFilter, eventFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const get = (r: Reimbursement) => {
        switch (sortKey) {
          case "amount":
            return r.amount;
          case "date":
            return new Date(r.date).getTime();
          case "member":
            return payeeOf(r);
          case "officer":
            return r.officer.name ?? r.officer.email;
          case "category":
            return r.category?.name ?? "";
          case "event":
            return r.event?.name ?? "";
          case "status":
            return r.status;
          default:
            return r[sortKey] as string | number;
        }
      };
      const av = get(a);
      const bv = get(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { all: 0, pending: 0, approved: 0, fronted: 0, paid: 0 };
    for (const r of filtered) {
      t.all += r.amount;
      if (r.status === "PENDING") t.pending += r.amount;
      else if (r.status === "APPROVED") t.approved += r.amount;
      else if (r.status === "FRONTED") t.fronted += r.amount;
      else if (r.status === "PAID") t.paid += r.amount;
    }
    return t;
  }, [filtered]);

  // The treasurer's own reimbursements: submitted by them, for themselves.
  const isMine = useCallback(
    (r: Reimbursement) =>
      r.officer.id === currentUserId && memberKey(payeeOf(r)) === memberKey(currentUserName),
    [currentUserId, currentUserName]
  );

  // Everything the club owes the current treasurer — members they paid
  // personally, plus their own purchases — so one check can settle it all.
  const owedToMe = useMemo(
    () =>
      isTreasurer
        ? reimbursements.filter(
            (r) =>
              (r.status === "FRONTED" && r.frontedBy?.id === currentUserId) ||
              ((r.status === "PENDING" || r.status === "APPROVED") && isMine(r))
          )
        : [],
    [reimbursements, isTreasurer, currentUserId, isMine]
  );
  const [frontItems, setFrontItems] = useState<Reimbursement[] | null>(null);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);

  // Paid rows are settled history; officers can't touch what the treasurer
  // already paid out. Everything else can be edited — one row or in a batch.
  const canEdit = useCallback(
    (r: Reimbursement) =>
      r.status !== "PAID" &&
      (isTreasurer || (r.officer.id === currentUserId && r.status !== "FRONTED")),
    [isTreasurer, currentUserId]
  );
  const isOpen = (r: Reimbursement) => r.status === "PENDING" || r.status === "APPROVED";

  // Batch selection. Holds ids, and is read back through the current list so a
  // row that was deleted or paid elsewhere simply drops out.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selected = useMemo(
    () => reimbursements.filter((r) => selectedIds.has(r.id) && canEdit(r)),
    [reimbursements, selectedIds, canEdit]
  );
  const selectedTotal = selected.reduce((s, r) => s + r.amount, 0);
  const selectableVisible = useMemo(() => sorted.filter(canEdit), [sorted, canEdit]);
  const visibleSelectedCount = selectableVisible.filter((r) => selectedIds.has(r.id)).length;
  const allVisibleSelected =
    selectableVisible.length > 0 && visibleSelectedCount === selectableVisible.length;

  function toggleRow(id: string, on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of selectableVisible) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // Selected rows the treasurer can still pay personally (not their own).
  const frontable = selected.filter((r) => isOpen(r) && !isMine(r));

  async function runBulk(label: string, action: () => Promise<BulkResult>) {
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${label} ${res.count} ${res.count === 1 ? "reimbursement" : "reimbursements"}` +
          (res.skipped ? ` · ${res.skipped} skipped (paid or not yours)` : "")
      );
      setSelectedIds(new Set());
      router.refresh();
    } catch {
      toast.error("Something went wrong — nothing may have changed. Refresh and try again.");
    }
  }

  const hasActiveFilters =
    search !== "" ||
    sinceDate !== "" ||
    activeMember !== "all" ||
    officerFilter !== "all" ||
    categoryFilter !== "all" ||
    eventFilter !== "all" ||
    statusFilter !== "all";

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortHeader(k: SortKey, label: React.ReactNode, align?: "right") {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={align === "right" ? "text-right" : undefined}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 font-medium ${
            align === "right" ? "ml-auto" : ""
          }`}
        >
          {label}
          <Icon className="h-3 w-3 opacity-60" />
        </button>
      </TableHead>
    );
  }

  function clearFilters() {
    setSearch("");
    setSinceDate("");
    setMemberFilter("all");
    setOfficerFilter("all");
    setCategoryFilter("all");
    setEventFilter("all");
    setStatusFilter("all");
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("semesterId", semesterId);
    if (!fd.get("categoryId")) {
      toast.error("Select a budget category for this reimbursement.");
      return;
    }
    try {
      await createReimbursement(fd);
      toast.success("Reimbursement submitted");
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    if (!fd.get("categoryId")) {
      toast.error("Select a budget category for this reimbursement.");
      return;
    }
    try {
      await updateReimbursement(editing.id, {
        name: fd.get("name") as string,
        memberName:
          ((fd.get("memberName") as string) || "").trim() || payeeOf(editing),
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        categoryId: ((fd.get("categoryId") as string) || null) as string | null,
        eventId: ((fd.get("eventId") as string) || null) as string | null,
        tags: ((fd.get("tags") as string) || null) as string | null,
        notes: ((fd.get("notes") as string) || null) as string | null,
        status: isTreasurer
          ? ((fd.get("status") as ReimbursementStatus | null) ?? editing.status)
          : undefined,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function bundleToCheck(payee: string) {
    const pending = reimbursements.filter(
      (r) => payeeOf(r) === payee && r.status === "APPROVED"
    );
    if (!pending.length) {
      toast.error("No approved reimbursements for this member");
      return;
    }
    const total = pending.reduce((s, r) => s + r.amount, 0);
    try {
      await createCheck({
        semesterId,
        checkNumber: reimbursementCheckNumber(),
        description: `Reimbursement — ${payee}`,
        amount: total,
        date: todayInput(),
        recipientName: payee,
        paymentMethod: "CHECK",
        reimbursementIds: pending.map((r) => r.id),
      });
      toast.success("Check created and reimbursements marked paid");
      router.refresh();
    } catch {
      toast.error("Failed to create check");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, member, officer, tags, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {reimbursements.length} · Pending {formatCurrency(totals.pending)} · Approved {formatCurrency(totals.approved)}
          {totals.fronted > 0 && <> · Fronted {formatCurrency(totals.fronted)}</>} · Paid {formatCurrency(totals.paid)}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm">Submit reimbursement</Button>} />
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New reimbursement</DialogTitle>
              </DialogHeader>
              <CreateReimbursementForm
                onSubmit={handleCreate}
                categories={categories}
                events={events}
                currentUserName={currentUserName}
                ocrEnabled={ocrEnabled}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {owedToMe.length > 0 && (
        <OwedToYouBanner
          items={owedToMe}
          isMine={isMine}
          onWriteCheck={() => setSelfCheckOpen(true)}
        />
      )}

      {selected.length > 0 && (
        <div className="surface sticky top-2 z-10 flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.length} selected
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              {formatCurrency(selectedTotal)}
            </span>
            {selected.length > visibleSelectedCount && (
              <span className="ml-1.5 font-normal text-warning-fg">
                · {selected.length - visibleSelectedCount} hidden by filters
              </span>
            )}
          </span>
          <Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>
            <X /> Clear
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {isTreasurer && frontable.length > 0 && (
              <Button size="sm" onClick={() => setFrontItems(frontable)}>
                <HandCoins /> I paid them myself
              </Button>
            )}
            {isTreasurer && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm">
                      Status <ChevronDown data-icon="inline-end" className="opacity-70" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {(["APPROVED", "PENDING"] as const).map((st) => (
                    <DropdownMenuItem
                      key={st}
                      onClick={() =>
                        runBulk(
                          `Marked ${STATUS_LABEL[st].toLowerCase()}:`,
                          () => bulkUpdateReimbursements(selected.map((r) => r.id), { status: st })
                        )
                      }
                    >
                      Mark {STATUS_LABEL[st].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    Category <ChevronDown data-icon="inline-end" className="opacity-70" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {categories.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() =>
                      runBulk("Moved to " + c.name + ":", () =>
                        bulkUpdateReimbursements(selected.map((r) => r.id), { categoryId: c.id })
                      )
                    }
                  >
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    Event <ChevronDown data-icon="inline-end" className="opacity-70" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() =>
                    runBulk("Cleared event on", () =>
                      bulkUpdateReimbursements(selected.map((r) => r.id), { eventId: null })
                    )
                  }
                >
                  No event
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {events.map((ev) => (
                  <DropdownMenuItem
                    key={ev.id}
                    onClick={() =>
                      runBulk("Tagged " + ev.name + " on", () =>
                        bulkUpdateReimbursements(selected.map((r) => r.id), { eventId: ev.id })
                      )
                    }
                  >
                    <span className="truncate">{ev.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                if (
                  confirm(
                    `Delete ${selected.length} ${selected.length === 1 ? "reimbursement" : "reimbursements"} (${formatCurrency(selectedTotal)})? This can't be undone.`
                  )
                ) {
                  runBulk("Deleted", () => bulkDeleteReimbursements(selected.map((r) => r.id)));
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}

      <div className="surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                {selectableVisible.length > 0 && (
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={visibleSelectedCount > 0 && !allVisibleSelected}
                    onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                    aria-label="Select all shown"
                  />
                )}
              </TableHead>
              <TableHead>Receipt</TableHead>
              {sortHeader("name", "Description")}
              {sortHeader("member", "Member")}
              {sortHeader("officer", "Submitted by")}
              {sortHeader("category", "Category")}
              {sortHeader("event", "Event")}
              {sortHeader("date", "Date")}
              {sortHeader("amount", "Amount", "right")}
              {sortHeader("status", "Status")}
              <TableHead />
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-transparent">
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5">
                <Select value={activeMember} onValueChange={(v) => setMemberFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${activeMember === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {activeMember === "all"
                        ? "All"
                        : members.find((m) => m.key === activeMember)?.name ?? "All"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All members</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Select value={officerFilter} onValueChange={(v) => setOfficerFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${officerFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {officerFilter === "all"
                        ? "All"
                        : (() => {
                            const o = officers.find((o) => o.id === officerFilter);
                            return o ? o.name || o.email : "All";
                          })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All officers</SelectItem>
                    {officers.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name || o.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${categoryFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {categoryFilter === "all"
                        ? "All"
                        : categories.find((c) => c.id === categoryFilter)?.name ?? "All"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Select value={eventFilter} onValueChange={(v) => setEventFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${eventFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {eventFilter === "all"
                        ? "All"
                        : events.find((e) => e.id === eventFilter)?.name ?? "All"}
                    </SelectValue>
                  </SelectTrigger>
                  <EventSelectContent events={events}>
                    <SelectItem value="all">All events</SelectItem>
                  </EventSelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Input
                  type="date"
                  value={sinceDate}
                  onChange={(e) => setSinceDate(e.target.value)}
                  aria-label="Show reimbursements on or after this date"
                  title="Show reimbursements on or after this date"
                  className="h-7 w-32 px-1.5 font-normal"
                />
              </TableHead>
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "all") as typeof statusFilter)}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${statusFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {statusFilter === "all"
                        ? "All"
                        : STATUS_LABEL[statusFilter]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              let parsed: { amount?: number; vendor?: string } | null = null;
              if (r.parsedData) {
                try {
                  parsed = JSON.parse(r.parsedData);
                } catch {
                  parsed = null;
                }
              }
              const editable = canEdit(r);
              const open = isOpen(r);
              const isSelected = editable && selectedIds.has(r.id);
              return (
                <TableRow key={r.id} data-state={isSelected ? "selected" : undefined}>
                  <TableCell className="w-8 pr-0">
                    {editable && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => toggleRow(r.id, Boolean(v))}
                        aria-label={`Select ${r.name}`}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {r.receiptUrl ? (
                      <div className="relative h-12 w-12 overflow-hidden rounded border">
                        <Image src={r.receiptUrl} alt="Receipt" fill className="object-cover" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{r.name}</p>
                      {r.tags && <p className="text-xs text-muted-foreground">{r.tags}</p>}
                      {parsed && (
                        <p className="text-xs text-success-fg">
                          OCR: {parsed.vendor && `${parsed.vendor} · `}
                          {parsed.amount && formatCurrency(parsed.amount)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{payeeOf(r)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.officer.name || r.officer.email}
                  </TableCell>
                  <TableCell>{r.category?.name ?? "—"}</TableCell>
                  <TableCell>{r.event?.name ?? "—"}</TableCell>
                  <TableCell>
                    {formatDate(r.date)}
                    <LoggedAt date={r.createdAt} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatCurrency(r.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "PAID" || r.status === "FRONTED"
                          ? "default"
                          : r.status === "APPROVED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.frontedBy && r.status !== "PENDING" && r.status !== "APPROVED" && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {r.status === "FRONTED" ? "by" : "Fronted by"}{" "}
                        {r.frontedBy.id === currentUserId
                          ? "you"
                          : r.frontedBy.name?.split(" ")[0] || r.frontedBy.email}
                        {r.status === "FRONTED" &&
                          r.frontedMethod &&
                          ` · ${FRONT_METHODS[r.frontedMethod as FrontMethod] ?? r.frontedMethod}`}
                      </span>
                    )}
                    {r.status === "PAID" && r.check && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        Check #{r.check.checkNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {isTreasurer && (r.status === "APPROVED" || (open && !isMine(r))) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button size="sm" variant={r.status === "APPROVED" ? "default" : "outline"}>
                                Pay <ChevronDown data-icon="inline-end" className="opacity-70" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-60">
                            {r.status === "APPROVED" && (
                              <DropdownMenuItem onClick={() => bundleToCheck(payeeOf(r))}>
                                <Landmark />
                                Club check to {payeeOf(r)}
                              </DropdownMenuItem>
                            )}
                            {open && !isMine(r) && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setFrontItems(
                                    reimbursements.filter(
                                      (x) => payeeOf(x) === payeeOf(r) && isOpen(x)
                                    )
                                  )
                                }
                              >
                                <HandCoins />
                                I paid them myself
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {editable && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${r.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(r)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={async () => {
                                if (confirm(`Delete "${r.name}"?`)) {
                                  try {
                                    await deleteReimbursement(r.id);
                                    router.refresh();
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Failed to delete");
                                  }
                                }
                              }}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                  No reimbursements match the current filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {isTreasurer && (
        <>
          <FrontDialog
            items={frontItems}
            onClose={() => setFrontItems(null)}
            onDone={() => setSelectedIds(new Set())}
          />
          <SelfCheckDialog
            open={selfCheckOpen}
            onOpenChange={setSelfCheckOpen}
            semesterId={semesterId}
            items={owedToMe}
            payee={currentUserName}
          />
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit reimbursement</DialogTitle>
          </DialogHeader>
          {editing && (
            <EditReimbursementForm
              onSubmit={handleEdit}
              categories={categories}
              events={events}
              defaults={editing}
              isTreasurer={isTreasurer}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScanState = "idle" | "scanning" | "done" | "empty" | "error";

function CreateReimbursementForm({
  onSubmit,
  categories,
  events,
  currentUserName,
  ocrEnabled,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  categories: Category[];
  events: EventOption[];
  currentUserName: string;
  ocrEnabled: boolean;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput());
  const [parsedData, setParsedData] = useState("");
  const [scan, setScan] = useState<ScanState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Single entry point for a receipt image, whether it came from the file
   * picker or the live camera: shrink it, push it into the file input so the
   * form still submits the image, then OCR it to pre-fill the fields.
   */
  async function ingestReceipt(original: File, displayName?: string) {
    setParsedData("");
    // Shrink big phone photos before they leave the browser — Vercel caps
    // request bodies at ~4.5MB and OpenAI rejects images over ~20MB. Swap the
    // downscaled file back into the input so the *stored* receipt is small too.
    const file = await downscaleImage(original);
    const input = fileInputRef.current;
    if (input) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } catch {
        // DataTransfer unsupported — submit falls back to whatever the input
        // already holds (the original file, or nothing for a camera capture).
      }
    }
    setFileName(displayName ?? original.name);
    if (!ocrEnabled || !file.type.startsWith("image/")) {
      setScan("idle");
      return;
    }
    setScan("scanning");
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const parsed = await scanReceipt(fd);
      if (
        !parsed ||
        (parsed.amount == null && !parsed.date && !parsed.description && !parsed.vendor)
      ) {
        setScan("empty");
        return;
      }
      if (parsed.amount != null) setAmount(String(parsed.amount));
      if (parsed.date) setDate(parsed.date);
      const desc = parsed.description || parsed.vendor;
      if (desc) setName((prev) => prev.trim() || desc);
      setParsedData(JSON.stringify(parsed));
      setScan("done");
    } catch {
      setScan("error");
    }
  }

  async function handleReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) {
      setParsedData("");
      setFileName(null);
      setScan("idle");
      return;
    }
    await ingestReceipt(original);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Receipt image
          {ocrEnabled && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Sparkles className="h-3 w-3" /> auto-fills below
            </span>
          )}
        </Label>
        <input
          ref={fileInputRef}
          id="receipt-upload"
          name="receipt"
          type="file"
          accept="image/*"
          onChange={handleReceipt}
          className="sr-only"
        />
        <label
          htmlFor="receipt-upload"
          className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors hover:bg-muted/50 ${
            fileName ? "border-success/50 bg-success-muted" : "border-input"
          }`}
        >
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
              fileName ? "bg-success-muted text-success-fg" : "bg-muted text-muted-foreground"
            }`}
          >
            {scan === "scanning" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : fileName ? (
              <Check className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {fileName ?? "Choose receipt image"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {fileName ? "Click to replace" : "Upload a photo, or scan one with your camera below"}
            </span>
          </span>
          <span className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium">
            Browse
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setCameraOpen(true)}
        >
          <Camera className="h-4 w-4" /> Scan with camera
        </Button>
        <CameraCapture
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={(file) => ingestReceipt(file, "Camera photo")}
        />
        <input type="hidden" name="parsedData" value={parsedData} />
        {scan === "scanning" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Scanning receipt…
          </p>
        )}
        {scan === "done" && (
          <p className="flex items-center gap-1.5 text-xs text-success-fg">
            <Sparkles className="h-3 w-3" /> Auto-filled from receipt — review before submitting.
          </p>
        )}
        {scan === "empty" && (
          <p className="text-xs text-warning-fg">
            Couldn&apos;t read the receipt. Enter the details manually.
          </p>
        )}
        {scan === "error" && (
          <p className="text-xs text-warning-fg">
            Scan failed. Enter the details manually.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Name / description</Label>
        <Input
          name="name"
          required
          placeholder="What did you buy?"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Member / paid to</Label>
        <Input
          name="memberName"
          required
          defaultValue={currentUserName}
          placeholder="Who is being reimbursed?"
        />
        <p className="text-xs text-muted-foreground">
          Defaults to you — change it if you&apos;re submitting for another member.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category <span className="text-destructive">*</span></Label>
          <Select
            name="categoryId"
            required
            items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label>Event</Label>
          <Select
            name="eventId"
            items={Object.fromEntries(events.map((e) => [e.id, e.name]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <EventSelectContent events={events} />
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tags</Label>
        <Input name="tags" placeholder="Optional, comma-separated" />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input name="notes" />
      </div>
      <Button type="submit" className="w-full">
        Submit
      </Button>
    </form>
  );
}

function EditReimbursementForm({
  onSubmit,
  categories,
  events,
  defaults,
  isTreasurer,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  categories: Category[];
  events: EventOption[];
  defaults: Reimbursement;
  isTreasurer: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name / description</Label>
        <Input name="name" required defaultValue={defaults.name} />
      </div>
      <div className="space-y-2">
        <Label>Member / paid to</Label>
        <Input name="memberName" required defaultValue={payeeOf(defaults)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input name="amount" type="number" step="0.01" required defaultValue={defaults.amount} />
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            name="date"
            type="date"
            required
            defaultValue={toDateInput(defaults.date)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category <span className="text-destructive">*</span></Label>
          <Select
            name="categoryId"
            required
            defaultValue={defaults.categoryId ?? undefined}
            items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label>Event</Label>
          <Select
            name="eventId"
            defaultValue={defaults.eventId ?? undefined}
            items={Object.fromEntries(events.map((e) => [e.id, e.name]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <EventSelectContent events={events} />
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tags</Label>
        <Input name="tags" defaultValue={defaults.tags ?? ""} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input name="notes" defaultValue={defaults.notes ?? ""} />
      </div>
      {isTreasurer && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Label>Status</Label>
          <Select
            name="status"
            defaultValue={defaults.status}
            items={STATUS_LABEL}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" className="w-full">
        Save
      </Button>
    </form>
  );
}

/**
 * The treasurer's running tab with the club: members they paid personally plus
 * their own purchases, with the one-click way to settle it.
 */
function OwedToYouBanner({
  items,
  isMine,
  onWriteCheck,
}: {
  items: Reimbursement[];
  isMine: (r: Reimbursement) => boolean;
  onWriteCheck: () => void;
}) {
  const total = items.reduce((s, r) => s + r.amount, 0);
  const own = items.filter(isMine).length;
  const fronted = items.length - own;
  const parts = [
    fronted > 0 && `${fronted} you paid for others`,
    own > 0 && `${own} of your own`,
  ].filter(Boolean);
  return (
    <div className="surface flex flex-wrap items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <HandCoins className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          The club owes you <span className="tabular-nums">{formatCurrency(total)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {parts.join(" · ")} — settle them all with one check to yourself.
        </p>
      </div>
      <Button size="sm" onClick={onWriteCheck}>
        Write check to myself
      </Button>
    </div>
  );
}

/**
 * Record that the treasurer paid members personally. Rows are grouped by who
 * was paid, with a subtotal each — that subtotal is the Venmo to send.
 */
function FrontDialog({
  items,
  onClose,
  onDone,
}: {
  items: Reimbursement[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<FrontMethod>("VENMO");
  const [saving, setSaving] = useState(false);
  const list = items ?? [];
  const chosen = list.filter((r) => !excluded.has(r.id));
  const total = chosen.reduce((s, r) => s + r.amount, 0);

  const groups = useMemo(() => {
    const byPayee = new Map<string, Reimbursement[]>();
    for (const r of items ?? []) {
      const key = payeeOf(r);
      const g = byPayee.get(key);
      if (g) g.push(r);
      else byPayee.set(key, [r]);
    }
    return [...byPayee].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const single = groups.length === 1 ? groups[0][0] : null;

  function close() {
    setExcluded(new Set());
    onClose();
  }

  function toggle(ids: string[], on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await frontReimbursements(
        chosen.map((r) => r.id),
        method
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Recorded — the club now owes you ${formatCurrency(total)} for this`);
      close();
      onDone();
      router.refresh();
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={items !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {single ? `Paid ${single} yourself?` : `Paid ${groups.length} people yourself?`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This marks them as paid. The club then owes you, and you can settle
          that later with one check to yourself.
        </p>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-2">
          {groups.map(([payee, rows]) => {
            const ids = rows.map((r) => r.id);
            const on = rows.filter((r) => !excluded.has(r.id));
            return (
              <div key={payee}>
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 text-sm font-medium hover:bg-muted/50">
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={on.length === rows.length}
                      indeterminate={on.length > 0 && on.length < rows.length}
                      onCheckedChange={(v) => toggle(ids, Boolean(v))}
                    />
                    {payee}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(on.reduce((s, r) => s + r.amount, 0))}
                  </span>
                </label>
                {rows.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded py-1 pr-1 pl-7 text-sm hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={!excluded.has(r.id)}
                        onCheckedChange={(v) => toggle([r.id], Boolean(v))}
                      />
                      <span className="truncate">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(r.date)}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(r.amount)}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>How you paid</Label>
            <Select
              value={method}
              onValueChange={(v) => v && setMethod(v as FrontMethod)}
              items={FRONT_METHODS}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FRONT_METHODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pb-2 text-right">
            <p className="text-xs text-muted-foreground">You paid</p>
            <p className="font-semibold tabular-nums">{formatCurrency(total)}</p>
          </div>
        </div>
        <Button className="w-full" disabled={!chosen.length || saving} onClick={save}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Mark as paid by me
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One check from the club to the treasurer covering everything they're owed.
 * Each reimbursement it pays moves to PAID and keeps its own budget category,
 * so the check itself adds no new spend.
 */
function SelfCheckDialog({
  open,
  onOpenChange,
  semesterId,
  items,
  payee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  items: Reimbursement[];
  payee: string;
}) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [checkNumber, setCheckNumber] = useState("");
  const [date, setDate] = useState(todayInput());
  const [saving, setSaving] = useState(false);
  const selected = items.filter((r) => !excluded.has(r.id));
  // Summing floats drifts (0.1 + 0.2); a check is written in whole cents.
  const total = Math.round(selected.reduce((s, r) => s + r.amount, 0) * 100) / 100;

  function setOpen(o: boolean) {
    if (!o) {
      setExcluded(new Set());
      setCheckNumber("");
    }
    onOpenChange(o);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createChecks(semesterId, [
        {
          checkNumber: checkNumber.trim(),
          description: `Reimbursement — ${payee} (${selected.length} ${
            selected.length === 1 ? "item" : "items"
          })`,
          amount: total,
          date,
          recipientName: payee,
          paymentMethod: "CHECK",
          reimbursementIds: selected.map((r) => r.id),
        },
      ]);
      if (!res.ok) {
        toast.error(res.error.replace(/^Check 1: /, ""));
        return;
      }
      toast.success(`Check #${checkNumber.trim()} logged — ${selected.length} reimbursements paid`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to create check");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Write check to myself</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {items.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={!excluded.has(r.id)}
                    onCheckedChange={(v) =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (v) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.status === "FRONTED" ? `Paid ${payeeOf(r)}` : "Your purchase"}
                    </span>
                  </span>
                </span>
                <span className="tabular-nums">{formatCurrency(r.amount)}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check #</Label>
              <Input
                required
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="e.g. 1042"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">Pay to {payee}</span>
            <span className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
          <Button type="submit" className="w-full" disabled={!selected.length || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Log check
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
