"use client";
/**
 * A row of tabs on React Aria's Tabs: arrow keys move between tabs and select them, the selected tab is announced,
 * and each panel is labelled by its tab. Only the selected panel is in the page. The selected tab has the active
 * tint (blue on the tab tint), or for a findings group its status tint, with a 3 px bottom border either way.
 */
import { Tab, TabList, TabPanel, Tabs, type Key } from "react-aria-components";
import { cn } from "@/lib/utils";
import { look } from "./status";
import { StatusIcon } from "./StatusIcon";

export type TabItem = { id: string; label: React.ReactNode; status?: string; panel: React.ReactNode };

export function TabRow({ label, items, selected, onSelect, className }: {
  label: string;
  items: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <Tabs selectedKey={selected} onSelectionChange={(k: Key) => onSelect(String(k))} className={cn("flex flex-col", className)}>
      <TabList aria-label={label} className="flex flex-wrap border-b border-hairline">
        {items.map((t) => {
          const l = t.status ? look(t.status) : null;
          return (
            <Tab
              key={t.id}
              id={t.id}
              data-tab={t.id}
              className={({ isSelected }) =>
                cn(
                  "-mb-px flex min-h-12 cursor-pointer items-center gap-2 border-b-[3px] px-4 py-2 font-medium outline-none",
                  "data-[focus-visible]:outline-3 data-[focus-visible]:-outline-offset-3 data-[focus-visible]:outline-blue",
                  isSelected
                    ? "border-blue bg-tint text-blue"
                    : "border-transparent text-ink data-[hovered]:bg-white",
                )
              }
            >
              {l ? <StatusIcon mark={l.mark} /> : null}
              <span className="nums">{t.label}</span>
            </Tab>
          );
        })}
      </TabList>
      {items.map((t) => (
        <TabPanel key={t.id} id={t.id} className="pt-6 outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue">
          {t.panel}
        </TabPanel>
      ))}
    </Tabs>
  );
}
