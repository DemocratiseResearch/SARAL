import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiService }   from '../services/api';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      console.log("entered callback module");

      if (code) {
        console.log("Google returned code:", code);

        const paper_id = sessionStorage.getItem("paperId");
        console.log("Retrieved paper_id:", paper_id);

        try {
          // ✅ Replace fetch with apiService
          const response = await apiService.googleUpload({ code, paper_id });
          console.log("Backend response:", response);

          if (response.data.success) {
            alert("Upload successful! 🎉");
            console.log("Video URL:", response.data.video_url, paper_id);

            navigate("/video-preview", {
              state: { video_url: response.data.video_url, paper_id },
            });
          } else {
            alert("Upload failed: " + (response.data.error || "Unknown error"));
          }
        } catch (err) {
          console.error("Error calling backend:", err);
          alert("Google login/upload failed.");
        }
      }
    };

    handleCallback();
  }, [navigate]);

  return <div>Uploading video to YouTube...</div>;
};

export default OAuthCallback;

