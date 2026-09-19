"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importClearedChecks, type ClearedImportResult } from "@/actions/checks";
import { formatCurrency, formatDate } from "@/lib/format";
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
import { Landmark, Loader2, CircleCheck, TriangleAlert } from "lucide-react";

type Summary = Extract<ClearedImportResult, { ok: true }>;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function ImportClearedDialog({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  function reset() {
    setBusy(false);
    setError(null);
    setSummary(null);
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("semesterId", semesterId);
    setBusy(true);
    setError(null);
    try {
      const result = await importClearedChecks(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result);
      // The register behind the dialog should show the new "Cleared" badges
      // while the summary is still up.
      router.refresh();
    } catch {
      toast.error("Import failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

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
            <Landmark className="h-4 w-4" /> Import cleared
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark checks cleared from the bank</DialogTitle>
        </DialogHeader>

        {!summary ? (
          <form onSubmit={handleImport} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload the bank&apos;s account history CSV. Every check that has posted is
              marked cleared here, dated the day the bank paid it. Checks are matched on
              number <em>and</em> amount, because check numbers repeat over the years.
              Uploading overlapping files is fine — a check that&apos;s already cleared is
              left alone.
            </p>
            <div className="space-y-2">
              <Label>CSV file</Label>
              <Input name="file" type="file" accept=".csv,text/csv" required />
            </div>
            {error && <p className="text-xs text-warning-fg">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </form>
        ) : (
          <ImportSummary
            summary={summary}
            onDone={() => {
              setOpen(false);
              reset();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportSummary({ summary, onDone }: { summary: Summary; onDone: () => void }) {
  const { marked, alreadyCleared, review, unrecorded } = summary;
  const markedTotal = marked.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
            marked.length
              ? "bg-success-muted text-success-fg"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <CircleCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">
            {marked.length
              ? `${marked.length} ${plural(marked.length, "check")} marked cleared · ${formatCurrency(markedTotal)}`
              : "Nothing new to clear"}
          </p>
          <p className="text-sm text-muted-foreground">
            {alreadyCleared > 0
              ? `${alreadyCleared} ${plural(alreadyCleared, "was", "were")} already cleared and left as ${plural(alreadyCleared, "it is", "they are")}.`
              : marked.length
                ? "Dated the day the bank paid each one."
                : "None of the outstanding checks have posted yet."}
          </p>
        </div>
      </div>

      {marked.length > 0 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border text-sm">
          {marked.map((c, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-14 shrink-0 tabular-nums">#{c.checkNumber}</span>
              <span className="min-w-0 flex-1 truncate">{c.recipientName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(c.clearedDate)}
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums">
                {formatCurrency(c.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {review.length > 0 && (
        <div className="space-y-2 rounded-lg bg-warning-muted p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning-fg">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {review.length} {plural(review.length, "needs", "need")} a look — not changed
          </p>
          <ul className="space-y-1.5">
            {review.map((v, i) => (
              <li key={i}>
                <span className="font-medium tabular-nums">#{v.checkNumber}</span>{" "}
                {v.recipientName} —{" "}
                {v.reason === "amount" ? (
                  <>
                    recorded as {formatCurrency(v.amount)}, but the bank paid{" "}
                    {formatCurrency(v.bankAmount)} on {formatDate(v.bankDate)}. Fix the
                    amount or check # and import again.
                  </>
                ) : v.reason === "number" ? (
                  <>
                    nothing has posted under this number, but the bank paid{" "}
                    <span className="tabular-nums">#{v.bankCheckNumber}</span> for the same{" "}
                    {formatCurrency(v.bankAmount)} on {formatDate(v.bankDate)}, and that
                    check isn&apos;t in the register. If the number was misread, correct it
                    and import again.
                  </>
                ) : (
                  <>
                    the bank returned this check on {formatDate(v.bankDate)}
                    {v.cleared ? ", but it's marked cleared here." : "."}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unrecorded.length > 0 && (
        <details className="rounded-lg border text-sm">
          <summary className="cursor-pointer px-3 py-2 text-muted-foreground">
            {unrecorded.length} {plural(unrecorded.length, "check")} posted this semester{" "}
            {plural(unrecorded.length, "isn't", "aren't")} in the register
          </summary>
          <ul className="max-h-40 divide-y overflow-y-auto border-t">
            {unrecorded.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-14 shrink-0 tabular-nums">#{c.checkNumber}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {formatDate(c.postDate)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">
                  {formatCurrency(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Button type="button" className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
