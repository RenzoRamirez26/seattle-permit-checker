"use client";
/** The page's h1, which is its question. Focus moves to it when a new page arrives by navigation (not on first load). */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

let firstPage = true;

export function PageHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (firstPage) {
      firstPage = false;
      return;
    }
    ref.current?.focus({ preventScroll: false });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={cn("text-page-heading m-0 outline-none", className)}>
      {children}
    </h1>
  );
}
