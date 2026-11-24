"use client";
/**
 * The facts read from the plan, in two groups (docs/decisions.md, "Check these first uses the readings the API
 * left empty"):
 *   - "Check these first": every row where the reading left a shown value empty ("Not sure"), with the reader's own
 *     list of what it could not read (facts.uncertainties). Left out when there is nothing to put in it.
 *   - "Also used in the check": every other row, sub-grouped as the schema groups them (overall size, rooms, doors,
 *     aisles, restrooms, kitchen, fire safety, seats), with the add buttons.
 * In: the facts, the reading as the API returned it (null for manual entry), which row is open. Out: the changed
 * facts through onChange, the form problems through onProblems, the row being changed or focused through onSelect.
 * Which group a row is in follows the API's reading, not the owner's edits, so rows never jump while being changed.
 * Nothing is decided here: an empty value is only shown, and sent as null.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Facts } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ANSWERS, GROUPS, type GroupSpec } from "@/content/facts";
import { FactRow, leftEmpty, type RowProblem } from "./FactRow";
import type { Item } from "./factForm";

type Removed = { groupId: string; index: number; item: Item; title: string };
type Row = { g: GroupSpec; item: Item | null; index?: number; id: string; title: string; orig: Item | null | undefined; unsure: boolean };

/** The row being changed or focused, for the caption over the plan. `where` is null when the plan reading gave none. */
export type SelectedRow = { id: string; title: string; where: string | null };

export const rowIdFor = (groupId: string, index?: number) => (index === undefined ? `fact-${groupId}` : `fact-${groupId}-${index}`);

