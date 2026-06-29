import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://saral.democratiseresearch.in"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/offline",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
