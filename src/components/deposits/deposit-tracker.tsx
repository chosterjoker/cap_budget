"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, toDateInput, todayInput } from "@/lib/format";
import { createDeposit, updateDeposit, deleteDeposit } from "@/actions/deposits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type Deposit = {
  id: string;
  amount: number;
  date: Date;
  notes: string | null;
};

export function DepositTracker({
  semesterId,
  deposits,
  totalBudget,
  totalDeposited,
  totalSpent,
  actualBankBalance,
  isTreasurer,
}: {
  semesterId: string;
  deposits: Deposit[];
  totalBudget: number;
  totalDeposited: number;
  totalSpent: number;
  actualBankBalance: number;
  isTreasurer: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Deposit | null>(null);

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateDeposit(editing.id, {
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        notes: ((fd.get("notes") as string) || null) as string | null,
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
      await createDeposit({
        semesterId,
        amount: parseFloat(fd.get("amount") as string),
        date: fd.get("date") as string,
        notes: (fd.get("notes") as string) || undefined,
      });
      toast.success("Deposit recorded");
      form.reset();
      router.refresh();
    } catch {
      toast.error("Failed to record deposit");
    }
  }

  return (
    <div className="space-y-6">
      <StatRow>
        <StatTile
          label="Semester budget"
          value={formatCurrency(totalBudget)}
        />
        <StatTile
          label="Total deposited"
          value={formatCurrency(totalDeposited)}
          hint={`${deposits.length} ${deposits.length === 1 ? "deposit" : "deposits"} recorded`}
        />
        <StatTile label="Total spent" value={formatCurrency(totalSpent)} />
        <StatTile
          label="Est. bank balance"
          value={formatCurrency(actualBankBalance)}
          hint="Opening + deposited − cleared checks"
          tone={actualBankBalance < 0 ? "danger" : "success"}
        />
      </StatRow>

      {isTreasurer && (
        <Card>
          <CardHeader>
            <CardTitle>Record deposit</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-4">
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
              <div className="min-w-[200px] flex-1 space-y-2">
                <Label>Notes</Label>
                <Input name="notes" placeholder="e.g. March deposit" />
              </div>
              <div className="flex items-end">
                <Button type="submit">Add deposit</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {isTreasurer && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deposits.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{formatDate(d.date)}</TableCell>
                <TableCell>{d.notes || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.amount)}
                </TableCell>
                {isTreasurer && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (confirm("Delete this deposit?")) {
                            await deleteDeposit(d.id);
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
            {deposits.length === 0 && (
              <TableRow>
                <TableCell colSpan={isTreasurer ? 4 : 3}>
                  <EmptyRow>No deposits recorded yet.</EmptyRow>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit deposit</DialogTitle>
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
                <Label>Notes</Label>
                <Input name="notes" defaultValue={editing.notes ?? ""} />
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
