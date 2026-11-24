"use client";
/**
 * Step 2, "Upload your floor plan": a drop area, "Choose a file", and the camera on phones. The file type and
 * size are checked here, before anything is sent, against the API's own limits (/api/meta). States: empty, a file
 * chosen, read (a reading is kept from before), failed (?problem=<code> from the Reading page).
 * The file stays in memory only (D12).
 */
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DropZone, FileTrigger, Text } from "react-aria-components";
import { Camera, FileUp } from "lucide-react";
import type { Meta } from "@/api/client";
import { errorWords } from "@/api/errors";
import { ErrorSummary, type ProblemItem } from "@/components/flow/ErrorSummary";
import { PageShell } from "@/components/flow/PageShell";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { NOT_SAVED, USABLE_PLAN } from "@/content/plan";
import { useHydrated } from "@/lib/hydrated";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { flow, planFile } from "@/state/flow";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf" };

/** The problem with a chosen file, in the owner's words, or null. Uses the API's limits only. */
export function fileProblem(file: File, meta: Pick<Meta, "limits">): string | null {
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!meta.limits.upload_types.includes(ext)) return errorWords("unsupported_file_type");
  if (file.size === 0) return errorWords("empty_file");
  const mb = file.size / 1024 / 1024;
  if (mb > meta.limits.max_upload_mb) {
    return `The file is ${formatNumber(mb)} MB and the limit is ${formatNumber(meta.limits.max_upload_mb)} MB. Upload a smaller copy, for example a photo instead of a scan.`;
  }
  return null;
}

const sizeWords = (bytes: number) => (bytes < 1024 * 1024 ? `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB` : `${formatNumber(bytes / 1024 / 1024)} MB`);

export function PlanPage() {
  const hydrated = useHydrated();
  return (
    <PageShell step={2} back="/business/" title="Upload your floor plan">
      {hydrated ? <PlanBody /> : <p className="m-0" aria-live="polite">Loading…</p>}
    </PageShell>
  );
}

