"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createReconciliation,
  updateReconciliation,
  deleteReconciliation,
} from "@/actions/reconciliation";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Reconciliation = {
  id: string;
  date: Date;
  actualBalance: number;
  notes: string | null;
};

export function ReconciliationPanel({
  semesterId,
  expectedBankBalance,
  reconciliations,
  isTreasurer,
}: {
  semesterId: string;
  expectedBankBalance: number;
  reconciliations: Reconciliation[];
  isTreasurer: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Reconciliation | null>(null);

  const latest = reconciliations[0] ?? null;
  const delta = latest ? latest.actualBalance - expectedBankBalance : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createReconciliation({
        semesterId,
        actualBalance: parseFloat(fd.get("actualBalance") as string),
        date: (fd.get("date") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      });
      toast.success("Reconciliation recorded");
      form.reset();
      router.refresh();
    } catch {
      toast.error("Failed to record reconciliation");
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateReconciliation(editing.id, {
        actualBalance: parseFloat(fd.get("actualBalance") as string),
        date: (fd.get("date") as string) || undefined,
        notes: ((fd.get("notes") as string) || null) as string | null,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank reconciliation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Computed balance is{" "}
          <span className="font-mono">{formatCurrency(expectedBankBalance)}</span>.
          Record what the bank site actually shows to catch any drift.
        </p>
        {latest && delta !== null && (
          <p className="text-sm">
            Last reconciled {formatDate(latest.date)}:{" "}
            <span className="font-mono">{formatCurrency(latest.actualBalance)}</span>{" "}
            actual ·{" "}
            <span className={cn("font-mono", deltaClass(delta))}>
              {delta >= 0 ? "+" : ""}
              {formatCurrency(delta)}
            </span>{" "}
            vs computed
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {isTreasurer && (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-2">
              <Label>Actual bank balance</Label>
              <Input
                name="actualBalance"
                type="number"
                step="0.01"
                placeholder={String(expectedBankBalance.toFixed(2))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>As of</Label>
              <Input name="date" type="date" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Input name="notes" placeholder="optional" />
            </div>
            <Button type="submit" className="sm:col-span-2 lg:col-span-1">
              Record
            </Button>
          </form>
        )}

        {reconciliations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reconciliations recorded yet.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Notes</TableHead>
                  {isTreasurer && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(r.actualBalance)}
                    </TableCell>
                    <TableCell>{r.notes || "—"}</TableCell>
                    {isTreasurer && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(r)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm("Delete this reconciliation?")) {
                                await deleteReconciliation(r.id);
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
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit reconciliation</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleEdit} className="grid gap-4">
              <div className="space-y-2">
                <Label>Actual bank balance</Label>
                <Input
                  name="actualBalance"
                  type="number"
                  step="0.01"
                  defaultValue={editing.actualBalance}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>As of</Label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={
                    new Date(editing.date).toISOString().slice(0, 10)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input name="notes" defaultValue={editing.notes ?? ""} />
              </div>
              <Button type="submit">Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Small helper kept here so the dashboard can colour the delta consistently.
export function deltaClass(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.005) return "text-muted-foreground";
  return cn(delta > 0 ? "text-emerald-600" : "text-amber-600");
}
