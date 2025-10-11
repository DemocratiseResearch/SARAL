import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFlashcards } from '../services/api';
import Flashcard from '../components/common/Flashcard';

const FlashcardGeneration = () => {
  const navigate = useNavigate();
  const { paperId } = useParams();
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFlashcards() {
      setLoading(true);
      try {
        const response = await getFlashcards(paperId);
        setFlashcards(response.flashcards);
      } catch (err) {
        setError('Failed to load flashcards');
      }
      setLoading(false);
    }
    fetchFlashcards();
  }, [paperId]);

  if (loading) return <div className="p-8 text-center">Loading flashcards...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md"
      >
        ← Back
      </button>
      <h2 className="text-2xl font-bold mb-6 text-center">Flashcards for Paper</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {flashcards.map(card => (
          <Flashcard key={card.id} {...card} />
        ))}
      </div>
    </div>
  );
};

export default FlashcardGeneration;