export function FactsEditor({ facts, original, editing, setEditing, onChange, onProblems, onSelect }: {
  facts: Facts;
  original: Facts | null;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onChange: (next: Facts) => void;
  onProblems: (p: RowProblem[]) => void;
  onSelect?: (row: SelectedRow | null) => void;
}) {
  const [fresh, setFresh] = useState<string | null>(null);   // a row added and not yet saved
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const titleOf = (g: GroupSpec, item: Item | null, index?: number): string => {
    if (g.kind !== "list") return g.rowTitle;
    const nameField = g.fields.find((f) => f.isName)!;
    const name = item?.[nameField.key];
    return typeof name === "string" && name.trim() ? name : `${g.itemWord[0].toUpperCase()}${g.itemWord.slice(1)} ${(index ?? 0) + 1}`;
  };

  const all: Row[] = GROUPS.flatMap((g) => rows(g, facts).map(({ item, index }) => {
    const id = rowIdFor(g.id, index);
    const orig = original ? originalOf(g, original, index) : undefined;
    const fromReading = !!original && fresh !== id && readHere(g, original, index);
    return { g, item, index, id, title: titleOf(g, item, index), orig, unsure: fromReading && leftEmpty(g.fields, orig) };
  }));
  const first = all.filter((r) => r.unsure);
  const rest = all.filter((r) => !r.unsure);
  const notes = original ? facts.uncertainties : [];
  const showFirst = first.length > 0 || notes.length > 0;

  // The caption over the plan names the row being changed, or else the one with focus.
  const selected = all.find((r) => r.id === (editing ?? focused)) ?? null;
  const whereKey = selected?.g.fields.find((f) => f.isWhere)?.key;
  const where = whereKey ? (selected?.item?.[whereKey] as string | null | undefined) ?? null : null;
  useEffect(() => {
    onSelect?.(selected ? { id: selected.id, title: selected.title, where } : null);
  }, [onSelect, selected?.id, selected?.title, where]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (id: string) => {
    if (fresh && fresh !== id) dropFresh();
    setRemoved(null);
    onProblems([]);
    setEditing(id);
  };

  const dropFresh = () => {
    const g = GROUPS.find((x) => fresh?.startsWith(rowIdFor(x.id) + "-"));
    if (g && g.kind === "list") onChange({ ...facts, [g.key]: (facts[g.key] as Item[]).slice(0, -1) } as Facts);
    setFresh(null);
  };

  const row = (r: Row, level: 3 | 4, context?: string) => {
    const { g, item, index, id } = r;
    return (
      <FactRow
        key={id}
        rowId={id}
        title={r.title}
        level={level}
        context={context}
        unsure={r.unsure}
        fields={g.fields}
        item={item}
        original={fresh === id ? undefined : r.orig}
        editing={editing === id}
        onEdit={() => edit(id)}
        onProblems={onProblems}
        onFocusChange={(inside) => setFocused((f) => (inside ? id : f === id ? null : f))}
        onCancel={() => {
          if (fresh === id) dropFresh();
          setEditing(null);
        }}
        onSave={(next) => {
          onChange(put(g, facts, next, index));
          setFresh(null);
          setEditing(null);
        }}
        onRemove={g.kind === "list" && index !== undefined ? () => {
          const list = [...(facts[g.key] as Item[])];
          const [gone] = list.splice(index, 1);
          if (fresh !== id) setRemoved({ groupId: g.id, index, item: gone, title: titleOf(g, gone, index) });
          setFresh(null);
          onChange({ ...facts, [g.key]: list } as Facts);
          setEditing(null);
        } : undefined}
      />
    );
  };

  return (
    <div className="flex flex-col gap-12">
      {showFirst ? (
        <section aria-labelledby="group-check-first">
          <h2 id="group-check-first" className="m-0 mb-4 text-section-heading">{ANSWERS.checkFirst}</h2>
          {notes.length ? (
            <div className="mb-4 rounded-2xl bg-tint p-4">
              <h3 className="m-0 text-body font-medium">{ANSWERS.notes}</h3>
              <ul className="m-0 mt-2 list-disc pl-5">
                {notes.map((u) => <li key={u}>{u}</li>)}
              </ul>
            </div>
          ) : null}
          {first.length ? (
            <ul className="m-0 list-none p-0">
              {first.map((r) => row(r, 3, r.g.kind === "list" ? r.g.title : undefined))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="group-also-used">
        <h2 id="group-also-used" className="m-0 mb-4 text-section-heading">{showFirst ? ANSWERS.alsoUsed : original ? ANSWERS.usedAll : ANSWERS.used}</h2>
        <div className="flex flex-col gap-8">
          {GROUPS.map((g) => {
            const mine = rest.filter((r) => r.g.id === g.id);
            const count = g.kind === "list" ? (facts[g.key] as Item[]).length : 1;
            if (g.kind !== "list" && !mine.length) return null;      // its one row is under "Check these first"
            return (
              <section key={g.id} aria-labelledby={`group-${g.id}`}>
                <h3 id={`group-${g.id}`} className="m-0 mb-2 text-body font-medium text-ink-muted">{g.title}</h3>
                {g.kind === "list" && !count ? (
                  <p className="m-0 border-t border-hairline py-4 text-ink-muted">{original ? ANSWERS.noneRead : ANSWERS.noneEntered}</p>
                ) : g.kind === "list" && !mine.length ? (
                  <p className="m-0 border-t border-hairline py-4 text-ink-muted">{ANSWERS.allAbove}</p>
                ) : null}
                {mine.length ? <ul className="m-0 list-none p-0">{mine.map((r) => row(r, 4))}</ul> : null}
                {removed?.groupId === g.id && g.kind === "list" ? (
                  <p role="status" className="m-0 flex flex-wrap items-center gap-x-4 border-t border-hairline py-2">
                    Removed {removed.title}.
                    <Button variant="quiet" onPress={() => {
                      const list = [...(facts[g.key] as Item[])];
                      list.splice(removed.index, 0, removed.item);
                      onChange({ ...facts, [g.key]: list } as Facts);
                      setRemoved(null);
                    }}>Undo</Button>
                  </p>
                ) : null}
                {g.kind === "list" ? (
                  <Button variant="quiet" className="mt-2" onPress={() => {
                    if (fresh) dropFresh();
                    const list = [...(facts[g.key] as Item[]), g.blank()];
                    onChange({ ...facts, [g.key]: list } as Facts);
                    const id = rowIdFor(g.id, list.length - 1);
                    setFresh(id);
                    setRemoved(null);
                    setEditing(id);
                  }}>
                    <Plus aria-hidden size={16} /> {g.addLabel}
                  </Button>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function rows(g: GroupSpec, facts: Facts): { item: Item | null; index?: number }[] {
  if (g.kind === "list") return (facts[g.key] as Item[]).map((item, index) => ({ item, index }));
  if (g.kind === "object") return [{ item: (facts[g.key] as Item | null) ?? null }];
  return [{ item: facts as unknown as Item }];
}

/** Whether the API's reading has this row at all: a room or door added by the owner was never read. */
function readHere(g: GroupSpec, original: Facts, index?: number): boolean {
  return g.kind !== "list" || (index ?? Infinity) < (original[g.key] as Item[]).length;
}

function originalOf(g: GroupSpec, original: Facts, index?: number): Item | null {
  if (g.kind === "list") return ((original[g.key] as Item[])[index ?? -1] as Item | undefined) ?? null;
  if (g.kind === "object") return (original[g.key] as Item | null) ?? null;
  return original as unknown as Item;
}

function put(g: GroupSpec, facts: Facts, next: Item, index?: number): Facts {
  if (g.kind === "list") {
    const list = [...(facts[g.key] as Item[])];
    list[index!] = next;
    return { ...facts, [g.key]: list } as Facts;
  }
  if (g.kind === "object") return { ...facts, [g.key]: next } as Facts;
  return { ...facts, ...next } as Facts;
}
