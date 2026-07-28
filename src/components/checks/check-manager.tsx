"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, toDateInput, todayInput } from "@/lib/format";
import { createCheck, updateCheck, deleteCheck } from "@/actions/checks";
import { ScanChecksDialog } from "@/components/checks/scan-checks-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import type { PaymentMethod } from "@prisma/client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type CheckRow = {
  id: string;
  checkNumber: string;
  description: string;
  amount: number;
  date: Date;
  recipientName: string;
  paymentMethod: PaymentMethod;
  cleared: boolean;
  clearedDate: Date | null;
  memo: string | null;
  categoryId: string | null;
  eventId: string | null;
  category: { name: string } | null;
  event: { name: string } | null;
  // > 0 when this check settles reimbursements rather than being a manual payment.
  _count: { reimbursements: number };
};

type Category = { id: string; name: string };
type EventOption = { id: string; name: string; date: Date };
type Reimbursement = { id: string; name: string; amount: number; memberName: string };

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CHECK: "Check",
  WIRE_TRANSFER: "Wire",
  CREDIT_CARD: "Credit card",
  VENMO: "Venmo",
  CASH: "Cash",
  OTHER: "Other",
};

type SortKey =
  | "checkNumber"
  | "description"
  | "recipientName"
  | "category"
  | "event"
  | "paymentMethod"
  | "date"
  | "amount"
  | "cleared";

