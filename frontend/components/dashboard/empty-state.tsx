export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-100 max-sm:min-h-62.5">
      <p className="font-sans text-[20px] max-sm:text-[16px] font-semibold text-ink dark:text-white">
        No Content Generated
      </p>
      <p className="font-sans text-[16px] max-sm:text-[13px] font-normal text-ink-muted dark:text-white/70 mt-2">
        Generate one from the sidebar!
      </p>
    </div>
  );
}
