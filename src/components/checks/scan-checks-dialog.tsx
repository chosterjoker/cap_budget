"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { scanChecks, createChecks } from "@/actions/checks";
import { formatCurrency, todayInput } from "@/lib/format";
import { downscaleImage } from "@/lib/image";
import type { ParsedCheck } from "@/lib/ocr";
import {
  cents,
  sameMember,
  suggestReimbursements,
  type OpenReimbursement,
} from "@/lib/reimbursement-match";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Sparkles,
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

// "payment" is a new spend against a category. "reimbursement" pays out existing
// reimbursements, which already carry their own categories (and already count
// toward the budget), so that kind needs no category of its own.
type DraftKind = "payment" | "reimbursement";

type Draft = {
  kind: DraftKind;
  reimbursementIds: string[];
  // The selection was our guess, not the treasurer's — say so until they touch it.
  autoMatched: boolean;
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

function toDraft(p: ParsedCheck, suggested: string[] | null): Draft {
  const settles = suggested !== null;
  return {
    kind: settles ? "reimbursement" : "payment",
    reimbursementIds: suggested ?? [],
    autoMatched: Boolean(suggested?.length),
    checkNumber: p.checkNumber ?? "",
    recipientName: p.recipientName ?? "",
    amount: p.amount != null ? String(p.amount) : "",
    date: p.date ?? todayInput(),
    memo: p.memo ?? "",
    // Checks have no obvious "description"; seed it from the memo, then the
    // payee, so the required field is rarely blank. Settlements get the same
    // wording as the Reimbursements page's "Pay via check".
    description:
      p.memo ||
      (settles && p.recipientName ? `Reimbursement — ${p.recipientName}` : p.recipientName) ||
      "",
    categoryId: "",
    eventId: "",
    paymentMethod: "CHECK",
  };
}

/** A draft's selection, minus anything that has since been paid some other way. */
function selectedIds(d: Draft, open: Map<string, OpenReimbursement>) {
  return d.reimbursementIds.filter((id) => open.has(id));
}

function draftValid(d: Draft, open: Map<string, OpenReimbursement>): boolean {
  return Boolean(
    d.checkNumber.trim() &&
      d.recipientName.trim() &&
      d.description.trim() &&
      (d.kind === "reimbursement" ? selectedIds(d, open).length : d.categoryId) &&
      parseFloat(d.amount) > 0 &&
      d.date &&
      !Number.isNaN(new Date(d.date).getTime())
  );
}

/** Cents the draft's selected reimbursements add up to. */
function selectedCents(d: Draft, open: Map<string, OpenReimbursement>) {
  return selectedIds(d, open).reduce((s, id) => s + cents(open.get(id)!.amount), 0);
}

/** A settlement whose check amount isn't what its reimbursements add up to. */
function amountMismatch(d: Draft, open: Map<string, OpenReimbursement>) {
  if (d.kind !== "reimbursement" || !selectedIds(d, open).length) return false;
  const amount = parseFloat(d.amount);
  return Number.isFinite(amount) && cents(amount) !== selectedCents(d, open);
}

export function ScanChecksDialog({
  semesterId,
  categories,
  events,
  reimbursements,
}: {
  semesterId: string;
  categories: Category[];
  events: EventOption[];
  reimbursements: OpenReimbursement[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [current, setCurrent] = useState(0);
  const [batchCategory, setBatchCategory] = useState("");
  const [batchEvent, setBatchEvent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openById = useMemo(
    () => new Map(reimbursements.map((r) => [r.id, r])),
    [reimbursements]
  );

  function reset() {
    setPhase("pick");
    setDrafts([]);
    setCurrent(0);
    setBatchCategory("");
    setBatchEvent("");
    setError(null);
    setSaving(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a failed read
    if (!original) return;
    setError(null);
    setPhase("scanning");
    try {
      // Shrink before upload — Vercel caps request bodies at ~4.5MB and OpenAI
      // rejects images over ~20MB, so a raw phone photo would fail outright.
      const file = await downscaleImage(original);
      const fd = new FormData();
      fd.append("image", file);
      const parsed = await scanChecks(fd);
      if (!parsed.length) {
        setPhase("pick");
        setError("Couldn't read any checks from that photo. Try a flatter, well-lit shot.");
        return;
      }
      // Match in order, so two checks in one photo never claim the same
      // reimbursement.
      const taken = new Set<string>();
      const next = parsed.map((p) => {
        const suggested = suggestReimbursements(
          p,
          reimbursements.filter((r) => !taken.has(r.id))
        );
        suggested?.forEach((id) => taken.add(id));
        return toDraft(p, suggested);
      });
      setDrafts(next);
      setCurrent(0);
      setPhase("review");
    } catch {
      setPhase("pick");
      setError("Scan failed — please try again.");
    }
  }

  function patchCurrent(patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === current ? { ...d, ...patch } : d)));
  }

  function setField(
    field: Exclude<keyof Draft, "kind" | "reimbursementIds" | "autoMatched">,
    value: string
  ) {
    patchCurrent({ [field]: value });
  }

  function setKind(kind: DraftKind) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== current) return d;
        if (kind === "payment") return { ...d, kind };
        // A check's picks go dormant while it's a "payment", which frees them
        // for other checks. Coming back, give up any that were taken meanwhile —
        // otherwise two checks would both hold one reimbursement.
        const taken = new Set(
          prev.flatMap((o, j) =>
            j !== i && o.kind === "reimbursement" ? o.reimbursementIds : []
          )
        );
        const kept = d.reimbursementIds.filter((id) => !taken.has(id));
        return {
          ...d,
          kind,
          reimbursementIds: kept,
          autoMatched: d.autoMatched && kept.length === d.reimbursementIds.length,
        };
      })
    );
  }

  function toggleReimbursement(id: string, on: boolean) {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === current
          ? {
              ...d,
              autoMatched: false,
              reimbursementIds: on
                ? [...d.reimbursementIds, id]
                : d.reimbursementIds.filter((x) => x !== id),
            }
          : d
      )
    );
  }

  function applyCategoryToAll(catId: string) {
    setBatchCategory(catId);
    setDrafts((prev) => prev.map((d) => ({ ...d, categoryId: catId })));
  }

  // "none" is the picker's explicit "no event" row; drafts store that as "".
  function applyEventToAll(eventId: string) {
    setBatchEvent(eventId);
    setDrafts((prev) =>
      prev.map((d) => ({ ...d, eventId: eventId === "none" ? "" : eventId }))
    );
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
    if (!drafts.every((d) => draftValid(d, openById))) return;
    setSaving(true);
    try {
      const result = await createChecks(
        semesterId,
        drafts.map((d) => {
          const settles = d.kind === "reimbursement";
          return {
            checkNumber: d.checkNumber.trim(),
            description: d.description.trim(),
            amount: parseFloat(d.amount),
            date: d.date,
            recipientName: d.recipientName.trim(),
            categoryId: settles ? undefined : d.categoryId,
            eventId: settles ? undefined : d.eventId || undefined,
            paymentMethod: d.paymentMethod,
            memo: d.memo.trim() || undefined,
            reimbursementIds: settles ? selectedIds(d, openById) : undefined,
          };
        })
      );
      if (!result.ok) {
        toast.error(result.error);
        // Most likely a reimbursement was paid elsewhere while this was open —
        // pull the current list so the stale pick drops out of the drafts.
        router.refresh();
        return;
      }
      const paid = drafts.reduce(
        (n, d) => n + (d.kind === "reimbursement" ? selectedIds(d, openById).length : 0),
        0
      );
      toast.success(
        `Saved ${drafts.length} check${drafts.length > 1 ? "s" : ""}` +
          (paid ? ` · ${paid} reimbursement${paid > 1 ? "s" : ""} marked paid` : "")
      );
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
  const invalidCount = drafts.filter((d) => !draftValid(d, openById)).length;
  const allValid = drafts.length > 0 && invalidCount === 0;
  const mismatchCount = drafts.filter((d) => amountMismatch(d, openById)).length;
  const anyPayments = drafts.some((d) => d.kind === "payment");
  const anySettlements = drafts.some((d) => d.kind === "reimbursement");

  // A Select's trigger prints its raw value unless the root is handed the
  // labels — without these a category reads as its id instead of its name.
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const eventLabels = {
    none: "— None —",
    ...Object.fromEntries(events.map((e) => [e.id, e.name])),
  };

  // Reimbursements another check in this batch already pays → that check's index.
  const claimedElsewhere = new Map<string, number>();
  drafts.forEach((d, i) => {
    if (i === current || d.kind !== "reimbursement") return;
    for (const id of selectedIds(d, openById)) claimedElsewhere.set(id, i);
  });
  // This payee's reimbursements first — they're almost always the ones wanted.
  const pickerRows = draft
    ? [...reimbursements].sort(
        (a, b) =>
          Number(sameMember(b.memberName, draft.recipientName)) -
          Number(sameMember(a.memberName, draft.recipientName))
      )
    : [];
  const draftSelected = draft ? selectedIds(draft, openById) : [];
  const draftTotal = draft ? selectedCents(draft, openById) / 100 : 0;

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
              {reimbursements.length > 0 &&
                " A check made out to a member with open reimbursements is matched to them, so saving it marks them paid."}
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
            {error && <p className="text-xs text-warning-fg">{error}</p>}
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
            {anyPayments && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className={events.length > 0 ? "grid grid-cols-2 items-end gap-4" : undefined}>
                <div className="min-w-0">
                  <Label className="text-xs">
                    {anySettlements ? "Category for all new payments" : "Category for all checks"}
                  </Label>
                  <Select
                    value={batchCategory}
                    onValueChange={(v) => applyCategoryToAll(v ?? "")}
                    items={categoryLabels}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue
                        placeholder={
                          events.length > 0
                            ? "Select a category"
                            : "Set one category for the whole batch"
                        }
                      />
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
                {events.length > 0 && (
                  <div className="min-w-0">
                    <Label className="text-xs">
                      {anySettlements ? "Event for all new payments" : "Event for all checks"}
                    </Label>
                    <Select
                      value={batchEvent}
                      onValueChange={(v) => applyEventToAll(v ?? "")}
                      items={eventLabels}
                    >
                      <SelectTrigger className="mt-1 w-full">
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
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {anySettlements
                  ? `Override individual ones below. Checks that pay reimbursements use the reimbursements' ${
                      events.length > 0 ? "categories and events" : "categories"
                    }.`
                  : "Applies to every check — override individual ones below."}
              </p>
            </div>
            )}

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
                        : draftValid(d, openById)
                          ? "bg-success-muted text-success-fg"
                          : "bg-warning-muted text-warning-fg"
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
                {draftValid(draft, openById) && (
                  <CheckIcon className="ml-1 inline h-3.5 w-3.5 text-success-fg" />
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

            {/* What this check is for. Hidden when nothing is owed, since then
                every check can only be a new payment. */}
            {(reimbursements.length > 0 || draft.kind === "reimbursement") && (
              <Tabs
                value={draft.kind}
                onValueChange={(v) => setKind(v as DraftKind)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="payment">New payment</TabsTrigger>
                  <TabsTrigger value="reimbursement">Pays reimbursements</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {draft.kind === "reimbursement" && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Reimbursements this check pays</Label>
                  {draftSelected.length > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {draftSelected.length} selected · {formatCurrency(draftTotal)}
                    </span>
                  )}
                </div>
                {draft.autoMatched && (
                  <p className="flex items-center gap-1.5 text-xs text-success-fg">
                    <Sparkles className="h-3 w-3 shrink-0" /> Matched by payee and
                    amount — double-check before saving.
                  </p>
                )}
                {pickerRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No reimbursements are waiting to be paid.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {pickerRows.map((r) => {
                      const onCheck = claimedElsewhere.get(r.id);
                      const taken = onCheck !== undefined;
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center justify-between gap-2 rounded px-1 py-1 text-sm ${
                            taken
                              ? "text-muted-foreground"
                              : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Checkbox
                              checked={draftSelected.includes(r.id)}
                              disabled={taken}
                              onCheckedChange={(v) => toggleReimbursement(r.id, Boolean(v))}
                            />
                            <span className="truncate">
                              {r.name} · {r.memberName}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {taken ? `On check ${onCheck + 1}` : formatCurrency(r.amount)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {amountMismatch(draft, openById) && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-warning-muted px-2 py-1.5 text-xs text-warning-fg">
                    <span>
                      The check reads {formatCurrency(parseFloat(draft.amount))}, but these
                      add up to {formatCurrency(draftTotal)}.
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setField("amount", draftTotal.toFixed(2))}
                    >
                      Use {formatCurrency(draftTotal)}
                    </Button>
                  </div>
                )}
              </div>
            )}

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
                  items={PAYMENT_LABELS}
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

            {/* A settlement has no category or event of its own — each
                reimbursement it pays already carries them. */}
            {draft.kind === "payment" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={draft.categoryId}
                  onValueChange={(v) => setField("categoryId", v ?? "")}
                  items={categoryLabels}
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
                  items={eventLabels}
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
            )}

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
                <p className="text-xs text-warning-fg">
                  {invalidCount} check{invalidCount > 1 ? "s" : ""} still need a category
                  {anySettlements ? " (or the reimbursements they pay)" : ""}, recipient, #,
                  description, date, or a valid amount.
                </p>
              )}
              {allValid && mismatchCount > 0 && (
                <p className="text-xs text-warning-fg">
                  {mismatchCount} check{mismatchCount > 1 ? "s don't" : " doesn't"} match the
                  total of the reimbursements {mismatchCount > 1 ? "they pay" : "it pays"} —
                  saving keeps the amount written on the check.
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
