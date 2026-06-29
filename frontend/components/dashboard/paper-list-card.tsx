import { Card, CardContent } from "@/components/ui/card";
import type { SavedPaper } from "@/lib/paper-store";
import {
  formatPaperCreatedAt,
  PaperCardIcon,
  VIEW_OUTPUTS_ARROW_GROUP_HOVER_CLASSNAME,
  VIEW_OUTPUTS_SOLID_CLASSNAME,
  ViewOutputsButton,
} from "./view-outputsbtn";

export function PaperListCard({
  paper,
  onViewOutputs,
}: {
  paper: SavedPaper;
  onViewOutputs: () => void;
}) {
  return (
    <Card className="group rounded-cta border border-[#ebe8e3] bg-white dark:bg-carddarkbg dark:border-darkcardborder shadow-none transition-shadow hover:shadow-[0_8px_28px_rgba(27,61,47,0.055)]">
      <CardContent className="flex items-center gap-4 px-4 py-3.5 sm:px-5 md:gap-5">
        <PaperCardIcon className="self-center" />
        <div className="min-w-0 flex-1 self-center">
          <h3 className="line-clamp-2 font-sans text-[14px] font-bold leading-snug text-ink dark:text-white md:line-clamp-1 md:text-[15px]">
            {paper.title}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-sans text-[11px] leading-snug text-ink-muted dark:text-white/70 md:gap-x-2 md:text-[12px]">
            <span className="min-w-0">
              {paper.authors}
              {paper.year ? ` · ${paper.year}` : ""}
            </span>
            <span className="whitespace-nowrap text-[10px] text-ink-faint md:text-[11px]">
              · {formatPaperCreatedAt(paper.createdAt)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <ViewOutputsButton
            onClick={onViewOutputs}
            className={VIEW_OUTPUTS_SOLID_CLASSNAME}
            arrowClassName={VIEW_OUTPUTS_ARROW_GROUP_HOVER_CLASSNAME}
          />
        </div>
      </CardContent>
    </Card>
  );
}
