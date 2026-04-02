import React from "react";
import Analytics from "../lib/analytics";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_REACT_APP_GOOGLE_CLIENT_ID;
const REDIRECT_URI = "https://localhost:8000/oauth2callback";
const SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.email openid";

const YouTubeLogin = () => {
  const handleYoutubeLogin = () => {
    // analytics: user clicked sign-in
    try {
      Analytics.track("YouTube Sign-In Clicked", {
        timestamp: new Date().toISOString(),
        client_id: GOOGLE_CLIENT_ID ? "present" : "missing",
        redirect_uri: REDIRECT_URI,
      });
    } catch (err) {
      console.warn("Analytics failure", err);
    }

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("access_type", "offline"); // needed for refresh_token
    authUrl.searchParams.set("prompt", "consent"); // ensures refresh_token always returned

    // Redirect user to Google
    window.location.href = authUrl.toString();
  };

  return (
    <div className="flex items-center justify-center">
      <button
        onClick={handleYoutubeLogin}
        className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
      >
        Sign into Youtube (Upload Video)
      </button>
    </div>
  );
};

export default YouTubeLogin;
