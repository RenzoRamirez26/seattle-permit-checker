import { cn } from "@/lib/utils";
import { look } from "./status";
import { StatusIcon } from "./StatusIcon";

/** The status as its shape-coded icon plus its words; never colour alone, and the words never wrap away from the icon. */
export function StatusTag({ status, word, className }: { status: string; word?: string; className?: string }) {
  const l = look(status);
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap font-medium text-ink", className)}>
      <StatusIcon mark={l.mark} />
      {word ?? l.word}
    </span>
  );
}
