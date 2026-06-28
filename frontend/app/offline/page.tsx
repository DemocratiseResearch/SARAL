import Link from "next/link";
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-linen dark:bg-carddarkbg">
      {/* Logo mark */}
      <div className="w-16 h-16 rounded-2xl bg-ink dark:text-white/80 flex items-center justify-center shadow-lg">
        <span className="text-linen text-2xl font-bold font-serif select-none">
          S
        </span>
      </div>

      {/* Offline icon */}
      <div className="w-12 h-12 rounded-full bg-linen-dark dark:bg-carddarkbg flex items-center justify-center">
        <WifiOff size={22} className="text-ink-muted dark:text-white/70" />
      </div>

      {/* Message */}
      <div className="max-w-xs">
        <h1 className="text-2xl font-serif font-bold text-ink dark:text-white mb-2 leading-tight">
          You&apos;re offline
        </h1>
        <p className="text-ink-muted dark:text-white/70 text-[15px] leading-relaxed">
          Saral AI requires an internet connection to work. Please check your
          network and try again.
        </p>
      </div>

      {/* Retry */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-ink text-white rounded-[10px] px-6 py-2.5 text-sm font-semibold hover:bg-[#333333] transition-colors duration-150"
      >
        <RefreshCw size={14} />
        Try again
      </Link>
    </main>
  );
}
