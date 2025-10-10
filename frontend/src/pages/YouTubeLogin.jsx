import React from "react";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const REDIRECT_URI = "https://saral.democratiseresearch.in/oauth2callback";
// const REDIRECT_URI = "http://localhost:3000/oauth2callback";
// console.log("REDIRECT_URI", REDIRECT_URI)
// console.log("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID)

const SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.email openid";

const YouTubeLogin = () => {
  const handleYoutubeLogin = () => {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("access_type", "offline"); // 👈 needed for refresh_token
    authUrl.searchParams.set("prompt", "consent"); // 👈 ensures refresh_token always returned

    // Redirect user to Google
    console.log("redirecting user to callback")
    window.location.href = authUrl.toString();
  };
  console.log("in YouTubeLogin")
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
