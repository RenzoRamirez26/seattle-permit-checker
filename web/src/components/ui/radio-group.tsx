"use client";
/** A group of choices on React Aria's RadioGroup: arrow keys move, the label and the circle are one target. */
import { FieldError, Label, Radio, RadioGroup as AriaRadioGroup, Text, type RadioGroupProps } from "react-aria-components";
import { cn } from "@/lib/utils";

export type Choice = { value: string; label: React.ReactNode; description?: React.ReactNode };

export function RadioGroup({ label, hint, error, choices, cards = false, orientation, className, ...props }: Omit<RadioGroupProps, "children" | "className"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  choices: Choice[];
  cards?: boolean;
  className?: string;
}) {
  return (
    <AriaRadioGroup {...props} orientation={orientation} isInvalid={!!error} className={cn("flex flex-col gap-2", className)}>
      <Label className="font-medium">{label}</Label>
      {hint ? <Text slot="description" className="text-ink-muted">{hint}</Text> : null}
      {error ? <FieldError className="text-fix font-medium">{error}</FieldError> : null}
      <div className={cn(cards ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : orientation === "horizontal" ? "flex flex-wrap gap-x-6 gap-y-1" : "flex flex-col gap-1")}>
        {choices.map((c) => (
          <Radio
            key={c.value}
            value={c.value}
            className={({ isSelected }) =>
              cn(
                "group flex cursor-pointer items-start gap-3 rounded-full data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue",
                // An error is said once, above the choices (and in the summary); the cards keep their usual border (F7).
                cards ? cn("min-h-12 border p-4", isSelected ? "border-blue border-2 p-[15px] bg-white" : "border-field bg-paper data-[hovered]:bg-white") : "min-h-11 py-2",
              )
            }
          >
            {({ isSelected }) => (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 bg-white",
                    isSelected ? "border-blue" : "border-field",
                  )}
                >
                  {isSelected ? <span className="size-2.5 rounded-full bg-blue" /> : null}
                </span>
                <span className="flex flex-col">
                  <span className={cards ? "font-medium" : undefined}>{c.label}</span>
                  {c.description ? <span className="text-ink-muted">{c.description}</span> : null}
                </span>
              </>
            )}
          </Radio>
        ))}
      </div>
    </AriaRadioGroup>
  );
}
