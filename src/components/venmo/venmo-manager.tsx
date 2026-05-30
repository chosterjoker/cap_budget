"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { createVenmoIncome, updateVenmoIncome, deleteVenmoIncome } from "@/actions/venmo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Week = { id: string; weekNumber: number; label: string | null };

export function VenmoManager({
  semesterId,
  entries,
  weeks,
  total,
  isTreasurer,
}: {
  semesterId: string;
  entries: VenmoRow[];
  weeks: Week[];
  total: number;
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
    const fd = new FormData(e.currentTarget);
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
      router.refresh();
      e.currentTarget.reset();
    } catch {
      toast.error("Failed to record");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Total Venmo income (this semester)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-emerald-600">
            {formatCurrency(total)}
          </p>
          <p className="text-xs text-muted-foreground">
            Tracked separately from checks; increases available funds
          </p>
        </CardContent>
      </Card>

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
                  defaultValue={new Date().toISOString().slice(0, 10)}
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
                <TableCell className="text-right font-mono">
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
          </TableBody>
        </Table>
      </div>

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
                    defaultValue={new Date(editing.date).toISOString().slice(0, 10)}
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
