import { Puzzle } from "lucide-react";

export default function ExtensionBanner() {
  return (
    <div className="w-full bg-saral-forest px-4 py-2.5 text-center text-[13px] text-white">
      <span className="inline-flex items-center justify-center gap-2 flex-wrap">
        <Puzzle size={14} className="shrink-0 opacity-80" />
        <span>
          Saral AI&rsquo;s browser extension is{" "}
          <span className="font-semibold">coming soon</span>.
        </span>
      </span>
    </div>
  );
}
