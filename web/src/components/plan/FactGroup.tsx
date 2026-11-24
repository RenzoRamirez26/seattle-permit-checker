"use client";
/**
 * The facts read from the plan, grouped as the schema groups them: overall size, rooms, doors, aisles,
 * restrooms, kitchen, fire safety, seats. Each thing is a FactRow. Rooms, doors, aisles and restrooms
 * can be added and removed, so an owner entering everything by hand can describe the whole plan.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Facts } from "@/api/client";
import { Button } from "@/components/ui/button";
import { GROUPS, type GroupSpec } from "@/content/facts";
import { FactRow, type RowProblem } from "./FactRow";
import type { Item } from "./factForm";

type Removed = { groupId: string; index: number; item: Item; title: string };

export const rowIdFor = (groupId: string, index?: number) => (index === undefined ? `fact-${groupId}` : `fact-${groupId}-${index}`);

export function FactsEditor({ facts, original, editing, setEditing, onChange, onProblems }: {
  facts: Facts;
  original: Facts | null;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onChange: (next: Facts) => void;
  onProblems: (p: RowProblem[]) => void;
}) {
  const [fresh, setFresh] = useState<string | null>(null);   // a row added and not yet saved
  const [removed, setRemoved] = useState<Removed | null>(null);

  const titleOf = (g: GroupSpec, item: Item | null, index?: number): string => {
    if (g.kind !== "list") return g.rowTitle;
    const nameField = g.fields.find((f) => f.isName)!;
    const name = item?.[nameField.key];
    return typeof name === "string" && name.trim() ? name : `${g.itemWord[0].toUpperCase()}${g.itemWord.slice(1)} ${(index ?? 0) + 1}`;
  };

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

  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`group-${g.id}`}>
          <h2 id={`group-${g.id}`} className="m-0 mb-2 text-section-heading">{g.title}</h2>
          {g.kind === "list" && !(facts[g.key] as Item[]).length ? (
            <p className="m-0 border-t border-hairline py-4 text-ink-muted">None read from the plan.</p>
          ) : null}
          <ul className="m-0 list-none p-0">
            {rows(g, facts).map(({ item, index }) => {
              const id = rowIdFor(g.id, index);
              const orig = original ? originalOf(g, original, index) : undefined;
              return (
                <FactRow
                  key={id}
                  rowId={id}
                  title={titleOf(g, item, index)}
                  fields={g.fields}
                  item={item}
                  original={fresh === id ? undefined : orig}
                  editing={editing === id}
                  onEdit={() => edit(id)}
                  onProblems={onProblems}
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
            })}
          </ul>
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
      ))}
    </div>
  );
}

function rows(g: GroupSpec, facts: Facts): { item: Item | null; index?: number }[] {
  if (g.kind === "list") return (facts[g.key] as Item[]).map((item, index) => ({ item, index }));
  if (g.kind === "object") return [{ item: (facts[g.key] as Item | null) ?? null }];
  return [{ item: facts as unknown as Item }];
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
