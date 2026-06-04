"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, toDateInput, todayInput } from "@/lib/format";
import { createDeposit, updateDeposit, deleteDeposit } from "@/actions/deposits";
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Semester Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Deposited
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalDeposited)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Est. Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(actualBankBalance)}
            </p>
            <p className="text-xs text-muted-foreground">
              Opening + deposited − cleared checks
            </p>
          </CardContent>
        </Card>
      </div>

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
                <TableCell className="text-right font-mono">
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
