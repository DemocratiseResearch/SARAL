import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import apiService from "../services/api";
import { extractPaperId } from "../utils/arxiv";

const ManimAnimation = () => {
	const navigate = useNavigate();
	const [paperId, setPaperId] = useState("");
	const [generating, setGenerating] = useState(false);

	// Configuration
	const [audioFile, setAudioFile] = useState(null);
	const [ttsProvider, setTtsProvider] = useState("kokoro");
	const [ttsGender, setTtsGender] = useState("female");
	const [ttsLanguage, setTtsLanguage] = useState("hindi"); // Default to Hindi for Bhashini/Sarvam

	// Generated video
	const [videoUrl, setVideoUrl] = useState(null);
	const [manimCode, setManimCode] = useState(null);
	const [narration, setNarration] = useState(null);

	// Get paper ID from localStorage on mount
	useEffect(() => {
		const storedPaperId = localStorage.getItem("current_paper_id");
		if (storedPaperId) {
			setPaperId(storedPaperId);
		}
	}, []);

	// Generate Manim animation
	const handleGenerate = async () => {
		if (!paperId) {
			toast.error("Please enter a paper ID");
			return;
		}

		// Extract paper ID from URL if needed
		const actualPaperId = extractPaperId(paperId);
		if (!actualPaperId) {
			toast.error("Invalid paper ID or URL");
			return;
		}

		setGenerating(true);
		setVideoUrl(null);
		setManimCode(null);
		setNarration(null);

		const toastId = toast.loading(
			"Generating Manim animation... This may take several minutes"
		);

		try {
			const response = await apiService.generateManimAnimation(actualPaperId, {
				audioFile: audioFile,
				ttsProvider: ttsProvider,
				ttsGender: ttsGender,
				ttsLanguage: ttsLanguage,
			});

			if (response.data) {
				// Load the generated data
				try {
					// Try to load manim code
					const codeResponse = await apiService.getManimCode(actualPaperId);
					if (codeResponse.data) {
						setManimCode(codeResponse.data.manim_code);
					}

					// Try to load narration
					const narrationResponse = await apiService.getManimNarration(actualPaperId);
					if (narrationResponse.data) {
						setNarration(narrationResponse.data.narration);
					}

					// Get video stream URL
					const streamUrl = apiService.getManimVideoStreamUrl(actualPaperId);
					setVideoUrl(streamUrl);
				} catch (loadError) {
					console.error("Error loading generated data:", loadError);
				}

				toast.success("Manim animation generated successfully!", {
					id: toastId,
				});
			} else {
				toast.error("Animation generation failed", {
					id: toastId,
				});
			}
		} catch (error) {
			console.error("Generation error:", error);
			toast.error(
				error.response?.data?.detail ||
				error.response?.data?.message ||
				"Failed to generate animation",
				{ id: toastId }
			);
		} finally {
			setGenerating(false);
		}
	};

	// Download video
	const handleDownload = async () => {
		const actualPaperId = extractPaperId(paperId);

		try {
			const response = await apiService.downloadManimVideo(actualPaperId);

			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement("a");
			link.href = url;
			link.setAttribute("download", `${actualPaperId}_manim_animation.mp4`);
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(url);

			toast.success("Video downloaded successfully!");
		} catch (error) {
			console.error("Download error:", error);
			toast.error("Failed to download video");
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold text-gray-900 mb-4">
						Manim Animation Generator
					</h1>
					<p className="text-lg text-gray-600">
						Create mathematical animations with Manim Community v0.19.0
					</p>
				</div>

				{/* Configuration Panel */}
				<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
					<h2 className="text-2xl font-semibold mb-6 text-gray-900">Configuration</h2>

					{/* Paper ID Input */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Paper ID or arXiv URL
						</label>
						<input
							type="text"
							value={paperId}
							onChange={(e) => setPaperId(e.target.value)}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
							placeholder="1706.03762 or https://arxiv.org/abs/1706.03762"
						/>
					</div>

					{/* Audio File Input */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Audio File (Optional)
						</label>
						<input
							type="file"
							accept="audio/*"
							onChange={(e) => setAudioFile(e.target.files[0])}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						/>
						<p className="mt-2 text-sm text-gray-500">
							Upload custom audio or leave empty to use TTS-generated narration
						</p>
					</div>

					{/* TTS Provider Selection */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Text-to-Speech Provider
						</label>
						<select
							value={ttsProvider}
							onChange={(e) => setTtsProvider(e.target.value)}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						>
							<option value="kokoro">Kokoro (Free, with subtitles)</option>
							<option value="bhashini">Bhashini (Government API, Multi-language)</option>
							<option value="sarvam">Sarvam (Commercial, 10 Indian Languages)</option>
						</select>
						<p className="mt-2 text-sm text-gray-500">
							{ttsProvider === "kokoro" && "✓ Free, word-level subtitles, multiple voices"}
							{ttsProvider === "bhashini" && "⚠ Supports English, Hindi, Gujarati, Marathi, Telugu"}
							{ttsProvider === "sarvam" && "⚠ Supports Hindi, Bengali, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati"}
						</p>
					</div>

					{/* Language Selection (for Bhashini and Sarvam) */}
					{ttsProvider === "bhashini" && (
						<div className="mb-6">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Language
							</label>
							<select
								value={ttsLanguage}
								onChange={(e) => setTtsLanguage(e.target.value)}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
							>
								<option value="english">English</option>
								<option value="hindi">Hindi (हिंदी)</option>
								<option value="gujarati">Gujarati (ગુજરાતી)</option>
								<option value="marathi">Marathi (मराठी)</option>
								<option value="telugu">Telugu (తెలుగు)</option>
							</select>
						</div>
					)}

					{ttsProvider === "sarvam" && (
						<div className="mb-6">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Language
							</label>
							<select
								value={ttsLanguage}
								onChange={(e) => setTtsLanguage(e.target.value)}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
							>
								<option value="hindi">Hindi (हिंदी)</option>
								<option value="bengali">Bengali (বাংলা)</option>
								<option value="kannada">Kannada (ಕನ್ನಡ)</option>
								<option value="malayalam">Malayalam (മലയാളം)</option>
								<option value="marathi">Marathi (मराठी)</option>
								<option value="odia">Odia (ଓଡ଼ିଆ)</option>
								<option value="punjabi">Punjabi (ਪੰਜਾਬੀ)</option>
								<option value="tamil">Tamil (தமிழ்)</option>
								<option value="telugu">Telugu (తెలుగు)</option>
								<option value="gujarati">Gujarati (ગુજરાતી)</option>
							</select>
						</div>
					)}

					{/* Gender Selection (for Bhashini) */}
					{ttsProvider === "bhashini" && (
						<div className="mb-6">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Voice Gender
							</label>
							<div className="flex gap-4">
								<label className="flex items-center">
									<input
										type="radio"
										value="female"
										checked={ttsGender === "female"}
										onChange={(e) => setTtsGender(e.target.value)}
										className="mr-2"
									/>
									Female
								</label>
								<label className="flex items-center">
									<input
										type="radio"
										value="male"
										checked={ttsGender === "male"}
										onChange={(e) => setTtsGender(e.target.value)}
										className="mr-2"
									/>
									Male
								</label>
							</div>
						</div>
					)}

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-4">
						<button
							onClick={handleGenerate}
							disabled={!paperId || generating}
							className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{generating ? "Generating Animation..." : "Generate Animation"}
						</button>
					</div>
				</div>

				{/* Video Result Panel - MOVED TO TOP */}
				{videoUrl && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-6">Generated Animation</h2>

						{/* Video Player */}
						<div className="mb-6">
							<video
								controls
								className="w-full rounded-lg shadow-md"
								src={videoUrl}
								type="video/mp4"
							>
								Your browser does not support the video tag.
							</video>
						</div>

						{/* Action Buttons */}
						<div className="flex flex-wrap gap-4">
							<button
								onClick={handleDownload}
								className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
							>
								📥 Download Video
							</button>

							<button
								onClick={() => navigate("/videos")}
								className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
							>
								📁 View All Videos
							</button>
						</div>
					</div>
				)}

				{/* Code Preview Panel */}
				{manimCode && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">Manim Code</h2>
						<div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
							<pre className="text-sm text-green-400 font-mono">
								<code>{manimCode}</code>
							</pre>
						</div>
					</div>
				)}

				{/* Narration Panel */}
				{narration && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">Narration</h2>
						<div className="bg-gray-50 rounded-lg p-4">
							<p className="text-gray-700 whitespace-pre-wrap">{narration}</p>
						</div>
					</div>
				)}

				{/* Info Panel */}
				<div className="mt-8 bg-indigo-50 rounded-lg p-6">
					<h3 className="text-lg font-semibold mb-3 text-indigo-900">
						ℹ️ About Manim Animations
					</h3>
					<ul className="space-y-2 text-sm text-indigo-800">
						<li>
							<strong>Manim Community v0.19.0:</strong> Professional mathematical animation library
						</li>
						<li>
							<strong>AI-Generated:</strong> Code and narration created by Gemini AI
						</li>
						<li>
							<strong>60-Second Videos:</strong> Perfect length for educational content
						</li>
						<li>
							<strong>Custom Audio:</strong> Upload your own or use TTS narration
						</li>
					</ul>

					<div className="mt-4 pt-4 border-t border-indigo-200">
						<p className="text-sm text-indigo-700">
							<strong>Features:</strong> Mathematical visualizations, smooth transitions,
							vector graphics, professional animations, synchronized narration,
							Multiple TTS providers (Kokoro with subtitles, Bhashini, Sarvam)
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ManimAnimation;
