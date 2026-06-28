// Google Analytics 4 helper.
// The Measurement ID is loaded by the <Script> tags in app/layout.tsx.
export const GA_MEASUREMENT_ID = "G-YC2ZEPKC6E";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const GA_EVENTS = {
  ONE_CLICK_VIDEO: "One click to Video",
  CUSTOM_REEL_GENERATION: "Custom Reel Generation",
  ONE_CLICK_PODCAST: "One click to Podcast",
  ONE_CLICK_POSTER: "One click to Poster",
  BUSINESS_BRIEF: "Business Brief",
  // Added to cover the remaining artifact tab / empty-state buttons.
  ONE_CLICK_PRESENTATION: "One click to Presentation",
  SOCIAL_POST: "Social Post",
  // Download actions on artifact cards.
  DOWNLOAD_REEL: "Download Reel",
  DOWNLOAD_VIDEO: "Download Video",
  DOWNLOAD_PODCAST: "Download Podcast",
  DOWNLOAD_POSTER: "Download Poster",
  DOWNLOAD_BUSINESS_BRIEF: "Download Business Brief",
  DOWNLOAD_PRESENTATION: "Download Presentation",
  // Edit actions on artifact cards (editable types only).
  EDIT_VIDEO: "Edit Video",
  EDIT_PRESENTATION: "Edit Presentation",
  EDIT_PODCAST: "Edit Podcast",
  EDIT_REEL: "Edit Reel",
  // Share menu: destination opened.
  OPEN_SHARE_YOUTUBE: "Open Share YouTube",
  OPEN_SHARE_LINKEDIN: "Open Share LinkedIn",
  // Share: actually published to destination.
  SHARE_YOUTUBE: "Share to YouTube",
  SHARE_LINKEDIN: "Share to LinkedIn",
  // OAuth sign-in success.
  SIGN_IN_GOOGLE: "Sign in with Google",
  SIGN_IN_GITHUB: "Sign in with GitHub",
  SIGN_IN_MICROSOFT: "Sign in with Microsoft",
  SIGN_IN_ZOHO: "Sign in with Zoho",
} as const;

export type GAEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS];

/** Track a Google Analytics custom event. */
export function trackGAEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  } else {
    console.debug("[GA] Event:", eventName, params);
  }
}
