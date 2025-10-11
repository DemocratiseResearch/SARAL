import React, { useState } from 'react';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';

const PosterGenerator = ({ paperId }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [language, setLanguage] = useState('en');

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setDownloadUrl(null);
        const toastId = toast.loading('Generating poster... This may take a moment.');

        try {
            const response = await apiService.generatePoster(paperId, language);
            setDownloadUrl(response.data.download_url);
            toast.success('Poster generated successfully!', { id: toastId });
        } catch (err) {
            const errorMessage = err.response?.data?.detail || 'Failed to generate poster.';
            setError(errorMessage);
            toast.error(errorMessage, { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    // Construct the full download URL for the <a> tag
    // This is the main fix. We manually create the base URL.
    const fullDownloadUrl = downloadUrl
        ? `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}${downloadUrl}`
        : '#';


    return (
        <div className="mt-8 p-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Generate Conference Poster</h3>
            <div className="flex flex-col sm:flex-row items-center gap-4">
                <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="border rounded px-3 py-2 bg-white dark:bg-gray-800 w-full sm:w-auto"
                    aria-label="Select poster language"
                >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                </select>
                <button 
                    onClick={handleGenerate} 
                    disabled={loading}
                    className="bg-blue-600 text-white px-5 py-2 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors w-full sm:w-auto"
                >
                    {loading ? 'Generating...' : 'Create Poster'}
                </button>
            </div>
            {error && <p className="text-red-500 mt-3">{error}</p>}
            {downloadUrl && (
                <div className="mt-4">
                    <a 
                        href={fullDownloadUrl}
                        download
                        className="font-medium text-blue-600 dark:text-blue-500 hover:underline"
                    >
                        Download Your Poster
                    </a>
                </div>
            )}
        </div>
    );
};

export default PosterGenerator;