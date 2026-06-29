import { Card, CardContent } from "@/components/ui/card";
import type { SavedPaper } from "@/lib/paper-store";
import {
  formatPaperCreatedAt,
  PaperCardIcon,
  VIEW_OUTPUTS_ARROW_GROUP_HOVER_CLASSNAME,
  VIEW_OUTPUTS_SOLID_CLASSNAME,
  ViewOutputsButton,
} from "./view-outputsbtn";

export function PaperGridCard({
  paper,
  onViewOutputs,
}: {
  paper: SavedPaper;
  onViewOutputs: () => void;
}) {
  return (
    <Card className="group rounded-cta border border-[#ebe8e3] bg-white dark:bg-carddarkbg dark:border-darkcardborder shadow-none transition-shadow hover:shadow-[0_10px_40px_rgba(27,61,47,0.06)]">
      <CardContent className="flex h-full flex-col px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="mb-2 sm:mb-2">
          <PaperCardIcon />
        </div>
        <h3 className="mb-1 line-clamp-3 font-sans text-[15px] font-bold leading-snug tracking-tight text-ink dark:text-white md:text-[16px]">
          {paper.title}
        </h3>
        <p className="line-clamp-2 font-sans text-[12px] leading-relaxed text-ink-muted dark:text-white/70 md:line-clamp-1">
          <span>
            {paper.authors}
            {paper.year ? ` · ${paper.year}` : ""}
          </span>{" "}
          <span className="whitespace-nowrap text-[10px] text-ink-faint sm:text-[11px]">
            · {formatPaperCreatedAt(paper.createdAt)}
          </span>
        </p>
        <div className="mt-2.5 flex justify-end sm:mt-3">
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
