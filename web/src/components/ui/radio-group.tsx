"use client";
/**
 * A group of choices on React Aria's RadioGroup: arrow keys move and select, each pill is one target.
 * In: a label, an optional hint and error, the choices. Out: the chosen value through onChange.
 * Every choice is a pill chip (round means you can press it, DESIGN.md Shape): 48 px tall, 1 px field border, white.
 * The chosen one has the tint fill, blue text and a blue 2 px edge (1 px border plus a 1 px inset ring, so nothing
 * moves when it is chosen) and Medium weight: a change of fill, edge and weight, never colour alone.
 */
import { FieldError, Label, Radio, RadioGroup as AriaRadioGroup, Text, type RadioGroupProps } from "react-aria-components";
import { cn } from "@/lib/utils";

export type Choice = { value: string; label: React.ReactNode; description?: React.ReactNode };

export function RadioGroup({ label, hint, error, choices, cards = false, orientation, className, ...props }: Omit<RadioGroupProps, "children" | "className"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  choices: Choice[];
  /** Larger choices in two columns (the business type on step 1). Still pills. */
  cards?: boolean;
  className?: string;
}) {
  return (
    <AriaRadioGroup {...props} orientation={orientation} isInvalid={!!error} className={cn("flex flex-col gap-2", className)}>
      <Label className="font-medium">{label}</Label>
      {hint ? <Text slot="description" className="text-ink-muted">{hint}</Text> : null}
      {error ? <FieldError className="text-fix font-medium">{error}</FieldError> : null}
      <div className={cn(
        "mt-1",
        cards ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : orientation === "horizontal" ? "flex flex-wrap gap-2" : "flex flex-col items-start gap-2",
      )}>
        {choices.map((c) => (
          <Radio
            key={c.value}
            value={c.value}
            className={({ isSelected }) =>
              cn(
                "choice-pill flex min-h-12 max-w-full cursor-pointer flex-col justify-center rounded-full border px-5 py-2",
                "data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue",
                // An error is said once, above the choices (and in the summary); the pills keep their usual border (F7).
                isSelected ? "border-blue bg-tint font-medium text-blue" : "border-field bg-white text-ink data-[hovered]:border-ink",
                cards && "w-full",
              )
            }
          >
            <span>{c.label}</span>
            {c.description ? <span className="font-normal text-ink-muted">{c.description}</span> : null}
          </Radio>
        ))}
      </div>
    </AriaRadioGroup>
  );
}
