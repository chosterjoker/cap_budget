"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  importSocialCalendarCsv,
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/actions/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { eventTypeColor } from "@/lib/event-colors";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  name: string;
  date: Date;
  time: string | null;
  eventType: string | null;
  audience: string | null;
  isInformational: boolean;
  weekNumber: number | null;
  weekLabel: string | null;
  total: number;
  byCategory: { name: string; amount: number }[];
};

export function CalendarManager({
  semesterId,
  events,
  isTreasurer,
}: {
  semesterId: string;
  events: CalendarEvent[];
  isTreasurer: boolean;
}) {
  const router = useRouter();
  const [showInfo, setShowInfo] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const filtered = useMemo(
    () => events.filter((e) => showInfo || !e.isInformational),
    [events, showInfo]
  );

  const byWeek = useMemo(() => {
    const map = new Map<
      string,
      { weekNumber: number | null; label: string | null; events: CalendarEvent[] }
    >();
    for (const e of filtered) {
      const key = String(e.weekNumber ?? "none");
      let entry = map.get(key);
      if (!entry) {
        entry = { weekNumber: e.weekNumber, label: e.weekLabel, events: [] };
        map.set(key, entry);
      }
      entry.events.push(e);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.weekNumber == null) return 1;
      if (b.weekNumber == null) return -1;
      return a.weekNumber - b.weekNumber;
    });
  }, [filtered]);

  const totalSpend = filtered.reduce((s, e) => s + e.total, 0);
  const informationalCount = events.filter((e) => e.isInformational).length;

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("semesterId", semesterId);
    try {
      const result = await importSocialCalendarCsv(fd);
      toast.success(
        `Imported ${result.total} events (${result.created} new, ${result.updated} updated)`
      );
      setImportOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createEvent({
        semesterId,
        name: fd.get("name") as string,
        date: fd.get("date") as string,
        time: (fd.get("time") as string) || undefined,
        eventType: (fd.get("eventType") as string) || undefined,
        audience: (fd.get("audience") as string) || undefined,
        isInformational: fd.get("isInformational") === "on",
      });
      toast.success("Event added");
      setCreateOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to add event");
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateEvent(editing.id, {
        name: fd.get("name") as string,
        date: fd.get("date") as string,
        time: ((fd.get("time") as string) || null) as string | null,
        eventType: ((fd.get("eventType") as string) || null) as string | null,
        audience: ((fd.get("audience") as string) || null) as string | null,
        isInformational: fd.get("isInformational") === "on",
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
            {informationalCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {informationalCount} informational
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total event spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
            <p className="text-xs text-muted-foreground">
              Spend tagged to events (from expenses + reimbursements)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Most expensive
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const top = [...filtered].sort((a, b) => b.total - a.total)[0];
              if (!top || top.total === 0)
                return <p className="text-muted-foreground">No spend yet</p>;
              return (
                <>
                  <p className="text-base font-semibold">{top.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(top.total)}
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-info"
            checked={showInfo}
            onCheckedChange={(v) => setShowInfo(v === true)}
          />
          <Label htmlFor="show-info" className="text-sm">
            Show informational events
          </Label>
        </div>
        {isTreasurer && (
          <div className="ml-auto flex flex-wrap gap-2">
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
                  <DialogTitle>Import social calendar</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleImport} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Upload the Google Sheets CSV. Re-uploading upserts existing events
                    by date + name; manual edits to event names are preserved.
                  </p>
                  <div className="space-y-2">
                    <Label>CSV file</Label>
                    <Input name="file" type="file" accept=".csv" required />
                  </div>
                  <Button type="submit" className="w-full">
                    Import
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger
                render={<Button size="sm">Add event</Button>}
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add event</DialogTitle>
                </DialogHeader>
                <EventForm onSubmit={handleCreate} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {byWeek.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No events yet. Import the CSV or add one manually.
          </p>
        )}
        {byWeek.map((wk) => (
          <div key={wk.weekNumber ?? "none"} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-lg font-semibold">
                {wk.weekNumber == null
                  ? "Outside semester"
                  : `Week ${wk.weekNumber}`}
              </h3>
              {wk.label && (
                <span className="text-sm text-muted-foreground">— {wk.label}</span>
              )}
            </div>
            <div className="grid gap-2">
              {wk.events.map((e) => {
                const color = eventTypeColor(e.eventType);
                return (
                <div
                  key={e.id}
                  className={cn(
                    "relative flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between",
                    e.isInformational && "bg-muted/30"
                  )}
                >
                  {color && (
                    <span
                      aria-hidden
                      className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-r", color.dot)}
                    />
                  )}
                  <div className="flex-1 pl-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium">
                        {formatDate(e.date)}
                      </span>
                      {e.time && (
                        <span className="text-xs text-muted-foreground">
                          {e.time}
                        </span>
                      )}
                      {e.eventType && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            color ? `${color.bg} ${color.text} ${color.dark}` : "bg-muted text-foreground"
                          )}
                        >
                          {e.eventType}
                        </span>
                      )}
                      {e.isInformational && (
                        <Badge variant="secondary" className="text-[10px]">
                          info
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold">{e.name}</p>
                    {e.audience && (
                      <p className="text-xs text-muted-foreground">{e.audience}</p>
                    )}
                    {e.byCategory.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.byCategory
                          .map((c) => `${c.name} ${formatCurrency(c.amount)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-sm font-semibold">
                      {e.total > 0 ? formatCurrency(e.total) : "—"}
                    </p>
                    {isTreasurer && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(e)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (confirm(`Delete "${e.name}"?`)) {
                              await deleteEvent(e.id);
                              router.refresh();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        ))}
      </div>

      {(() => {
        const uniqueTypes = Array.from(
          new Set(events.map((e) => e.eventType).filter((t): t is string => !!t))
        ).sort();
        if (!uniqueTypes.length) return null;
        return (
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Event types
            </p>
            <div className="flex flex-wrap gap-2">
              {uniqueTypes.map((t) => {
                const color = eventTypeColor(t);
                return (
                  <span
                    key={t}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs",
                      color ? `${color.bg} ${color.text} ${color.dark}` : "bg-muted"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", color?.dot)} />
                    {t}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
          </DialogHeader>
          {editing && (
            <EventForm
              onSubmit={handleUpdate}
              defaults={{
                name: editing.name,
                date: editing.date.toISOString().slice(0, 10),
                time: editing.time ?? "",
                eventType: editing.eventType ?? "",
                audience: editing.audience ?? "",
                isInformational: editing.isInformational,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventForm({
  onSubmit,
  defaults,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  defaults?: {
    name: string;
    date: string;
    time: string;
    eventType: string;
    audience: string;
    isInformational: boolean;
  };
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input name="name" required defaultValue={defaults?.name} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            name="date"
            type="date"
            required
            defaultValue={defaults?.date ?? new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="space-y-2">
          <Label>Time</Label>
          <Input name="time" placeholder="e.g. 9:00 PM" defaultValue={defaults?.time} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Input
            name="eventType"
            placeholder="e.g. Club Night"
            defaultValue={defaults?.eventType}
          />
        </div>
        <div className="space-y-2">
          <Label>Audience</Label>
          <Input
            name="audience"
            placeholder="e.g. Members Only"
            defaultValue={defaults?.audience}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="isInformational"
          name="isInformational"
          defaultChecked={defaults?.isInformational}
        />
        <Label htmlFor="isInformational">Informational (no spend expected)</Label>
      </div>
      <Button type="submit" className="w-full">
        Save
      </Button>
    </form>
  );
}
