"use client";
/**
 * One thing on the plan (a door, a room, the kitchen): what was read, where it is on the plan in words,
 * and Change. Change opens a form in place; Save keeps every other fact as it was. An empty value shows
 * "Not sure" and is sent as null.
 */
import { useEffect, useId, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { RadioGroup } from "@/components/ui/radio-group";
import { NOT_SURE, type FieldSpec } from "@/content/facts";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formSchema, fromFormValues, sameValue, toFormValues, type FormValues, type Item } from "./factForm";

export type RowProblem = { id: string; text: string };

export function displayValue(f: FieldSpec, v: unknown): { text: string; unsure: boolean; mono: boolean } {
  if (v === null || v === undefined || v === "") {
    return { text: NOT_SURE, unsure: true, mono: false };
  }
  switch (f.kind) {
    case "number":
    case "integer":
      return { text: `${formatNumber(Number(v))}${f.unit ? ` ${f.unit}` : ""}`, unsure: false, mono: true };
    case "yesno":
      return { text: v ? "Yes" : "No", unsure: false, mono: false };
    case "choice":
      return { text: f.choices?.find((c) => c.value === v)?.label ?? String(v), unsure: v === "unknown", mono: false };
    case "lines":
      return Array.isArray(v) && v.length ? { text: v.join(", "), unsure: false, mono: false } : { text: "None listed", unsure: false, mono: false };
    default:
      return { text: String(v), unsure: false, mono: false };
  }
}

export function FactRow({ rowId, title, fields, item, original, editing, onEdit, onCancel, onSave, onRemove, onProblems }: {
  rowId: string;
  title: string;
  fields: FieldSpec[];
  item: Item | null;
  original: Item | null | undefined;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (next: Item) => void;
  onRemove?: () => void;
  onProblems: (problems: RowProblem[]) => void;
}) {
  const changeRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  const whereField = fields.find((f) => f.isWhere);
  const shown = fields.filter((f) => !f.isName && !f.isWhere);
  const changed = original !== undefined && !sameValue(pick(item, fields), pick(original, fields));
  const where = whereField ? (item?.[whereField.key] as string | null) : null;

  useEffect(() => {
    if (wasEditing.current && !editing) changeRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <li id={rowId} className="border-t border-hairline py-4" aria-labelledby={`${rowId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id={`${rowId}-title`} className="m-0 text-body font-medium break-words">{title}</h3>
          {whereField ? (
            <p className="m-0 text-ink-muted">
              {where ? <>Where: {where}</> : <>Where on the plan: {NOT_SURE.toLowerCase()}</>}
            </p>
          ) : null}
        </div>
        {!editing ? (
          <Button ref={changeRef} variant="quiet" onPress={onEdit} aria-label={`Change ${title}`}>
            <Pencil aria-hidden size={16} />
            Change
          </Button>
        ) : null}
      </div>

      {changed && !editing ? (
        <p className="m-0 mt-2 font-medium text-blue">Changed by you. The check will use these values, not the ones read from the plan.</p>
      ) : null}

      {editing ? (
        <RowForm rowId={rowId} fields={fields} item={item} title={title}
          onCancel={onCancel} onSave={onSave} onRemove={onRemove} onProblems={onProblems} />
      ) : (
        <dl className="m-0 mt-2 flex flex-col">
          {shown.map((f) => {
            const d = displayValue(f, item?.[f.key]);
            return (
              <div key={f.key} className="flex items-baseline justify-between gap-4 py-1">
                <dt className="min-w-0 text-ink-muted">{f.label}</dt>
                <dd className={cn("m-0 text-right break-words", d.mono && "font-mono nums", d.unsure && "text-blue font-medium")}>{d.text}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </li>
  );
}

function pick(item: Item | null | undefined, fields: FieldSpec[]) {
  return item ? Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? null])) : null;
}

function RowForm({ rowId, fields, item, title, onCancel, onSave, onRemove, onProblems }: {
  rowId: string;
  fields: FieldSpec[];
  item: Item | null;
  title: string;
  onCancel: () => void;
  onSave: (next: Item) => void;
  onRemove?: () => void;
  onProblems: (problems: RowProblem[]) => void;
}) {
  const formId = useId();
  const { control, handleSubmit, setFocus, formState } = useForm<FormValues, unknown, Record<string, unknown>>({
    defaultValues: toFormValues(item, fields),
    resolver: zodResolver(formSchema(fields)) as never,
    shouldFocusError: false,
  });
  const fieldId = (key: string) => `${rowId}-${key}`;

  useEffect(() => {
    const first = fields.find((f) => f.kind !== "yesno" && f.kind !== "choice");
    if (first) setFocus(first.key);
    else document.getElementById(fieldId(fields[0].key))?.querySelector<HTMLElement>("input")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const errors = Object.entries(formState.errors);
    onProblems(errors.map(([key, e]) => ({ id: fieldId(key), text: `${title}: ${String(e?.message ?? "")}` })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.errors, formState.submitCount]);

  const submit = handleSubmit(
    (values) => {
      onProblems([]);
      onSave(fromFormValues(values, fields, item));
    },
    (errors) => {
      const first = fields.find((f) => errors[f.key]);
      if (first) {
        const el = document.getElementById(fieldId(first.key));
        (el?.querySelector<HTMLElement>("input, textarea") ?? el)?.focus();
      }
    },
  );

  return (
    <form id={formId} noValidate className="mt-4 flex flex-col gap-6 rounded-2xl border border-hairline bg-white p-4"
      aria-label={`Change ${title}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {fields.map((f) => (
        <Controller key={f.key} name={f.key} control={control} render={({ field, fieldState }) => {
          const error = fieldState.error?.message;
          if (f.kind === "yesno" || f.kind === "choice") {
            const choices = f.kind === "yesno"
              ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, ...(f.nullable ? [{ value: "unsure", label: NOT_SURE }] : [])]
              : f.choices ?? [];
            return (
              <div id={fieldId(f.key)}>
                <RadioGroup label={f.label} hint={f.hint} error={error} choices={choices} value={field.value}
                  onChange={field.onChange} orientation={f.kind === "yesno" ? "horizontal" : "vertical"} name={`${rowId}-${f.key}`} />
              </div>
            );
          }
          const numeric = f.kind === "number" || f.kind === "integer";
          return (
            <div id={fieldId(f.key)}>
              <TextField
                ref={field.ref}
                label={f.label}
                hint={[f.hint, f.nullable ? "Leave empty if you are not sure." : null].filter(Boolean).join(" ") || undefined}
                error={error}
                unit={f.unit}
                multiline={f.kind === "lines"}
                inputMode={f.kind === "integer" ? "numeric" : numeric ? "decimal" : undefined}
                autoComplete="off"
                name={`${rowId}-${f.key}`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                mono={numeric}
                inputClassName={numeric ? "max-w-40" : undefined}
              />
            </div>
          );
        }} />
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" className="border-blue text-blue">Save changes</Button>
        <Button variant="quiet" onPress={() => { onProblems([]); onCancel(); }}>Cancel</Button>
        {onRemove ? <Button variant="quiet" className="text-fix" onPress={() => { onProblems([]); onRemove(); }}>Remove {title}</Button> : null}
      </div>
    </form>
  );
}
