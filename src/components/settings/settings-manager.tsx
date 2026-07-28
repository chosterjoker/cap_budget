"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSemester, updateUserRole, addCategory, updateCategory, deleteCategory, updateWeekLabel, updateSemesterBudget, updateOpeningBalances, deleteSemester } from "@/actions/semester";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Meter } from "@/components/common/meter";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

type Semester = {
  id: string;
  name: string;
  isActive: boolean;
  totalBudget: number;
  openingBankBalance: number;
  openingUndeposited: number;
};

type Category = {
  id: string;
  name: string;
  allocatedAmount: number;
};

type Week = {
  id: string;
  weekNumber: number;
  startDate: Date;
  label: string | null;
};

type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

export function SettingsManager({
  semesters,
  activeSemester,
  categories,
  weeks,
  users,
}: {
  semesters: Semester[];
  activeSemester: Semester | null;
  categories: Category[];
  weeks: Week[];
  users: User[];
}) {
  const router = useRouter();

  async function handleNewSemester(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createSemester({
        name: fd.get("name") as string,
        startDate: fd.get("startDate") as string,
        endDate: (fd.get("endDate") as string) || undefined,
        totalBudget: parseFloat((fd.get("totalBudget") as string) || "0"),
        openingBankBalance: parseFloat(
          (fd.get("openingBankBalance") as string) || "0"
        ),
        openingUndeposited: parseFloat(
          (fd.get("openingUndeposited") as string) || "0"
        ),
        cloneFromPrevious: fd.get("cloneFromPrevious") === "on",
      });
      toast.success("Semester created");
      router.refresh();
    } catch {
      toast.error("Failed to create semester");
    }
  }

  async function handleDeleteSemester(id: string, name: string) {
    if (
      !confirm(
        `Delete "${name}" and ALL of its data — categories, weeks, expenses, ` +
          `checks, reimbursements, deposits, and events? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await deleteSemester(id);
      toast.success("Semester deleted");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete semester"
      );
    }
  }

  const allocatedTotal = categories.reduce((s, c) => s + c.allocatedAmount, 0);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Active semester</CardTitle>
        </CardHeader>
        <CardContent>
          {activeSemester ? (
            <p>
              <strong>{activeSemester.name}</strong> — Budget{" "}
              {formatCurrency(activeSemester.totalBudget)}, opening bank{" "}
              {formatCurrency(activeSemester.openingBankBalance)}, undeposited{" "}
              {formatCurrency(activeSemester.openingUndeposited)}
            </p>
          ) : (
            <p className="text-muted-foreground">No active semester</p>
          )}
          <ul className="mt-4 space-y-1 text-sm">
            {semesters.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {s.name} {s.isActive && "(active)"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteSemester(s.id, s.name)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {activeSemester && (
        // Keyed on the semester id so switching or creating a semester remounts
        // the form with that semester's numbers. Without the key the inputs keep
        // the previous semester's values and Save would write them onto the new one.
        <OpeningBalancesCard
          key={activeSemester.id}
          semester={activeSemester}
          onSaved={() => router.refresh()}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Start new semester</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNewSemester} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" placeholder="Fall 2026" required />
            </div>
            <div className="space-y-2">
              <Label>Total budget</Label>
              <Input
                name="totalBudget"
                type="number"
                step="0.01"
                placeholder="66000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Opening bank balance</Label>
              <Input
                name="openingBankBalance"
                type="number"
                step="0.01"
                placeholder="0"
                defaultValue={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Opening undeposited</Label>
              <Input
                name="openingUndeposited"
                type="number"
                step="0.01"
                placeholder="0"
                defaultValue={0}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Opening bank balance is what the account actually held on day one;
              opening undeposited is cash/checks in hand from last year not yet
              deposited. Outstanding uncleared checks carry forward automatically.
            </p>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input name="startDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Input name="endDate" type="date" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="clone" name="cloneFromPrevious" defaultChecked />
              <Label htmlFor="clone">Clone categories & weeks from previous</Label>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Enter the total budget set by leadership. Category allocations must
              add up to it and cannot exceed it.
            </p>
            <Button type="submit" className="sm:col-span-2">
              Create & activate semester
            </Button>
          </form>
        </CardContent>
      </Card>

      {activeSemester && (
        <Card>
          <CardHeader>
            <CardTitle>Categories — {activeSemester.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BudgetTargetPanel
              key={activeSemester.id}
              semester={activeSemester}
              allocatedTotal={allocatedTotal}
              onSaved={() => router.refresh()}
            />
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                try {
                  await addCategory(
                    activeSemester.id,
                    fd.get("name") as string,
                    parseFloat(fd.get("amount") as string)
                  );
                  form.reset();
                  toast.success("Category added");
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              }}
            >
              <Input name="name" placeholder="Category name" required />
              <Input
                name="amount"
                type="number"
                step="0.01"
                placeholder="Allocated"
                required
              />
              <Button type="submit" size="sm">
                Add category
              </Button>
            </form>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-44 text-right">Allocated</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <CategoryRow key={c.id} category={c} onSaved={() => router.refresh()} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeSemester && weeks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weeks — {activeSemester.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Weeks are auto-generated every 7 days from the semester start (Sunday-aligned).
              Only labels are editable.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead className="w-32">Starts</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((w) => (
                  <WeekRow key={w.id} week={w} onSaved={() => router.refresh()} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users & roles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name || "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      items={{ TREASURER: "Treasurer", OFFICER: "Officer" }}
                      onValueChange={async (role) => {
                        if (!role || role === u.role) return;
                        try {
                          await updateUserRole(u.id, role as Role);
                          toast.success(
                            `${u.name || u.email} is now ${
                              role === "TREASURER" ? "treasurer" : "an officer"
                            }`
                          );
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Failed to change role"
                          );
                        }
                        // Refresh either way so a rejected change snaps back to
                        // the role the server actually holds.
                        router.refresh();
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TREASURER">Treasurer</SelectItem>
                        <SelectItem value="OFFICER">Officer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function OpeningBalancesCard({
  semester,
  onSaved,
}: {
  semester: Semester;
  onSaved: () => void;
}) {
  const [bank, setBank] = useState(String(semester.openingBankBalance));
  const [undeposited, setUndeposited] = useState(
    String(semester.openingUndeposited)
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateOpeningBalances(semester.id, {
        openingBankBalance: parseFloat(bank) || 0,
        openingUndeposited: parseFloat(undeposited) || 0,
      });
      toast.success("Opening balances updated");
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update opening balances"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opening balances — {semester.name}</CardTitle>
        <CardDescription>
          Carried over from last semester. These drive the computed cash
          position on the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Opening bank balance</Label>
            <Input
              type="number"
              step="0.01"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-44 tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label>Opening undeposited</Label>
            <Input
              type="number"
              step="0.01"
              value={undeposited}
              onChange={(e) => setUndeposited(e.target.value)}
              className="w-44 tabular-nums"
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetTargetPanel({
  semester,
  allocatedTotal,
  onSaved,
}: {
  semester: Semester;
  allocatedTotal: number;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState(String(semester.totalBudget));
  const [saving, setSaving] = useState(false);
  const over = allocatedTotal > semester.totalBudget;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total budget
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-9 w-40 tabular-nums text-lg"
            />
            <Button
              size="sm"
              disabled={saving || target === String(semester.totalBudget)}
              onClick={async () => {
                setSaving(true);
                try {
                  await updateSemesterBudget(
                    semester.id,
                    parseFloat(target) || 0
                  );
                  toast.success("Budget updated");
                  onSaved();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to update budget"
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Allocated
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCurrency(allocatedTotal)}
          </p>
        </div>
      </div>
      <Meter
        className="mt-3"
        value={allocatedTotal}
        max={semester.totalBudget}
        tone={over ? "danger" : "accent"}
      />
      <p
        className={cn(
          "mt-2 text-sm font-medium",
          over ? "text-danger-fg" : "text-muted-foreground"
        )}
      >
        {over
          ? `Over budget by ${formatCurrency(allocatedTotal - semester.totalBudget)}`
          : `${formatCurrency(semester.totalBudget - allocatedTotal)} left to allocate`}
      </p>
    </div>
  );
}

function CategoryRow({ category, onSaved }: { category: Category; onSaved: () => void }) {
  const [name, setName] = useState(category.name);
  const [amount, setAmount] = useState(String(category.allocatedAmount));
  const [saving, setSaving] = useState(false);
  const dirty = name !== category.name || amount !== String(category.allocatedAmount);

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      </TableCell>
      <TableCell>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          step="0.01"
          className="h-8 text-right tabular-nums"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            variant={dirty ? "default" : "ghost"}
            size="sm"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const parsed = parseFloat(amount);
                if (isNaN(parsed)) throw new Error("Invalid amount");
                await updateCategory(category.id, {
                  name: name !== category.name ? name : undefined,
                  allocatedAmount: parsed !== category.allocatedAmount ? parsed : undefined,
                });
                toast.success("Saved");
                onSaved();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!confirm(`Delete "${category.name}"?`)) return;
              try {
                await deleteCategory(category.id);
                toast.success("Category deleted");
                onSaved();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function WeekRow({ week, onSaved }: { week: Week; onSaved: () => void }) {
  const [label, setLabel] = useState(week.label ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = label !== (week.label ?? "");

  return (
    <TableRow>
      <TableCell className="tabular-nums text-sm">W{week.weekNumber}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(week.startDate)}
      </TableCell>
      <TableCell>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional label"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Button
          variant={dirty ? "default" : "ghost"}
          size="sm"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await updateWeekLabel(week.id, label);
              toast.success("Label saved");
              onSaved();
            } catch {
              toast.error("Failed to save");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}
