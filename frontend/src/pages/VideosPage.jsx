// VideosPage.jsx
import React from 'react';
import GeneratedVideoDisplay from '../components/workflow/GeneratedVideoDisplay';

const VideosPage = () => {
  const generatedVideos = [
    {
      id: 1,
      title: "",
      videoId: "YgOdVFsd3Q4",
      language: "English"
    },
    {
      id: 2,
      title: "",
      videoId: "WcVjDXGvkaE",
      language: "Hindi"
    },
    {
      id: 3,
      title: "",
      videoId: "5bN8M6jvt7E",
      language: "Bengali"
    },
    {
      id: 4,
      title: "",
      videoId: "zJ7zZBwPmZI",
      language: "Gujarati"
    },
    {
      id: 5,
      title: "",
      videoId: "LM6C_NDJD9o",
      language: "Kannada"
    },
    {
      id: 6,
      title: "",
      videoId: "SSj4u_7HjD4",
      language: "Malayalam"
    },
    {
      id: 7,
      title: "",
      videoId: "pQUgRnuaaGY",
      language: "Marathi"
    },
    {
      id: 8,
      title: "",
      videoId: "dMBI_IjbLNg",
      language: "Odia"
    },
    {
      id: 9,
      title: "",
      videoId: "CPSs9bposAA",
      language: "Punjabi"
    },
    {
      id: 10,
      title: "",
      videoId: "5GrLiae4D9M",
      language: "Tamil"
    },
    {
      id: 11,
      title: "",
      videoId: "TiAZE5YCwIU",
      language: "Telugu"
    },
  ];

  return (
    <GeneratedVideoDisplay
      videos={generatedVideos}
      backLink="/dashboard"
      backText="Back to Dashboard"
    />
  );
};

export default VideosPage;
