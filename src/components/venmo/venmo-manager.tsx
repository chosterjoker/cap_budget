"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatCurrency, formatDate, toDateInput, todayInput } from "@/lib/format";
import { createVenmoIncome, updateVenmoIncome, deleteVenmoIncome } from "@/actions/venmo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatTile, StatRow } from "@/components/common/stat-tile";
import { EmptyRow } from "@/components/common/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type VenmoRow = {
  id: string;
  amount: number;
  date: Date;
  description: string;
  eventName: string | null;
  weekId: string | null;
  week: { weekNumber: number; label: string | null } | null;
};

// Checks paid via Venmo. Read-only here — they're edited on the Checks tab.
type VenmoPayment = {
  id: string;
  checkNumber: string;
  description: string;
  recipientName: string;
  amount: number;
  date: Date;
  event: { name: string } | null;
};

type Week = { id: string; weekNumber: number; label: string | null };

type VenmoSummary = {
  collected: number;
  paid: number;
  balance: number;
  paymentCount: number;
};

export function VenmoManager({
  semesterId,
  entries,
  payments,
  weeks,
  summary,
  isTreasurer,
}: {
  semesterId: string;
  entries: VenmoRow[];
  payments: VenmoPayment[];
  weeks: Week[];
  summary: VenmoSummary;
  isTreasurer: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<VenmoRow | null>(null);

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateVenmoIncome(editing.id, {
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        description: fd.get("description") as string,
        eventName: ((fd.get("eventName") as string) || null) as string | null,
        weekId: ((fd.get("weekId") as string) || null) as string | null,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createVenmoIncome({
        semesterId,
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        description: fd.get("description") as string,
        eventName: (fd.get("eventName") as string) || undefined,
        weekId: (fd.get("weekId") as string) || undefined,
      });
      toast.success("Venmo income recorded");
      form.reset();
      router.refresh();
    } catch {
      toast.error("Failed to record");
    }
  }

  return (
    <div className="space-y-6">
      <StatRow cols={3}>
        <StatTile
          label="Venmo balance"
          value={formatCurrency(summary.balance)}
          hint="Collections minus checks paid via Venmo"
          tone={summary.balance < 0 ? "danger" : "success"}
        />
        <StatTile
          label="Collected"
          value={formatCurrency(summary.collected)}
          hint={`${entries.length} collection${entries.length === 1 ? "" : "s"} this semester`}
        />
        <StatTile
          label="Paid via Venmo"
          value={formatCurrency(summary.paid)}
          hint={`${summary.paymentCount} payment${summary.paymentCount === 1 ? "" : "s"} logged on the Checks tab`}
        />
      </StatRow>

      {isTreasurer && (
        <Card>
          <CardHeader>
            <CardTitle>Log Venmo collection</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={todayInput()}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Input name="description" required />
              </div>
              <div className="space-y-2">
                <Label>Event name</Label>
                <Input name="eventName" placeholder="e.g. Capchella tickets" />
              </div>
              <div className="space-y-2">
                <Label>Week</Label>
                <Select
                  name="weekId"
                  items={Object.fromEntries(
                    weeks.map((w) => [
                      w.id,
                      `W${w.weekNumber}${w.label ? ` — ${w.label}` : ""}`,
                    ])
                  )}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        W{w.weekNumber}
                        {w.label ? ` — ${w.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
          <CardDescription>Money coming into Venmo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isTreasurer && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.date)}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell>{e.eventName || "—"}</TableCell>
                    <TableCell>
                      {e.week
                        ? `W${e.week.weekNumber}${e.week.label ? ` (${e.week.label})` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(e.amount)}
                    </TableCell>
                    {isTreasurer && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm("Delete this entry?")) {
                                await deleteVenmoIncome(e.id);
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
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isTreasurer ? 6 : 5}>
                      <EmptyRow>No Venmo collections logged yet.</EmptyRow>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {entries.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Total collected
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(summary.collected)}
                    </TableCell>
                    {isTreasurer && <TableCell />}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paid via Venmo</CardTitle>
          <CardDescription>
            Checks with Venmo as the payment method — these come out of the balance
          </CardDescription>
          <CardAction>
            <Link
              href="/checks"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Edit on Checks
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.date)}</TableCell>
                    <TableCell className="tabular-nums">{p.checkNumber}</TableCell>
                    <TableCell>{p.description}</TableCell>
                    <TableCell>{p.recipientName}</TableCell>
                    <TableCell>{p.event?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      −{formatCurrency(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyRow>No Venmo payments logged yet.</EmptyRow>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {payments.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">
                      Total Venmoed
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      −{formatCurrency(summary.paid)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit venmo entry</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={editing.amount}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    name="date"
                    type="date"
                    required
                    defaultValue={toDateInput(editing.date)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input name="description" required defaultValue={editing.description} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Event name</Label>
                  <Input name="eventName" defaultValue={editing.eventName ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Week</Label>
                  <Select
                    name="weekId"
                    defaultValue={editing.weekId ?? undefined}
                    items={Object.fromEntries(
                      weeks.map((w) => [
                        w.id,
                        `W${w.weekNumber}${w.label ? ` — ${w.label}` : ""}`,
                      ])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {weeks.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          W{w.weekNumber}{w.label ? ` — ${w.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">
                Save
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
