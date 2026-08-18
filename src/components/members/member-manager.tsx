"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import type { MembershipStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/format";
import {
  MEMBERSHIP_BADGE,
  MEMBERSHIP_LABELS,
  MEMBERSHIP_STATUSES,
  collectionTone,
  duesOwedFor,
  formatClassYear,
  impliedAmountPaid,
  membershipStatusOrder,
} from "@/lib/membership";
import {
  createMember,
  deleteMember,
  importMembershipCsv,
  setDuesAmount,
  setMemberStatuses,
  updateMember,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatRow, StatTile } from "@/components/common/stat-tile";
import { EmptyRow } from "@/components/common/empty-state";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type Member = {
  id: string;
  name: string;
  email: string | null;
  classYear: number | null;
  status: MembershipStatus;
  amountPaid: number;
  notes: string | null;
};

type SortKey = "name" | "email" | "classYear" | "status" | "amountPaid" | "balance";

export function MemberManager({
  semesterId,
  members,
  duesAmount,
  isTreasurer,
}: {
  semesterId: string;
  members: Member[];
  duesAmount: number;
  isTreasurer: boolean;
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<MembershipStatus>("BILLED");
  const [bulkSetsAmount, setBulkSetsAmount] = useState(true);

  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const classYears = useMemo(
    () =>
      Array.from(
        new Set(members.map((m) => m.classYear).filter((y): y is number => y != null))
      ).sort((a, b) => a - b),
    [members]
  );

  const totals = useMemo(() => {
    const expected = members.reduce(
      (sum, m) => sum + duesOwedFor(m.status, duesAmount),
      0
    );
    const collected = members.reduce((sum, m) => sum + m.amountPaid, 0);
    return {
      expected,
      collected,
      outstanding: Math.max(expected - collected, 0),
      paidFull: members.filter((m) => m.status === "PAID_FULL").length,
      unsettled: members.filter(
        (m) => m.status !== "PAID_FULL" && m.status !== "WAIVED"
      ).length,
    };
  }, [members, duesAmount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !(m.email ?? "").toLowerCase().includes(q) &&
        !(m.notes ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (yearFilter !== "all" && String(m.classYear ?? "") !== yearFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      return true;
    });
  }, [members, search, yearFilter, statusFilter]);

  const sorted = useMemo(() => {
    const value = (m: Member): string | number => {
      switch (sortKey) {
        case "status":
          return membershipStatusOrder(m.status);
        case "classYear":
          return m.classYear ?? Number.MAX_SAFE_INTEGER;
        case "balance":
          return duesOwedFor(m.status, duesAmount) - m.amountPaid;
        case "email":
          return (m.email ?? "").toLowerCase();
        case "name":
          return m.name.toLowerCase();
        default:
          return m[sortKey];
      }
    };
    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, duesAmount]);

  const hasActiveFilters =
    search !== "" || yearFilter !== "all" || statusFilter !== "all";

  // Selection is keyed by id, so it survives re-filtering. The header checkbox
  // acts on what's currently visible, which is what "select all" means once a
  // filter is on.
  const visibleIds = sorted.map((m) => m.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

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
    setYearFilter("all");
    setStatusFilter("all");
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("semesterId", semesterId);
    setBusy(true);
    try {
      const r = await importMembershipCsv(fd);
      const parts = [`${r.created} new`, `${r.updated} updated`];
      if (r.unchanged) parts.push(`${r.unchanged} unchanged`);
      toast.success(
        `Imported ${r.total} members: ${parts.join(", ")}` +
          (r.skipped ? ` — ${r.skipped} skipped for having no email` : "")
      );
      setImportOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const year = (fd.get("classYear") as string).trim();
    try {
      await createMember({
        semesterId,
        name: fd.get("name") as string,
        email: (fd.get("email") as string) || undefined,
        classYear: year ? Number(year) : undefined,
        status: fd.get("status") as MembershipStatus,
        amountPaid: parseFloat((fd.get("amountPaid") as string) || "0") || 0,
        notes: (fd.get("notes") as string) || undefined,
      });
      toast.success("Member added");
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const year = (fd.get("classYear") as string).trim();
    try {
      await updateMember(editing.id, {
        name: fd.get("name") as string,
        email: ((fd.get("email") as string) || null) as string | null,
        classYear: year ? Number(year) : null,
        status: fd.get("status") as MembershipStatus,
        amountPaid: parseFloat((fd.get("amountPaid") as string) || "0") || 0,
        notes: ((fd.get("notes") as string) || null) as string | null,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleBulkApply() {
    const ids = [...selected];
    if (!ids.length) return;
    const implied = impliedAmountPaid(bulkStatus, duesAmount);
    const setsAmount = bulkSetsAmount && implied > 0;
    setBusy(true);
    try {
      const { count } = await setMemberStatuses(
        ids,
        bulkStatus,
        setsAmount ? implied : undefined
      );
      toast.success(
        `${count} ${count === 1 ? "member" : "members"} marked ${MEMBERSHIP_LABELS[
          bulkStatus
        ].toLowerCase()}`
      );
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuesSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await setDuesAmount(semesterId, parseFloat(fd.get("dues") as string) || 0);
      toast.success("Dues rate saved");
      router.refresh();
    } catch {
      toast.error("Failed to save dues rate");
    }
  }

  const bulkImplied = impliedAmountPaid(bulkStatus, duesAmount);

  return (
    <div className="space-y-6">
      <StatRow>
        <StatTile
          label="Members"
          value={String(members.length)}
          hint={
            classYears.length
              ? classYears
                  .map(
                    (y) =>
                      `${formatClassYear(y)} · ${members.filter((m) => m.classYear === y).length}`
                  )
                  .join("   ")
              : "No class years on file"
          }
        />
        <StatTile
          label="Paid in full"
          value={`${totals.paidFull} / ${members.length}`}
          hint={`${totals.unsettled} still owe something`}
          tone={
            members.length && totals.paidFull === members.length ? "success" : "default"
          }
        />
        <StatTile
          label="Dues collected"
          value={formatCurrency(totals.collected)}
          hint={
            duesAmount > 0
              ? `of ${formatCurrency(totals.expected)} expected`
              : "Set a dues rate to track what's expected"
          }
          tone={collectionTone(totals.collected, totals.expected)}
        />
        <StatTile
          label="Outstanding"
          value={formatCurrency(totals.outstanding)}
          hint={`${formatCurrency(duesAmount)} per member this semester`}
          tone={totals.outstanding > 0 ? "warning" : "success"}
        />
      </StatRow>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="member-search">Search</Label>
            <Input
              id="member-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, or note"
              className="w-56"
            />
          </div>
          {isTreasurer && (
            <form onSubmit={handleDuesSubmit} className="flex items-end gap-2">
              <div className="space-y-2">
                <Label htmlFor="dues">Dues per member</Label>
                <Input
                  id="dues"
                  name="dues"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={duesAmount}
                  className="w-32"
                />
              </div>
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>

        {isTreasurer && (
          <div className="flex items-center gap-2">
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    Import CSV
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import membership list</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleImport} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Upload the Google Sheets CSV. Side-by-side class-year columns
                    are read as one roster. Members are matched by email, so
                    re-uploading refreshes names and class years and leaves
                    payment status untouched.
                  </p>
                  <div className="space-y-2">
                    <Label>CSV file</Label>
                    <Input name="file" type="file" accept=".csv" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Importing…" : "Import"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger render={<Button size="sm">Add member</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add member</DialogTitle>
                </DialogHeader>
                <MemberForm onSubmit={handleCreate} duesAmount={duesAmount} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isTreasurer && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <Select
            value={bulkStatus}
            onValueChange={(v) => setBulkStatus((v ?? "BILLED") as MembershipStatus)}
            items={MEMBERSHIP_LABELS}
          >
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MEMBERSHIP_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkImplied > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={bulkSetsAmount}
                onCheckedChange={(v) => setBulkSetsAmount(v === true)}
              />
              Also set amount paid to {formatCurrency(bulkImplied)}
            </label>
          )}
          <Button size="sm" onClick={handleBulkApply} disabled={busy}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {isTreasurer && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all shown"
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => toggleAllVisible(v === true)}
                  />
                </TableHead>
              )}
              {sortHeader("name", "Name")}
              {sortHeader("email", "Email")}
              {sortHeader("classYear", "Class")}
              {sortHeader("status", "Status")}
              {sortHeader("amountPaid", "Paid", "right")}
              {sortHeader("balance", "Balance", "right")}
              <TableHead>Notes</TableHead>
              {isTreasurer && <TableHead />}
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-transparent">
              {isTreasurer && <TableHead className="h-auto py-1.5" />}
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5">
                <Select value={yearFilter} onValueChange={(v) => setYearFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${yearFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {yearFilter === "all" ? "All" : formatClassYear(Number(yearFilter))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {classYears.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {formatClassYear(y)} ({y})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v ?? "all")}
                >
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${statusFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {statusFilter === "all"
                        ? "All"
                        : MEMBERSHIP_LABELS[statusFilter as MembershipStatus]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {MEMBERSHIP_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {MEMBERSHIP_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              {isTreasurer && <TableHead className="h-auto py-1.5" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => {
              const balance = duesOwedFor(m.status, duesAmount) - m.amountPaid;
              return (
                <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                  {isTreasurer && (
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${m.name}`}
                        checked={selected.has(m.id)}
                        onCheckedChange={(v) => toggleOne(m.id, v === true)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatClassYear(m.classYear)}
                  </TableCell>
                  <TableCell>
                    <Badge className={MEMBERSHIP_BADGE[m.status]}>
                      {MEMBERSHIP_LABELS[m.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(m.amountPaid)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      balance > 0 ? "text-warning-fg" : "text-muted-foreground"
                    )}
                  >
                    {balance > 0 ? formatCurrency(balance) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                    {m.notes || "—"}
                  </TableCell>
                  {isTreasurer && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`Remove ${m.name} from this semester's roster?`))
                              return;
                            try {
                              await deleteMember(m.id);
                              toast.success("Member removed");
                              router.refresh();
                            } catch {
                              toast.error("Failed to remove member");
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={isTreasurer ? 9 : 7}>
                  <EmptyRow>
                    {members.length === 0
                      ? "No members yet. Import the CSV or add one manually."
                      : "No members match these filters."}
                  </EmptyRow>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
          </DialogHeader>
          {editing && (
            <MemberForm
              key={editing.id}
              onSubmit={handleUpdate}
              defaults={editing}
              duesAmount={duesAmount}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberForm({
  onSubmit,
  defaults,
  duesAmount,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  defaults?: Member;
  duesAmount: number;
}) {
  // Status drives the amount field: picking "Paid semester" fills in the full
  // dues, "Paid half" fills half. It stays editable so an odd partial payment
  // can be typed over the suggestion.
  const [status, setStatus] = useState<MembershipStatus>(
    defaults?.status ?? "NOT_BILLED"
  );
  const [amount, setAmount] = useState(String(defaults?.amountPaid ?? 0));

  function pickStatus(next: MembershipStatus) {
    setStatus(next);
    const implied = impliedAmountPaid(next, duesAmount);
    if (implied > 0) setAmount(String(implied));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input name="name" required defaultValue={defaults?.name} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={defaults?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>Class year</Label>
          <Input
            name="classYear"
            type="number"
            min="2000"
            max="2100"
            placeholder="2028"
            defaultValue={defaults?.classYear ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            name="status"
            value={status}
            onValueChange={(v) => pickStatus((v ?? "NOT_BILLED") as MembershipStatus)}
            items={MEMBERSHIP_LABELS}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MEMBERSHIP_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Amount paid</Label>
          <Input
            name="amountPaid"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input
          name="notes"
          placeholder="e.g. paying in two instalments"
          defaultValue={defaults?.notes ?? ""}
        />
      </div>
      <Button type="submit" className="w-full">
        Save
      </Button>
    </form>
  );
}
