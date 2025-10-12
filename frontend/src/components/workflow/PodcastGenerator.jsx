import React, { useState } from 'react';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../common/LoadingSpinner';

const PodcastGenerator = ({ paperId }) => {
    const [language, setLanguage] = useState('English');
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [podcastUrl, setPodcastUrl] = useState('');
    const [error, setError] = useState('');

    const handleGeneratePodcast = async () => {
        if (!paperId) {
            toast.error("Please upload a paper first.");
            return;
        }

        setLoading(true);
        setLoadingMessage('Starting podcast generation...');
        setError('');
        setPodcastUrl('');

        try {
            const startResp = await apiService.post(`/media/papers/${paperId}/podcast?language=${language}`);
            const taskId = startResp?.data?.task_id;

            if (!taskId) {
                throw new Error('Failed to start podcast generation task.');
            }

            setLoadingMessage('Generating podcast (this may take a minute)...');

            const pollInterval = setInterval(async () => {
                try {
                    const statusResp = await apiService.get(`/media/tasks/${taskId}`);
                    const { status, stage, url, error: taskError } = statusResp?.data || {};

                    if (status === 'processing' && stage) {
                        setLoadingMessage(`Processing: ${stage}...`);
                    } else if (status === 'complete') {
                        clearInterval(pollInterval);
                        if (url) {
                            const backendBase = process.env.NODE_ENV === 'production'
                                ? process.env.REACT_APP_API_URL
                                : 'http://localhost:8000';
                            setPodcastUrl(`${backendBase}${url}`);
                            toast.success('Podcast generated successfully!');
                        }
                        setLoading(false);
                    } else if (status === 'failed') {
                        clearInterval(pollInterval);
                        setError(taskError || 'Podcast generation failed.');
                        toast.error(taskError || 'Podcast generation failed.');
                        setLoading(false);
                    }
                } catch (pollErr) {
                    clearInterval(pollInterval);
                    setError('Failed to poll task status.');
                    toast.error('Failed to get podcast status.');
                    setLoading(false);
                }
            }, 5000);

        } catch (err) {
            const errorMessage = err.response?.data?.detail || 'Failed to start podcast generation.';
            setError(errorMessage);
            toast.error(errorMessage);
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
            <h2 className="text-xl font-semibold">Generate a Multilingual Podcast</h2>

            <div className="flex flex-col sm:flex-row items-center gap-4">
                <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="border rounded px-3 py-2 bg-white dark:bg-gray-800 w-full sm:w-auto"
                    aria-label="Select podcast language"
                >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Tamil">Tamil</option>
                    <option value="Telugu">Telugu</option>
                    <option value="Bengali">Bengali</option>
                    <option value="Gujarati">Gujarati</option>
                    <option value="Kannada">Kannada</option>
                    <option value="Malayalam">Malayalam</option>
                    <option value="Marathi">Marathi</option>
                    <option value="Odia">Odia</option>
                    <option value="Punjabi">Punjabi</option>
                </select>
                <button
                    onClick={handleGeneratePodcast}
                    disabled={loading}
                    className="bg-blue-600 text-white px-5 py-2 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors w-full sm:w-auto"
                >
                    {loading ? 'Generating...' : 'Generate Podcast'}
                </button>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm">
                    <LoadingSpinner />
                    <span>{loadingMessage}</span>
                </div>
            )}

            {error && <p className="text-red-500 mt-3">{error}</p>}

            {podcastUrl && (
                <div className="mt-4 space-y-3">
                    <h3 className="font-semibold">Your Podcast is Ready!</h3>
                    <audio controls src={podcastUrl} className="w-full" />
                    <a
                        href={podcastUrl}
                        download
                        className="font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                        Download Podcast MP3
                    </a>
                </div>
            )}
        </div>
    );
};

export default PodcastGenerator;
