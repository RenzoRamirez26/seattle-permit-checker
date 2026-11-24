"use client";
/**
 * The floor plan beside the facts. The picture comes from the browser only: an example plan from
 * /demo/, an uploaded PNG or JPG as an object URL, an uploaded PDF drawn by PDF.js. The file is held in
 * memory; after a refresh it is gone (D12) and the owner can choose it again to see it here.
 * Zoom with the buttons (keyboard and one hand) or by pinching.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FileTrigger } from "react-aria-components";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planFile } from "@/state/flow";

const ZOOMS = [1, 1.5, 2, 3, 4];

export function PlanViewer({ caseId, caseTitle, manual, fileName }: {
  caseId?: string | null;
  caseTitle?: string | null;
  manual?: boolean;
  fileName?: string | null;
}) {
  const file = useSyncExternalStore(planFile.subscribe, planFile.get, () => null);
  const [demoSrc, setDemoSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    if (!caseId) return;
    let live = true;
    fetch("/demo/plans.json")
      .then((r) => r.json())
      .then((plans: Record<string, string>) => live && plans[caseId] && setDemoSrc(`/demo/${plans[caseId]}`))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [caseId]);

  const label = caseId ? `Example floor plan: ${caseTitle ?? "example"}` : `Your floor plan${file ? `: ${file.name}` : ""}`;
  const hasPicture = !!(file || demoSrc);

  return (
    <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
      <h2 id="plan-heading" className="m-0 text-section-heading">Your plan</h2>
      {hasPicture ? (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Zoom the plan">
            <Button variant="secondary" className="min-h-11 px-3" isDisabled={zoom === 0} onPress={() => setZoom((z) => Math.max(0, z - 1))}>
              <Minus aria-hidden size={18} /> Zoom out
            </Button>
            <Button variant="secondary" className="min-h-11 px-3" isDisabled={zoom === ZOOMS.length - 1} onPress={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <Plus aria-hidden size={18} /> Zoom in
            </Button>
            <Button variant="quiet" isDisabled={zoom === 0} onPress={() => setZoom(0)}>
              <Maximize2 aria-hidden size={16} /> Fit
            </Button>
            <span className="text-small text-ink-muted nums" aria-live="polite">{Math.round(ZOOMS[zoom] * 100)}%</span>
          </div>
          <div
            role="region"
            aria-label={`${label}, scrollable`}
            tabIndex={0}
            className="max-h-[70vh] overflow-auto overscroll-contain border border-hairline bg-white"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            <div style={{ width: `${ZOOMS[zoom] * 100}%` }}>
              {file?.type === "application/pdf" ? (
                <PdfPage file={file} label={label} />
              ) : (
                <PlanImage src={file ? undefined : demoSrc} file={file} alt={label} />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-4 border border-dashed border-field p-6">
          <p className="m-0 measure">
            {manual
              ? "There is no plan here because you are entering the measurements yourself. You can still choose your plan file to look at while you type. It stays in this browser and is not sent."
              : `The plan is not kept after a refresh. Choose the file again to see it here.${fileName ? ` It was ${fileName}.` : ""}`}
          </p>
          <FileTrigger acceptedFileTypes={["image/png", "image/jpeg", "application/pdf"]} onSelect={(files) => files?.[0] && planFile.set(files[0])}>
            <Button variant="secondary">Choose the plan file</Button>
          </FileTrigger>
        </div>
      )}
    </section>
  );
}

function PlanImage({ src, file, alt }: { src?: string | null; file: File | null; alt: string }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const shown = file ? url : src;
  if (!shown) return <div className="aspect-[4/3] w-full" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shown} alt={alt} className="block h-auto w-full" />;
}

function PdfPage({ file, label }: { file: File; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const c = canvas.current;
        if (!c || cancelled) return;
        c.width = viewport.width;
        c.height = viewport.height;
        await page.render({ canvas: c, viewport }).promise;
      } catch {
        if (!cancelled) setProblem(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (problem) return <p className="m-0 p-4">This PDF could not be shown here. The facts beside it were still read from it.</p>;
  return <canvas ref={canvas} role="img" aria-label={label} className="block h-auto w-full" />;
}
