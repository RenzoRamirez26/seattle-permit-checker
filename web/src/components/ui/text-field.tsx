"use client";
/** A text field: visible label above, hint under the label, 48 px tall, the error next to the field. Never a placeholder as the label. */
import { FieldError, Input, Label, Text, TextArea, TextField as AriaTextField, type TextFieldProps } from "react-aria-components";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<TextFieldProps, "children" | "className"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  unit?: string;
  multiline?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  mono?: boolean;
};

export const TextField = forwardRef<HTMLInputElement & HTMLTextAreaElement, Props>(function TextField(
  { label, hint, error, unit, multiline, inputMode, autoComplete, placeholder, className, inputClassName, mono, ...props },
  ref,
) {
  const control = cn(
    "block w-full rounded-sm border bg-white px-3 text-body text-ink",
    error ? "border-fix border-2" : "border-field",
    mono && "font-mono nums",
    inputClassName,
  );
  return (
    <AriaTextField {...props} isInvalid={!!error} className={cn("flex flex-col gap-1", className)}>
      <Label className="font-semibold">{label}</Label>
      {hint ? <Text slot="description" className="text-small text-ink-muted">{hint}</Text> : null}
      {error ? (
        <FieldError className="flex items-start gap-2 text-fix font-semibold">{error}</FieldError>
      ) : null}
      <div className="flex items-center gap-2">
        {multiline ? (
          <TextArea ref={ref} rows={3} placeholder={placeholder} className={cn(control, "min-h-24 py-3")} />
        ) : (
          <Input ref={ref} inputMode={inputMode} autoComplete={autoComplete} placeholder={placeholder} className={cn(control, "min-h-12")} />
        )}
        {unit ? <span className="shrink-0 text-ink-muted">{unit}</span> : null}
      </div>
    </AriaTextField>
  );
});
