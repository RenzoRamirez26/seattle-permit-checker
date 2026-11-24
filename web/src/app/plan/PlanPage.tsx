"use client";
/**
 * Step 2, "Upload your floor plan": a drop area, "Choose a file", and the camera on phones; a preview of the chosen
 * file; and the example plans as rows. The file type and size are checked here, before anything is sent, against the
 * API's own limits (/api/meta). States (data-state): empty, chosen, read (a reading is kept from before), unreadable
 * (?problem=plan_reading_failed: the model could not read the plan), failed (any other ?problem=<code> from the
 * Reading page). On a server with no model key, the example plans and manual entry are listed before the owner tries
 * an upload. The file stays in memory only (D12); nothing is sent until Read my plan.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DropZone, FileTrigger, Text } from "react-aria-components";
import { ArrowRight, Camera, FileUp } from "lucide-react";
import type { Meta } from "@/api/client";
import { errorWords } from "@/api/errors";
import { ErrorSummary, type ProblemItem } from "@/components/flow/ErrorSummary";
import { PageShell } from "@/components/flow/PageShell";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { EXAMPLES, NOT_SAVED, READY_TO_READ, UNREADABLE, USABLE_PLAN } from "@/content/plan";
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
    <PageShell step={2} back="/" title="Upload your floor plan">
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
  const fileInput = useRef<HTMLInputElement>(null);

  const focusChooser = () => requestAnimationFrame(() => document.querySelector<HTMLElement>("#plan-file button")?.focus());

  const choose = (f: File | null | undefined) => {
    if (!f || !meta) return;
    const p = fileProblem(f, meta);
    setFileError(p);
    if (p) {
      planFile.clear();
      focusChooser();
    } else {
      planFile.set(f);
      if (problemCode) router.replace("/plan/");
    }
  };

  const read = () => {
    if (!file) {
      setFileError("Choose your floor plan file first.");
      focusChooser();
      return;
    }
    router.push("/plan/reading/");
  };

  /** "Upload another plan": forget the plan that could not be read and open the file chooser straight away. */
  const uploadAnother = () => {
    setFileError(null);
    planFile.clear();
    document.querySelector<HTMLElement>("#plan-file button")?.focus();
    if (fileInput.current) {
      fileInput.current.value = "";
      fileInput.current.click();
    }
  };

  const ORDER = [".pdf", ".png", ".jpg"];          // the brief's order: "PDF, PNG or JPG"
  const types = meta
    ? meta.limits.upload_types.filter((t) => t !== ".jpeg").sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map((t) => t.slice(1).toUpperCase()).join(", ").replace(/, ([^,]*)$/, " or $1")
    : "PDF, PNG or JPG";
  const accepted = meta ? [...new Set(meta.limits.upload_types.map((t) => MIME[t]).filter(Boolean))] : Object.values(MIME);
  const unreadable = problemCode === "plan_reading_failed";
  const failed = !!problemCode && !unreadable;   // the last reading failed: say so even though the file is still chosen
  const problems: ProblemItem[] = [
    ...(fileError ? [{ text: fileError, href: "#plan-file" }] : []),
    ...(failed ? [{ text: errorWords(problemCode) }] : []),
  ];
  const state = unreadable ? "unreadable" : failed ? "failed" : file ? "chosen" : reading && reading.source !== "manual" ? "read" : "empty";
  const showNoKey = meta && !meta.features.model_api_key && problemCode !== "no_model_key" && !unreadable;

  return (
    <div className="flex flex-col gap-8" data-state={state}>
      <ErrorSummary ref={summary} items={problems} />

      {unreadable ? <Unreadable onUpload={uploadAnother} /> : null}
      {failed ? <OtherWays /> : null}

      <div className="flex flex-col gap-4">
        <p className="m-0">The plan can be a {types} file{meta ? `, up to ${formatNumber(meta.limits.max_upload_mb)} MB` : ""}. A usable plan shows:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
          {USABLE_PLAN.map((t) => <li key={t}>{t}</li>)}
        </ul>
        {meta ? <p className="m-0 text-ink-muted">{NOT_SAVED(meta.limits.check_days)}</p> : null}
        {showNoKey ? <NoModelKey /> : null}
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
            "flex flex-col items-start gap-4 rounded-2xl border-2 border-dashed p-6",
            dropping ? "border-blue bg-white" : fileError ? "border-fix" : "border-field",
            "data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue",
          )}
        >
          {fileError ? <p className="m-0 font-medium text-fix">{fileError}</p> : null}
          {file ? (
            <Text slot="label" className="m-0 flex items-center gap-3">
              <FileUp aria-hidden size={24} className="shrink-0 text-ink-muted" />
              Drag a different plan here, or choose it.
            </Text>
          ) : state === "read" && reading ? (
            <Text slot="label" className="m-0 flex flex-col gap-2">
              <span className="font-medium">
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
            <FileTrigger ref={fileInput} acceptedFileTypes={accepted} onSelect={(files) => choose(files?.[0])}>
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

      {file ? <FilePreview file={file} /> : null}

      <div>
        <Button variant="primary" onPress={read}>Read my plan</Button>
      </div>

      <Examples meta={meta} />
    </div>
  );
}

