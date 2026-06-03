"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { scanChecks, createChecks } from "@/actions/checks";
import { todayInput } from "@/lib/format";
import type { ParsedCheck } from "@/lib/ocr";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ScanLine,
  Check as CheckIcon,
} from "lucide-react";

type Category = { id: string; name: string };
type EventOption = { id: string; name: string };

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CHECK: "Check",
  WIRE_TRANSFER: "Wire",
  CREDIT_CARD: "Credit card",
  VENMO: "Venmo",
  CASH: "Cash",
  OTHER: "Other",
};

type Draft = {
  checkNumber: string;
  recipientName: string;
  amount: string;
  date: string;
  memo: string;
  description: string;
  categoryId: string;
  eventId: string;
  paymentMethod: PaymentMethod;
};

type Phase = "pick" | "scanning" | "review";

function toDraft(p: ParsedCheck): Draft {
  return {
    checkNumber: p.checkNumber ?? "",
    recipientName: p.recipientName ?? "",
    amount: p.amount != null ? String(p.amount) : "",
    date: p.date ?? todayInput(),
    memo: p.memo ?? "",
    // Checks have no obvious "description"; seed it from the memo, then the
    // payee, so the required field is rarely blank.
    description: p.memo || p.recipientName || "",
    categoryId: "",
    eventId: "",
    paymentMethod: "CHECK",
  };
}

function draftValid(d: Draft): boolean {
  return Boolean(
    d.checkNumber.trim() &&
      d.recipientName.trim() &&
      d.description.trim() &&
      d.categoryId &&
      parseFloat(d.amount) > 0 &&
      d.date &&
      !Number.isNaN(new Date(d.date).getTime())
  );
}

export function ScanChecksDialog({
  semesterId,
  categories,
  events,
}: {
  semesterId: string;
  categories: Category[];
  events: EventOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [current, setCurrent] = useState(0);
  const [batchCategory, setBatchCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setPhase("pick");
    setDrafts([]);
    setCurrent(0);
    setBatchCategory("");
    setError(null);
    setSaving(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a failed read
    if (!file) return;
    setError(null);
    setPhase("scanning");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const parsed = await scanChecks(fd);
      if (!parsed.length) {
        setPhase("pick");
        setError("Couldn't read any checks from that photo. Try a flatter, well-lit shot.");
        return;
      }
      setDrafts(parsed.map(toDraft));
      setCurrent(0);
      setPhase("review");
    } catch {
      setPhase("pick");
      setError("Scan failed — please try again.");
    }
  }

  function setField(field: keyof Draft, value: string) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === current ? { ...d, [field]: value } : d))
    );
  }

  function applyCategoryToAll(catId: string) {
    setBatchCategory(catId);
    setDrafts((prev) => prev.map((d) => ({ ...d, categoryId: catId })));
  }

  function removeCurrent() {
    const next = drafts.filter((_, i) => i !== current);
    if (next.length === 0) {
      reset();
      return;
    }
    setDrafts(next);
    setCurrent((c) => Math.min(c, next.length - 1));
  }

  async function handleSaveAll() {
    if (!drafts.every(draftValid)) return;
    setSaving(true);
    try {
      await createChecks(
        semesterId,
        drafts.map((d) => ({
          checkNumber: d.checkNumber.trim(),
          description: d.description.trim(),
          amount: parseFloat(d.amount),
          date: d.date,
          recipientName: d.recipientName.trim(),
          categoryId: d.categoryId,
          eventId: d.eventId || undefined,
          paymentMethod: d.paymentMethod,
          memo: d.memo.trim() || undefined,
        }))
      );
      toast.success(`Saved ${drafts.length} check${drafts.length > 1 ? "s" : ""}`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save checks");
    } finally {
      setSaving(false);
    }
  }

  const draft = drafts[current];
  const invalidCount = drafts.filter((d) => !draftValid(d)).length;
  const allValid = drafts.length > 0 && invalidCount === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <ScanLine className="h-4 w-4" /> Scan checks
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan checks</DialogTitle>
        </DialogHeader>

        {/* Step 1: pick a photo */}
        {phase === "pick" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Take one photo of all the checks together (up to ~10). We&apos;ll
              read each one and open a stack of pre-filled forms for you to review.
            </p>
            <input
              id="scan-checks-file"
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="sr-only"
            />
            <label
              htmlFor="scan-checks-file"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input px-3 py-4 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Upload className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Choose a photo of your checks</span>
                <span className="block text-xs text-muted-foreground">
                  Handwriting is read best from a flat, well-lit shot.
                </span>
              </span>
              <span className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium">
                Browse
              </span>
            </label>
            {error && <p className="text-xs text-amber-600">{error}</p>}
          </div>
        )}

        {/* Step 2: scanning */}
        {phase === "scanning" && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Reading checks from your photo…
          </div>
        )}

        {/* Step 3: review stack */}
        {phase === "review" && draft && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs">Category for all checks</Label>
              <Select
                value={batchCategory}
                onValueChange={(v) => applyCategoryToAll(v ?? "")}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Set one category for the whole batch" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Applies to every check — override individual ones below.
              </p>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={current === 0}
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-1">
                {drafts.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Go to check ${i + 1}`}
                    className={`h-6 w-6 rounded-full text-xs font-medium transition-colors ${
                      i === current
                        ? "bg-primary text-primary-foreground"
                        : draftValid(d)
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={current === drafts.length - 1}
                onClick={() => setCurrent((c) => Math.min(drafts.length - 1, c + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Check {current + 1} of {drafts.length}
                {draftValid(draft) && (
                  <CheckIcon className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />
                )}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={removeCurrent}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>

            {/* The current check's editable fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check / ref #</Label>
                <Input
                  value={draft.checkNumber}
                  onChange={(e) => setField("checkNumber", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select
                  value={draft.paymentMethod}
                  onValueChange={(v) => setField("paymentMethod", (v ?? "CHECK") as PaymentMethod)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recipient</Label>
              <Input
                value={draft.recipientName}
                onChange={(e) => setField("recipientName", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setField("date", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={draft.categoryId}
                  onValueChange={(v) => setField("categoryId", v ?? "")}
                >
                  <SelectTrigger className="w-full">
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
                  value={draft.eventId || "none"}
                  onValueChange={(v) => setField("eventId", v && v !== "none" ? v : "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
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
              <Label>Description</Label>
              <Input
                value={draft.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Memo</Label>
              <Input
                value={draft.memo}
                onChange={(e) => setField("memo", e.target.value)}
              />
            </div>

            <div className="space-y-2 border-t pt-3">
              {!allValid && (
                <p className="text-xs text-amber-600">
                  {invalidCount} check{invalidCount > 1 ? "s" : ""} still need a category,
                  recipient, #, description, date, or a valid amount.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={!allValid || saving}
                onClick={handleSaveAll}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  `Save all ${drafts.length} check${drafts.length > 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
