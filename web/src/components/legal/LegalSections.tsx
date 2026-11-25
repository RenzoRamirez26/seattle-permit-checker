/** The sections of the Privacy and Terms pages: a heading, plain paragraphs, an optional list and links. Words come
 * from src/content/legal.ts and are rendered as text. */
import type { LegalSection } from "@/content/legal";

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="flex flex-col gap-2">
          <h2 id={`${s.id}-h`} className="m-0 text-section-heading">{s.heading}</h2>
          {s.paragraphs.map((p) => <p key={p} className="m-0 measure">{p}</p>)}
          {s.list ? (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-6 measure">
              {s.list.map((li) => <li key={li}>{li}</li>)}
            </ul>
          ) : null}
          {s.links ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {s.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} rel="noopener noreferrer" className="inline-flex min-h-11 items-center">{l.text}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}
