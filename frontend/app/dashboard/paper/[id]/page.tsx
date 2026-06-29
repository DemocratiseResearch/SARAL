"use client";

import TopNav from "@/components/dashboard/top-nav";
import PaperDetailContent from "@/components/dashboard/paper-detail-content";

export default function PaperDetailPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <PaperDetailContent />
    </div>
  );
}