function PlanBody() {
  const router = useRouter();
  const problemCode = useSearchParams().get("problem");
  const { meta } = useMeta();
  const file = useSyncExternalStore(planFile.subscribe, planFile.get, () => null);
  const [reading] = useState(() => flow.reading());
  const [fileError, setFileError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const summary = useRef<HTMLDivElement>(null);

  const choose = (f: File | null | undefined) => {
    if (!f || !meta) return;
    const p = fileProblem(f, meta);
    setFileError(p);
    if (p) {
      planFile.clear();
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#plan-file button")?.focus());
    } else {
      planFile.set(f);
      if (problemCode) router.replace("/plan/");
    }
  };

  const read = () => {
    if (!file) {
      setFileError("Choose your floor plan file first.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#plan-file button")?.focus());
      return;
    }
    router.push("/plan/reading/");
  };

  const ORDER = [".pdf", ".png", ".jpg"];          // the brief's order: "PDF, PNG or JPG"
  const types = meta
    ? meta.limits.upload_types.filter((t) => t !== ".jpeg").sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map((t) => t.slice(1).toUpperCase()).join(", ").replace(/, ([^,]*)$/, " or $1")
    : "PDF, PNG or JPG";
  const accepted = meta ? [...new Set(meta.limits.upload_types.map((t) => MIME[t]).filter(Boolean))] : Object.values(MIME);
  const failed = !!problemCode;              // the last reading failed: say so even though the file is still chosen
  const problems: ProblemItem[] = [
    ...(fileError ? [{ text: fileError, href: "#plan-file" }] : []),
    ...(problemCode ? [{ text: errorWords(problemCode) }] : []),
  ];
  const state = failed ? "failed" : file ? "chosen" : reading && reading.source !== "manual" ? "read" : "empty";

  return (
    <div className="flex flex-col gap-8" data-state={state}>
      <ErrorSummary ref={summary} items={problems} />

      {failed ? <OtherWays meta={meta} /> : null}

      <div className="flex flex-col gap-4">
        <p className="m-0">The plan must be a {types} file{meta ? `, up to ${formatNumber(meta.limits.max_upload_mb)} MB` : ""}. A usable plan shows:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
          {USABLE_PLAN.map((t) => <li key={t}>{t}</li>)}
        </ul>
        {meta ? <p className="m-0 text-ink-muted">{NOT_SAVED(meta.limits.check_days)}</p> : null}
        {meta && !meta.features.model_api_key && problemCode !== "no_model_key" ? (
          <p className="m-0 border-l-2 border-city bg-city-tint p-4">
            This server cannot read uploaded plans yet. You can still <Link href="/">try an example plan</Link> or{" "}
            <Link href="/check/?enter=yourself">enter the measurements yourself</Link>.
          </p>
        ) : null}
      </div>

      <div id="plan-file">
        <DropZone
          aria-label="Drop the floor plan file here"
          getDropOperation={(types) => (accepted.some((t) => types.has(t)) ? "copy" : "cancel")}
          onDropEnter={() => setDropping(true)}
          onDropExit={() => setDropping(false)}
          onDrop={async (e) => {
            setDropping(false);
            const item = e.items.find((i) => i.kind === "file");
            if (item && item.kind === "file") choose(await item.getFile());
          }}
          className={cn(
            "flex flex-col items-start gap-4 rounded-sm border-2 border-dashed p-6",
            dropping ? "border-blue bg-white" : fileError ? "border-fix" : "border-field",
            "data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue",
          )}
        >
          {fileError ? <p className="m-0 font-semibold text-fix">{fileError}</p> : null}
          {file ? (
            <Text slot="label" className="m-0 flex flex-col">
              <span className="font-semibold">Chosen: <span className="break-all">{file.name}</span></span>
              <span className="text-ink-muted nums">{sizeWords(file.size)}. It is sent only when you press Read my plan.</span>
            </Text>
          ) : state === "read" && reading ? (
            <Text slot="label" className="m-0 flex flex-col gap-2">
              <span className="font-semibold">
                Already read: {reading.file_name ?? meta?.demo_cases.find((c) => c.id === reading.case_id)?.title ?? "your plan"}.
              </span>
              <Link href="/check/" className="self-start">Check what we read</Link>
              <span className="text-ink-muted">Or choose another file to read it instead.</span>
            </Text>
          ) : (
            <Text slot="label" className="m-0 flex items-center gap-3">
              <FileUp aria-hidden size={24} className="shrink-0 text-ink-muted" />
              Drag your floor plan here, or choose it.
            </Text>
          )}
          <div className="flex flex-wrap gap-4">
            <FileTrigger acceptedFileTypes={accepted} onSelect={(files) => choose(files?.[0])}>
              <Button variant="secondary">{file ? "Choose a different file" : "Choose a file"}</Button>
            </FileTrigger>
            <span className="hidden pointer-coarse:contents">
              <FileTrigger acceptedFileTypes={["image/*"]} defaultCamera="environment" onSelect={(files) => choose(files?.[0])}>
                <Button variant="secondary"><Camera aria-hidden size={18} /> Take a photo of the plan</Button>
              </FileTrigger>
            </span>
          </div>
        </DropZone>
      </div>

      <div>
        <Button variant="primary" onPress={read}>Read my plan</Button>
      </div>
    </div>
  );
}

/** When reading failed: other ways to finish (brief: no dead ends; the model failing must not stop the owner). */
function OtherWays({ meta }: { meta: Meta | null }) {
  return (
    <section aria-labelledby="other-ways" className="flex flex-col gap-2">
      <h2 id="other-ways" className="m-0 text-section-heading">Other ways to go on</h2>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
        <li><Link href="/check/?enter=yourself">Enter the measurements yourself</Link></li>
        {meta?.demo_cases.map((c) => (
          <li key={c.id}><Link href={`/plan/reading/?example=${encodeURIComponent(c.id)}`}>Try the example plan: {c.title}</Link></li>
        ))}
        <li>Upload a clearer copy of your plan below.</li>
      </ul>
    </section>
  );
}

