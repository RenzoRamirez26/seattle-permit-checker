"use client";
/** Buttons on React Aria's Button: real <button>s, keyboard and press handling done right. Restyled to DESIGN.md. */
import { Button as AriaButton, type ButtonProps } from "react-aria-components";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const styles: Record<Variant, string> = {
  // The main button: one per page, blue, white text, 48 px tall, left-aligned.
  primary: "min-h-12 px-6 bg-blue text-white border border-blue data-[hovered]:bg-ink data-[hovered]:border-ink data-[pressed]:bg-ink",
  secondary: "min-h-12 px-4 bg-paper text-ink border border-field data-[hovered]:bg-white data-[hovered]:border-ink",
  quiet: "min-h-11 px-2 -mx-2 bg-transparent text-blue underline underline-offset-[3px] decoration-1 data-[hovered]:decoration-2",
  danger: "min-h-12 px-4 bg-paper text-fix border border-fix data-[hovered]:bg-fix-tint",
};

type Props = Omit<ButtonProps, "className" | "children"> & {
  variant?: Variant;
  className?: string;
  pending?: boolean;
  children: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = "secondary", className, pending, children, ...props }, ref) {
  return (
    <AriaButton
      ref={ref}
      {...props}
      isPending={pending}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm text-body font-semibold select-none",
        "transition-[background-color,border-color,text-decoration-thickness] duration-100",
        "disabled:cursor-not-allowed data-[disabled]:opacity-60 data-[pending]:cursor-wait",
        styles[variant],
        className,
      )}
    >
      {pending ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" size={18} /> : null}
      {children}
    </AriaButton>
  );
});
