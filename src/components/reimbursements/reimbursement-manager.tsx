"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createReimbursement,
  updateReimbursement,
  deleteReimbursement,
  scanReceipt,
} from "@/actions/reimbursements";
import { createCheck } from "@/actions/checks";
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
import { toast } from "sonner";
import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpDown, Sparkles, Loader2 } from "lucide-react";

type Reimbursement = {
  id: string;
  name: string;
  amount: number;
  date: Date;
  status: string;
  categoryId: string | null;
  eventId: string | null;
  tags: string | null;
  notes: string | null;
  receiptUrl: string | null;
  parsedData: string | null;
  officer: { id: string; name: string | null; email: string };
  category: { name: string } | null;
  event: { name: string } | null;
};

type Officer = { id: string; name: string | null; email: string };
type Category = { id: string; name: string };
type EventOption = { id: string; name: string };

type SortKey =
  | "name"
  | "officer"
  | "category"
  | "event"
  | "date"
  | "amount"
  | "status";

export function ReimbursementManager({
  semesterId,
  reimbursements,
  officers,
  categories,
  events,
  currentUserId,
  isTreasurer,
  ocrEnabled,
}: {
  semesterId: string;
  reimbursements: Reimbursement[];
  officers: Officer[];
  categories: Category[];
  events: EventOption[];
  currentUserId: string;
  isTreasurer: boolean;
  ocrEnabled: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Reimbursement | null>(null);

  const [search, setSearch] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [officerFilter, setOfficerFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "APPROVED" | "PAID">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const since = sinceDate ? new Date(sinceDate).getTime() : null;
    return reimbursements.filter((r) => {
      if (q) {
        const hay = `${r.name} ${r.officer.name ?? ""} ${r.officer.email} ${r.tags ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const ts = new Date(r.date).getTime();
      if (since && ts < since) return false;
      if (officerFilter !== "all" && r.officer.id !== officerFilter) return false;
      if (categoryFilter !== "all" && r.categoryId !== categoryFilter) return false;
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [reimbursements, search, sinceDate, officerFilter, categoryFilter, eventFilter, statusFilter]);

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
    const t = { all: 0, pending: 0, approved: 0, paid: 0 };
    for (const r of filtered) {
      t.all += r.amount;
      if (r.status === "PENDING") t.pending += r.amount;
      else if (r.status === "APPROVED") t.approved += r.amount;
      else if (r.status === "PAID") t.paid += r.amount;
    }
    return t;
  }, [filtered]);

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
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        categoryId: ((fd.get("categoryId") as string) || null) as string | null,
        eventId: ((fd.get("eventId") as string) || null) as string | null,
        tags: ((fd.get("tags") as string) || null) as string | null,
        notes: ((fd.get("notes") as string) || null) as string | null,
        status: isTreasurer
          ? ((fd.get("status") as "PENDING" | "APPROVED" | "PAID") ?? editing.status as "PENDING")
          : undefined,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function bundleToCheck(officerId: string) {
    const pending = reimbursements.filter(
      (r) => r.officer.id === officerId && r.status === "APPROVED"
    );
    if (!pending.length) {
      toast.error("No approved reimbursements for this officer");
      return;
    }
    const total = pending.reduce((s, r) => s + r.amount, 0);
    const officer = officers.find((o) => o.id === officerId);
    try {
      await createCheck({
        semesterId,
        checkNumber: `R-${Date.now().toString().slice(-6)}`,
        description: `Reimbursement — ${officer?.name || officer?.email}`,
        amount: total,
        date: new Date().toISOString().slice(0, 10),
        recipientName: officer?.name || officer?.email || "Officer",
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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search name, officer, tags, notes…"
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
        <Select value={officerFilter} onValueChange={(v) => setOfficerFilter(v ?? "all")}>
          <SelectTrigger>
            <SelectValue>
              {officerFilter === "all"
                ? "All officers"
                : (() => {
                    const o = officers.find((o) => o.id === officerFilter);
                    return o ? o.name || o.email : "All officers";
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "all") as typeof statusFilter)}>
          <SelectTrigger>
            <SelectValue>
              {statusFilter === "all"
                ? "All status"
                : statusFilter === "PENDING"
                  ? "Pending"
                  : statusFilter === "APPROVED"
                    ? "Approved"
                    : "Paid"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {reimbursements.length} · Pending {formatCurrency(totals.pending)} · Approved {formatCurrency(totals.approved)} · Paid {formatCurrency(totals.paid)}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
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
                  ocrEnabled={ocrEnabled}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <SortHeader k="name">Description</SortHeader>
              <SortHeader k="officer">Officer</SortHeader>
              <SortHeader k="category">Category</SortHeader>
              <SortHeader k="event">Event</SortHeader>
              <SortHeader k="date">Date</SortHeader>
              <SortHeader k="amount" align="right">Amount</SortHeader>
              <SortHeader k="status">Status</SortHeader>
              <TableHead />
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
              const canEdit = isTreasurer || r.officer.id === currentUserId;
              return (
                <TableRow key={r.id}>
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
                        <p className="text-xs text-emerald-600">
                          OCR: {parsed.vendor && `${parsed.vendor} · `}
                          {parsed.amount && formatCurrency(parsed.amount)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.officer.name || r.officer.email}</TableCell>
                  <TableCell>{r.category?.name ?? "—"}</TableCell>
                  <TableCell>{r.event?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(r.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "PAID"
                          ? "default"
                          : r.status === "APPROVED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {canEdit && r.status !== "PAID" && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                          Edit
                        </Button>
                      )}
                      {isTreasurer && r.status === "APPROVED" && (
                        <Button size="sm" onClick={() => bundleToCheck(r.officer.id)}>
                          Pay via check
                        </Button>
                      )}
                      {canEdit && r.status !== "PAID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (confirm(`Delete "${r.name}"?`)) {
                              await deleteReimbursement(r.id);
                              router.refresh();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  No reimbursements match the current filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
  ocrEnabled,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  categories: Category[];
  events: EventOption[];
  ocrEnabled: boolean;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [parsedData, setParsedData] = useState("");
  const [scan, setScan] = useState<ScanState>("idle");

  async function handleReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setParsedData("");
    if (!file) {
      setScan("idle");
      return;
    }
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
        <Input
          name="receipt"
          type="file"
          accept="image/*"
          onChange={handleReceipt}
        />
        <input type="hidden" name="parsedData" value={parsedData} />
        {scan === "scanning" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Scanning receipt…
          </p>
        )}
        {scan === "done" && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Sparkles className="h-3 w-3" /> Auto-filled from receipt — review before submitting.
          </p>
        )}
        {scan === "empty" && (
          <p className="text-xs text-amber-600">
            Couldn&apos;t read the receipt. Enter the details manually.
          </p>
        )}
        {scan === "error" && (
          <p className="text-xs text-amber-600">
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
        <div className="space-y-2">
          <Label>Event</Label>
          <Select
            name="eventId"
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
            defaultValue={new Date(defaults.date).toISOString().slice(0, 10)}
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
        <div className="space-y-2">
          <Label>Event</Label>
          <Select
            name="eventId"
            defaultValue={defaults.eventId ?? undefined}
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
            items={{ PENDING: "Pending", APPROVED: "Approved", PAID: "Paid" }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
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