type Size = { width: number; height: number };

/** The chosen file before it is sent: its name, its size, a small picture for a PNG or JPG, and that nothing is sent yet. */
function FilePreview({ file }: { file: File }) {
  const picture = file.type === "image/png" || file.type === "image/jpeg";
  const [thumb, setThumb] = useState<{ file: File; url: string; size: Size } | null>(null);
  useEffect(() => {
    if (!picture) return;
    let live = true;
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.src = url;
    probe.decode().then(
      () => live && setThumb({ file, url, size: { width: probe.naturalWidth, height: probe.naturalHeight } }),
      () => undefined,                     // cannot be decoded: the name and size are still shown
    );
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file, picture]);
  const shown = thumb && thumb.file === file ? thumb : null;
  return (
    <section aria-labelledby="chosen-file" className="flex flex-col gap-4 rounded-2xl bg-white p-6 sm:flex-row sm:items-start">
      {picture ? (
        <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline bg-paper">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- an object URL for a file that never leaves the browser
            <img src={shown.url} width={shown.size.width} height={shown.size.height} alt={`Preview of ${file.name}`} className="block h-auto max-h-full w-auto max-w-full" />
          ) : null}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="chosen-file" className="m-0 font-medium">Chosen: <span className="break-all">{file.name}</span></h2>
        <p className="m-0 text-ink-muted nums">{sizeWords(file.size)}</p>
        <p className="m-0" role="status">{READY_TO_READ}</p>
      </div>
    </section>
  );
}

/** The example plans from /api/meta, as full-width rows that read the example straight away. */
function Examples({ meta }: { meta: Meta | null }) {
  return (
    <section aria-labelledby="examples" className="flex flex-col gap-4 border-t border-hairline pt-8">
      <div className="flex flex-col gap-1">
        <h2 id="examples" className="m-0 text-section-heading">{EXAMPLES.heading}</h2>
        <p className="m-0 text-ink-muted">{EXAMPLES.text}</p>
      </div>
      {meta ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {meta.demo_cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/plan/reading/?example=${encodeURIComponent(c.id)}`}
                className="flex min-h-12 w-full items-center justify-between gap-4 rounded-full border border-field bg-white px-6 py-2 text-ink no-underline hover:border-ink hover:underline"
              >
                <span>{c.title}</span>
                <ArrowRight aria-hidden size={20} className="shrink-0 text-blue" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0" aria-live="polite">Loading the examples…</p>
      )}
    </section>
  );
}

/** The model could not read the uploaded plan: two things to try, then upload again or enter the readings by hand. */
function Unreadable({ onUpload }: { onUpload: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);     // arriving from the Reading page: start at what went wrong
  return (
    <section aria-labelledby="unreadable" className="flex flex-col gap-4 rounded-2xl bg-white p-6">
      <h2 ref={heading} id="unreadable" tabIndex={-1} className="m-0 text-section-heading outline-none">{UNREADABLE.heading}</h2>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
        {UNREADABLE.suggestions.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <div className="flex flex-wrap gap-4">
        <Button variant="secondary" onPress={onUpload}>{UNREADABLE.upload}</Button>
        <LinkButton href="/check/?enter=yourself" variant="secondary">{UNREADABLE.byHand}</LinkButton>
      </div>
    </section>
  );
}

/**
 * The ways to finish without an uploaded plan being read: by hand, or with an example plan. The examples themselves are
 * listed once, as the pill rows under "Try an example plan" (Examples); this only points there.
 */
function WithoutReading({ children }: { children?: React.ReactNode }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
      <li><Link href="/check/?enter=yourself">Enter the measurements yourself</Link></li>
      <li><a href="#examples">{EXAMPLES.below}</a></li>
      {children}
    </ul>
  );
}

/** When reading failed for another reason: other ways to finish (no dead ends; the model failing must not stop the owner). */
function OtherWays() {
  return (
    <section aria-labelledby="other-ways" className="flex flex-col gap-2">
      <h2 id="other-ways" className="m-0 text-section-heading">Other ways to go on</h2>
      <WithoutReading>
        <li>Upload a clearer copy of your plan below.</li>
      </WithoutReading>
    </section>
  );
}

/** A server with no model key cannot read uploads: say so before the owner tries, and point to the examples on step 2. */
function NoModelKey() {
  return (
    <section aria-labelledby="no-model-key" className="flex flex-col gap-2 rounded-2xl bg-tint p-6">
      <p id="no-model-key" className="m-0">This server can&apos;t read uploaded plans yet. You can still try an example plan, or enter the measurements yourself:</p>
      <WithoutReading />
    </section>
  );
}
