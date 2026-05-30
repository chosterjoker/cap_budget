"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { createCheck, updateCheck, deleteCheck } from "@/actions/checks";
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
};

type Category = { id: string; name: string };
type EventOption = { id: string; name: string; date: Date };
type Reimbursement = { id: string; name: string; amount: number; officerName: string };

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
}: {
  semesterId: string;
  checks: CheckRow[];
  categories: Category[];
  events: EventOption[];
  reimbursements: Reimbursement[];
  isTreasurer: boolean;
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortHeader({ k, children, align }: { k: SortKey; children: React.ReactNode; align?: "right" }) {
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
          {children}
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
    } catch {
      toast.error("Failed to create check");
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
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search check #, description, recipient, memo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-1">
          <Input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            aria-label="Since date"
          />
          <p className="text-[10px] text-muted-foreground">Show on or after</p>
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
          <SelectTrigger>
            <SelectValue>
              {categoryFilter === "all"
                ? "All categories"
                : categories.find((c) => c.id === categoryFilter)?.name ?? "All categories"}
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
        <Select value={eventFilter} onValueChange={(v) => setEventFilter(v ?? "all")}>
          <SelectTrigger>
            <SelectValue>
              {eventFilter === "all"
                ? "All events"
                : events.find((e) => e.id === eventFilter)?.name ?? "All events"}
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
        <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v ?? "all")}>
          <SelectTrigger>
            <SelectValue>
              {methodFilter === "all"
                ? "All methods"
                : PAYMENT_LABELS[methodFilter as PaymentMethod] ?? "All methods"}
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "all") as typeof statusFilter)}>
          <SelectTrigger>
            <SelectValue>
              {statusFilter === "all"
                ? "All status"
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
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {checks.length} · {formatCurrency(total)}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
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
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader k="checkNumber">ID</SortHeader>
              <SortHeader k="description">Description</SortHeader>
              <SortHeader k="recipientName">Recipient</SortHeader>
              <SortHeader k="category">Category</SortHeader>
              <SortHeader k="event">Event</SortHeader>
              <SortHeader k="paymentMethod">Method</SortHeader>
              <SortHeader k="date">Date</SortHeader>
              <SortHeader k="amount" align="right">Amount</SortHeader>
              <SortHeader k="cleared">Cleared?</SortHeader>
              {isTreasurer && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.checkNumber}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell>{c.recipientName}</TableCell>
                <TableCell>{c.category?.name ?? "—"}</TableCell>
                <TableCell>{c.event?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{PAYMENT_LABELS[c.paymentMethod]}</Badge>
                </TableCell>
                <TableCell>{formatDate(c.date)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.amount)}</TableCell>
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
            ))}
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
                    {r.name} · {r.officerName}
                  </span>
                  <span className="font-mono">{formatCurrency(r.amount)}</span>
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
            defaultValue={
              defaults?.date
                ? new Date(defaults.date).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10)
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            name="categoryId"
            defaultValue={defaults?.categoryId ?? undefined}
            items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
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
