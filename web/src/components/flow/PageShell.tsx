import { BackLink } from "./BackLink";
import { PageHeading } from "./PageHeading";
import { StepLine } from "./StepLine";

/** The top of every task page: back link, step line, the question as h1. Content goes in the question column. */
export function PageShell({ step, back, title, children, wide = false, center = false }: {
  step?: 1 | 2 | 3 | 4;
  back?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  wide?: boolean;
  /** The step line and the h1 centred (the results page only). */
  center?: boolean;
}) {
  return (
    <div className="page-grid pt-6">
      <div className={wide ? "col-span-full min-w-0" : "col-question"}>
        {back ? <BackLink href={back} /> : null}
        <div className={center ? "mt-6 flex flex-col items-center gap-2 text-center" : "mt-6 flex flex-col gap-2"}>
          {step ? <StepLine step={step} /> : null}
          <PageHeading>{title}</PageHeading>
        </div>
      </div>
      <div className={wide ? "col-span-full mt-8 min-w-0" : "col-question mt-8"}>{children}</div>
    </div>
  );
}
