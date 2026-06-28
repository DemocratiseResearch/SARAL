"use client";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 font-sans text-[13px] text-red-700">
      <span className="font-semibold">Generation failed — </span>
      {message === "sse_connection_lost"
        ? "Connection lost. Please try again."
        : message === "confirm_failed"
          ? "Could not start generation. Please try again."
          : message}{" "}
      Please review your script and try again.
    </div>
  );
}