export function CheckManager({
  semesterId,
  checks,
  categories,
  events,
  reimbursements,
  isTreasurer,
  ocrEnabled,
}: {
  semesterId: string;
  checks: CheckRow[];
  categories: Category[];
  events: EventOption[];
  reimbursements: Reimbursement[];
  isTreasurer: boolean;
  ocrEnabled: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CheckRow | null>(null);

  const [search, setSearch] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "cleared" | "uncleared">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const since = sinceDate ? new Date(sinceDate).getTime() : null;
    return checks.filter((c) => {
      if (q) {
        const hay = `${c.checkNumber} ${c.description} ${c.recipientName} ${c.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const ts = new Date(c.date).getTime();
      if (since && ts < since) return false;
      if (categoryFilter !== "all" && c.categoryId !== categoryFilter) return false;
      if (eventFilter !== "all" && c.eventId !== eventFilter) return false;
      if (methodFilter !== "all" && c.paymentMethod !== methodFilter) return false;
      if (statusFilter === "cleared" && !c.cleared) return false;
      if (statusFilter === "uncleared" && c.cleared) return false;
      return true;
    });
  }, [checks, search, sinceDate, categoryFilter, eventFilter, methodFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const get = (c: CheckRow) => {
        switch (sortKey) {
          case "amount":
            return c.amount;
          case "date":
            return new Date(c.date).getTime();
          case "category":
            return c.category?.name ?? "";
          case "event":
            return c.event?.name ?? "";
          case "cleared":
            return c.cleared ? 1 : 0;
          default:
            return (c[sortKey] ?? "") as string | number;
        }
      };
      const av = get(a);
      const bv = get(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const total = filtered.reduce((s, c) => s + c.amount, 0);
  const hasActiveFilters =
    search !== "" ||
    sinceDate !== "" ||
    categoryFilter !== "all" ||
    eventFilter !== "all" ||
    methodFilter !== "all" ||
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
    setCategoryFilter("all");
    setEventFilter("all");
    setMethodFilter("all");
    setStatusFilter("all");
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reimbursementIds = fd.getAll("reimbursementIds") as string[];
    if (!reimbursementIds.length && !fd.get("categoryId")) {
      toast.error("Select a budget category for this payment.");
      return;
    }
    try {
      await createCheck({
        semesterId,
        checkNumber: fd.get("checkNumber") as string,
        description: fd.get("description") as string,
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        recipientName: fd.get("recipientName") as string,
        categoryId: (fd.get("categoryId") as string) || undefined,
        eventId: (fd.get("eventId") as string) || undefined,
        paymentMethod: fd.get("paymentMethod") as PaymentMethod,
        cleared: fd.get("cleared") === "on",
        memo: (fd.get("memo") as string) || undefined,
        reimbursementIds: reimbursementIds.length ? reimbursementIds : undefined,
      });
      toast.success("Check created");
      setCreateOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create check");
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const cleared = fd.get("cleared") === "on";
    try {
      await updateCheck(editing.id, {
        checkNumber: fd.get("checkNumber") as string,
        description: fd.get("description") as string,
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        recipientName: fd.get("recipientName") as string,
        categoryId: ((fd.get("categoryId") as string) || null) as string | null,
        eventId: ((fd.get("eventId") as string) || null) as string | null,
        paymentMethod: fd.get("paymentMethod") as PaymentMethod,
        cleared,
        clearedDate: cleared
          ? editing.clearedDate?.toISOString() ?? new Date().toISOString()
          : null,
        memo: ((fd.get("memo") as string) || null) as string | null,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search check #, description, recipient, memo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {checks.length} · {formatCurrency(total)}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          {isTreasurer && ocrEnabled && (
            <ScanChecksDialog
              semesterId={semesterId}
              categories={categories}
              events={events}
            />
          )}
          {isTreasurer && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger render={<Button size="sm">New check / payment</Button>} />
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record payment</DialogTitle>
                </DialogHeader>
                <CheckForm
                  onSubmit={handleCreate}
                  categories={categories}
                  events={events}
                  reimbursements={reimbursements}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {sortHeader("checkNumber", "ID")}
              {sortHeader("description", "Description")}
              {sortHeader("recipientName", "Recipient")}
              {sortHeader("category", "Category")}
              {sortHeader("event", "Event")}
              {sortHeader("paymentMethod", "Method")}
              {sortHeader("date", "Date")}
              {sortHeader("amount", "Amount", "right")}
              {sortHeader("cleared", "Cleared?")}
              {isTreasurer && <TableHead />}
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-transparent">
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
              <TableHead className="h-auto py-1.5" />
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
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v ?? "all")}>
                  <SelectTrigger
                    size="sm"
                    className={`w-full font-normal ${methodFilter === "all" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <SelectValue>
                      {methodFilter === "all"
                        ? "All"
                        : PAYMENT_LABELS[methodFilter as PaymentMethod] ?? "All"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="h-auto py-1.5">
                <Input
                  type="date"
                  value={sinceDate}
                  onChange={(e) => setSinceDate(e.target.value)}
                  aria-label="Show checks on or after this date"
                  title="Show checks on or after this date"
                  className="h-7 font-normal"
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
                        : statusFilter === "cleared"
                          ? "Cleared"
                          : "Uncleared"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="uncleared">Uncleared</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              {isTreasurer && <TableHead className="h-auto py-1.5" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              // Settlement checks get a palette hue rather than a status
              // colour — being a settlement isn't good or bad, it's an
              // identity. The dot carries it so the text stays in ink.
              const isSettlement = c._count.reimbursements > 0;
              return (
              <TableRow
                key={c.id}
                className={isSettlement ? "bg-chart-5/5" : undefined}
              >
                <TableCell
                  className={`tabular-nums border-l-4 ${
                    isSettlement ? "border-l-chart-5" : "border-l-transparent"
                  }`}
                >
                  {c.checkNumber}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{c.description}</span>
                    {isSettlement && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chart-5/15 px-2 py-0.5 text-xs font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-chart-5" />
                        Reimbursement
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{c.recipientName}</TableCell>
                <TableCell>{c.category?.name ?? "—"}</TableCell>
                <TableCell>{c.event?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{PAYMENT_LABELS[c.paymentMethod]}</Badge>
                </TableCell>
                <TableCell>{formatDate(c.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                <TableCell>
                  {c.cleared ? (
                    <Badge>Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </TableCell>
                {isTreasurer && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (confirm("Delete this check?")) {
                            await deleteCheck(c.id);
                            router.refresh();
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
                <TableCell colSpan={isTreasurer ? 10 : 9} className="text-center text-sm text-muted-foreground">
                  No checks match the current filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit check</DialogTitle>
          </DialogHeader>
          {editing && (
            <CheckForm
              onSubmit={handleEdit}
              categories={categories}
              events={events}
              defaults={editing}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckForm({
  onSubmit,
  categories,
  events,
  defaults,
  reimbursements,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  categories: Category[];
  events: EventOption[];
  defaults?: CheckRow;
  reimbursements?: Reimbursement[];
}) {
  const [selectedReimb, setSelectedReimb] = useState<string[]>([]);
  const [amount, setAmount] = useState(
    defaults?.amount != null ? String(defaults.amount) : ""
  );
  const settleTotal = (reimbursements ?? [])
    .filter((r) => selectedReimb.includes(r.id))
    .reduce((s, r) => s + r.amount, 0);
  const settling = selectedReimb.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Check / ref #</Label>
          <Input name="checkNumber" required defaultValue={defaults?.checkNumber} />
        </div>
        <div className="space-y-2">
          <Label>Payment method</Label>
          <Select
            name="paymentMethod"
            defaultValue={defaults?.paymentMethod ?? "CHECK"}
            items={PAYMENT_LABELS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input name="description" required defaultValue={defaults?.description} />
      </div>
      <div className="space-y-2">
        <Label>Recipient</Label>
        <Input name="recipientName" required defaultValue={defaults?.recipientName} />
      </div>
      {reimbursements && reimbursements.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label>Pay reimbursements</Label>
            {settling && (
              <span className="text-xs text-muted-foreground">
                {selectedReimb.length} selected · {formatCurrency(settleTotal)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Select to settle — the amount fills in automatically.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {reimbursements.map((r) => {
              const checked = selectedReimb.includes(r.id);
              return (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSelectedReimb((prev) =>
                          v ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                        )
                      }
                    />
                    {r.name} · {r.memberName}
                  </span>
                  <span className="tabular-nums">{formatCurrency(r.amount)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {selectedReimb.map((id) => (
        <input key={id} type="hidden" name="reimbursementIds" value={id} />
      ))}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            required
            value={settling ? settleTotal.toFixed(2) : amount}
            onChange={(e) => setAmount(e.target.value)}
            readOnly={settling}
          />
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            name="date"
            type="date"
            required
            defaultValue={defaults?.date ? toDateInput(defaults.date) : todayInput()}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category {!settling && <span className="text-destructive">*</span>}</Label>
          <Select
            name="categoryId"
            required={!settling}
            defaultValue={defaults?.categoryId ?? undefined}
            items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
          >
            <SelectTrigger>
              <SelectValue placeholder={settling ? "From reimbursements" : "Select a category"} />
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
        <div className="space-y-2">
          <Label>Event</Label>
          <Select
            name="eventId"
            defaultValue={defaults?.eventId ?? undefined}
            items={Object.fromEntries(events.map((e) => [e.id, e.name]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Memo</Label>
        <Input name="memo" defaultValue={defaults?.memo ?? ""} />
      </div>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Checkbox id="cleared" name="cleared" defaultChecked={defaults?.cleared} />
        <Label htmlFor="cleared" className="font-medium">
          Mark as cleared
        </Label>
      </div>
      <Button type="submit" className="w-full">
        Save
      </Button>
    </form>
  );
}
