"use client";
/**
 * One thing on the plan (a door, a room, the kitchen): what was read, where it is on the plan in words,
 * and Change. Change opens a form in place; Save keeps every other fact as it was. An empty value shows
 * "Not sure" and is sent as null.
 * In: the row's fields and values, whether the reading left one of them empty (unsure), and the callbacks.
 * Out: the saved item through onSave. Each reading the API left empty (and the owner has not filled in) says
 * "We couldn't read this from your plan." beside the hollow "?" mark, under that reading only, not the row's title.
 */
import { useEffect, useId, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { RadioGroup } from "@/components/ui/radio-group";
import { StatusIcon } from "@/components/results/StatusIcon";
import { ANSWERS, NOT_SURE, type FieldSpec } from "@/content/facts";
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

/**
 * Whether any value this row shows (its "where" included, its name not) is one the reading left empty, so it
 * shows "Not sure". Also true for a choice the reader marked "unknown". Presentation only: nothing is decided here.
 */
export function leftEmpty(fields: FieldSpec[], item: Item | null | undefined): boolean {
  return fields.some((f) => !f.isName && displayValue(f, item?.[f.key]).unsure);
}

export function FactRow({ rowId, title, fields, item, original, editing, onEdit, onCancel, onSave, onRemove, onProblems,
  level = 3, unsure = false, context, onFocusChange, isRead = () => true }: {
  rowId: string;
  title: string;
  /** The row title's heading level: 3 directly under a group, 4 under a sub-group. */
  level?: 3 | 4;
  /** The reading left one of this row's values empty: shown with the hollow "?" and a line saying so. */
  unsure?: boolean;
  /** Whether a rule reads this value (/api/meta facts_checked). A value no rule reads says "not checked" and never
   *  gets the empty-reading line. */
  isRead?: (f: FieldSpec) => boolean;
  /** A short muted line above the title naming the kind of thing ("Doors"), where the rows are not sub-grouped. */
  context?: string;
  /** Focus moved into the row (true) or out of it (false). */
  onFocusChange?: (inside: boolean) => void;
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
  const Title = level === 4 ? "h4" : "h3";
  /** The API's reading left this value empty and it is still empty: not an added row, not a manual entry, not filled in. */
  const readEmpty = (f: FieldSpec) => isRead(f) && !!original && displayValue(f, original[f.key]).unsure && displayValue(f, item?.[f.key]).unsure;

  useEffect(() => {
    if (wasEditing.current && !editing) changeRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <li id={rowId} className="border-t border-hairline py-4" aria-labelledby={`${rowId}-title`} data-unsure={unsure || undefined}
      onFocus={onFocusChange ? () => onFocusChange(true) : undefined}
      onBlur={onFocusChange ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusChange(false); } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {context ? <p className="m-0 text-ink-muted">{context}</p> : null}
          <Title id={`${rowId}-title`} className="m-0 text-body font-medium break-words">{title}</Title>
          {whereField ? (
            <p className="m-0 text-ink-muted">
              {ANSWERS.where}: {where ? where : <span className="font-medium text-blue">{NOT_SURE}</span>}
            </p>
          ) : null}
          {whereField && !editing && readEmpty(whereField) ? <EmptyLine /> : null}
        </div>
        {!editing ? (
          <Button ref={changeRef} variant="quiet" onPress={onEdit} aria-label={`Change ${title}`}>
            <Pencil aria-hidden size={16} />
            Change
          </Button>
        ) : null}
      </div>

      {changed && !editing ? <p className="m-0 mt-2 font-medium text-blue">{ANSWERS.changed}</p> : null}

      {editing ? (
        <RowForm rowId={rowId} fields={fields} item={item} title={title}
          onCancel={onCancel} onSave={onSave} onRemove={onRemove} onProblems={onProblems} />
      ) : (
        <dl className="m-0 mt-2 flex flex-col">
          {shown.map((f) => {
            const d = displayValue(f, item?.[f.key]);
            return (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-1">
                <dt className="min-w-0 text-ink-muted">{f.label}{isRead(f) ? null : <> · {ANSWERS.notChecked}</>}</dt>
                <dd className={cn("m-0 text-right break-words", d.mono && "font-mono nums", d.unsure && "text-blue font-medium")}>{d.text}</dd>
                {readEmpty(f) ? <dd className="col-span-2 m-0"><EmptyLine /></dd> : null}
              </div>
            );
          })}
        </dl>
      )}
    </li>
  );
}

/** Under one reading the API left empty. */
function EmptyLine() {
  return (
    <p className="m-0 mt-1 flex items-start gap-2" data-testid="empty-line">
      <StatusIcon mark="city" className="mt-0.5" />
      {ANSWERS.emptyLine}
    </p>
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
                <RadioGroup label={f.question ?? f.label} hint={f.hint} error={error} choices={choices} value={field.value}
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
                hint={[f.hint, f.nullable ? ANSWERS.emptyHint : null].filter(Boolean).join(" ") || undefined}
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
        {onRemove ? <Button variant="quiet" className="text-ink" onPress={() => { onProblems([]); onRemove(); }}>Remove {title}</Button> : null}
      </div>
    </form>
  );
}
