import { cn } from "@/lib/utils";
import { look } from "./status";

/** Icon plus word on the status tint; never colour alone, and the word never wraps away from its icon. */
export function StatusTag({ status, word, className }: { status: string; word?: string; className?: string }) {
  const l = look(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-small font-semibold", l.tint, l.text, className)}>
      <l.Icon aria-hidden size={16} strokeWidth={2.25} />
      {word ?? l.word}
    </span>
  );
}
