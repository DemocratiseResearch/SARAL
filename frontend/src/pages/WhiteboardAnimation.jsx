import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import apiService from "../services/api";
import { extractPaperId } from "../utils/arxiv";

const WhiteboardAnimation = () => {
	const navigate = useNavigate();
	const [paperId, setPaperId] = useState("");
	const [loading, setLoading] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [generating, setGenerating] = useState(false);

	// Preview data
	const [preview, setPreview] = useState(null);

	// Configuration
	const [imageModel, setImageModel] = useState("pollinations");
	const [targetDuration, setTargetDuration] = useState(null);
	const [scenesCount, setScenesCount] = useState(null);
	const [ttsProvider, setTtsProvider] = useState("kokoro");
	const [ttsGender, setTtsGender] = useState("female");
	const [ttsLanguage, setTtsLanguage] = useState("hindi"); // Default to Hindi for Bhashini/Sarvam

	// Generated video
	const [videoUrl, setVideoUrl] = useState(null);
	const [generationResult, setGenerationResult] = useState(null);

	// Get paper ID from localStorage on mount
	useEffect(() => {
		const storedPaperId = localStorage.getItem("current_paper_id");
		if (storedPaperId) {
			setPaperId(storedPaperId);
		}
	}, []);

	// Preview script
	const handlePreview = async () => {
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

		setPreviewing(true);
		setPreview(null);

		try {
			const response = await apiService.previewWhiteboardScript(
				actualPaperId,
				targetDuration,
				ttsProvider,
				ttsGender,
				ttsLanguage
			);

			if (response.data.success) {
				setPreview(response.data);
				toast.success("Script preview loaded successfully!");
			} else {
				toast.error(response.data.message || "Failed to load preview");
			}
		} catch (error) {
			console.error("Preview error:", error);
			toast.error(
				error.response?.data?.detail ||
				error.response?.data?.message ||
				"Failed to preview script"
			);
		} finally {
			setPreviewing(false);
		}
	};

	// Generate whiteboard video
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
		setGenerationResult(null);

		const toastId = toast.loading(
			"Generating whiteboard animation... This may take several minutes"
		);

		try {
			const response = await apiService.generateWhiteboardVideo(
				actualPaperId,
				imageModel,
				scenesCount,
				ttsProvider,
				ttsGender,
				ttsLanguage
			);

			if (response.data.success) {
				setGenerationResult(response.data);

				// Get video stream URL
				const streamUrl = apiService.getWhiteboardVideoStreamUrl(actualPaperId);
				setVideoUrl(streamUrl);

				toast.success("Whiteboard video generated successfully!", {
					id: toastId,
				});
			} else {
				toast.error(response.data.message || "Video generation failed", {
					id: toastId,
				});
			}
		} catch (error) {
			console.error("Generation error:", error);
			toast.error(
				error.response?.data?.detail ||
				error.response?.data?.message ||
				"Failed to generate video",
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
			const response = await apiService.downloadWhiteboardVideo(actualPaperId);

			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement("a");
			link.href = url;
			link.setAttribute("download", `${actualPaperId}_whiteboard_animation.mp4`);
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

	// Delete video
	const handleDelete = async () => {
		if (!window.confirm("Are you sure you want to delete this whiteboard video?")) {
			return;
		}

		try {
			await apiService.deleteWhiteboardVideo(paperId);
			setVideoUrl(null);
			setGenerationResult(null);
			toast.success("Video deleted successfully!");
		} catch (error) {
			console.error("Delete error:", error);
			toast.error("Failed to delete video");
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold text-gray-900 mb-4">
						Whiteboard Animation Generator
					</h1>
					<p className="text-lg text-gray-600">
						Create hand-drawn style educational videos with AI-generated visuals
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
							className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
							placeholder="1706.03762 or https://arxiv.org/abs/1706.03762"
						/>
					</div>

					{/* Image Model Selection */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Image Generation Model
						</label>
						<select
							value={imageModel}
							onChange={(e) => setImageModel(e.target.value)}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
						>
							<option value="pollinations">Pollinations AI (Free, Fast)</option>
							<option value="gemini">Gemini 2.0 Flash (High Quality)</option>
							<option value="sd">Stable Diffusion 1.5 (Offline)</option>
						</select>
						<p className="mt-2 text-sm text-gray-500">
							{imageModel === "pollinations" && "✓ No API key required, fast generation"}
							{imageModel === "gemini" && "⚠ Requires Gemini API key"}
							{imageModel === "sd" && "⚠ Requires GPU, slower generation"}
						</p>
					</div>

					{/* Optional Settings */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Target Duration (seconds)
							</label>
							<input
								type="number"
								value={targetDuration || ""}
								onChange={(e) => setTargetDuration(e.target.value ? parseInt(e.target.value) : null)}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
								placeholder="Auto (based on narration)"
								min="10"
								max="300"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Number of Scenes
							</label>
							<input
								type="number"
								value={scenesCount || ""}
								onChange={(e) => setScenesCount(e.target.value ? parseInt(e.target.value) : null)}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
								placeholder="Auto (AI-determined)"
								min="1"
								max="20"
							/>
						</div>
					</div>

					{/* TTS Provider Selection */}
					<div className="mb-6">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Text-to-Speech Provider
						</label>
						<select
							value={ttsProvider}
							onChange={(e) => setTtsProvider(e.target.value)}
							className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
							onClick={handlePreview}
							disabled={!paperId || previewing}
							className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{previewing ? "Loading Preview..." : "Preview Script"}
						</button>

						<button
							onClick={handleGenerate}
							disabled={!paperId || generating}
							className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
						>
							{generating ? "Generating Video..." : "Generate Video"}
						</button>
					</div>
				</div>

				{/* Video Result Panel - MOVED TO TOP */}
				{(videoUrl || generationResult) && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-6">Generated Video</h2>

						{/* Video Player */}
						{videoUrl && (
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
						)}

						{/* Generation Info */}
						{generationResult && (
							<div className="bg-gray-50 rounded-lg p-4 mb-6">
								<h3 className="text-lg font-semibold mb-2">Generation Details</h3>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
									<div>
										<span className="font-medium">Status:</span>{" "}
										<span className={generationResult.success ? "text-green-600" : "text-red-600"}>
											{generationResult.success ? "Success" : "Failed"}
										</span>
									</div>
									<div>
										<span className="font-medium">Scenes:</span>{" "}
										{generationResult.scenes_count || "N/A"}
									</div>
									<div className="md:col-span-2">
										<span className="font-medium">Message:</span>{" "}
										{generationResult.message}
									</div>
								</div>
							</div>
						)}

						{/* Action Buttons */}
						<div className="flex flex-wrap gap-4">
							<button
								onClick={handleDownload}
								className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
							>
								📥 Download Video
							</button>

							<button
								onClick={handleDelete}
								className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
							>
								🗑️ Delete Video
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

				{/* Preview Panel */}
				{preview && (
					<div className="bg-white rounded-lg shadow-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold mb-4">Script Preview</h2>

						{/* Statistics */}
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
							<div className="bg-blue-50 rounded-lg p-4">
								<p className="text-sm text-gray-600">Word Count</p>
								<p className="text-2xl font-bold text-blue-600">{preview.word_count}</p>
							</div>
							<div className="bg-green-50 rounded-lg p-4">
								<p className="text-sm text-gray-600">Duration</p>
								<p className="text-2xl font-bold text-green-600">
									{preview.total_duration?.toFixed(1)}s
								</p>
							</div>
							<div className="bg-purple-50 rounded-lg p-4">
								<p className="text-sm text-gray-600">Scenes</p>
								<p className="text-2xl font-bold text-purple-600">
									{preview.scenes?.length || 0}
								</p>
							</div>
							<div className="bg-orange-50 rounded-lg p-4">
								<p className="text-sm text-gray-600">Status</p>
								<p className="text-2xl font-bold text-orange-600">
									{preview.success ? "✓" : "✗"}
								</p>
							</div>
						</div>

						{/* Narration Script */}
						<div className="mb-6">
							<h3 className="text-lg font-semibold mb-2">Narration</h3>
							<div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
								<p className="text-gray-700 whitespace-pre-wrap">
									{preview.narration_script}
								</p>
							</div>
						</div>

						{/* Scene Breakdown */}
						{preview.scenes && preview.scenes.length > 0 && (
							<div>
								<h3 className="text-lg font-semibold mb-4">Scene Breakdown</h3>
								<div className="space-y-4">
									{preview.scenes.map((scene, index) => (
										<div
											key={index}
											className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
										>
											<div className="flex items-start justify-between mb-2">
												<h4 className="text-md font-semibold text-gray-800">
													Scene {scene.scene_number}
												</h4>
												<span className="text-sm text-gray-500">
													{scene.start_time.toFixed(1)}s - {scene.duration.toFixed(1)}s
												</span>
											</div>
											<div className="mb-2">
												<p className="text-sm font-medium text-gray-600">Image Prompt:</p>
												<p className="text-sm text-gray-700 italic">
													{scene.image_prompt}
												</p>
											</div>
											<div>
												<p className="text-sm font-medium text-gray-600">Narration:</p>
												<p className="text-sm text-gray-700">{scene.narration}</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Info Panel */}
				<div className="mt-8 bg-blue-50 rounded-lg p-6">
					<h3 className="text-lg font-semibold mb-3 text-blue-900">
						ℹ️ How It Works
					</h3>
					<ul className="space-y-2 text-sm text-blue-800">
						<li>
							<strong>Step 1:</strong> Enter your paper ID and configure settings
						</li>
						<li>
							<strong>Step 2:</strong> Preview the script to see scene breakdown
						</li>
						<li>
							<strong>Step 3:</strong> Generate video with AI-powered visuals
						</li>
						<li>
							<strong>Step 4:</strong> Watch and download your whiteboard animation
						</li>
					</ul>

					<div className="mt-4 pt-4 border-t border-blue-200">
						<p className="text-sm text-blue-700">
							<strong>Features:</strong> Word-level subtitle synchronization,
							Multiple TTS providers (Kokoro, Bhashini, Sarvam), Hand-drawing animation effects,
							Multiple AI image models (Pollinations, Gemini, Stable Diffusion)
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WhiteboardAnimation;
