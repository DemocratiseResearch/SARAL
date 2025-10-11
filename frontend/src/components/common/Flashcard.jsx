import React, { useState } from 'react';

const Flashcard = ({ key_point, question, image_url }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative w-full h-64 cursor-pointer perspective-1000"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div className={`relative w-full h-full transition-transform duration-600 transform-style-preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front Side - Key Point with Image */}
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl shadow-lg overflow-hidden">
          <div 
            className="w-full h-full bg-cover bg-center relative"
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(${image_url || 'https://source.unsplash.com/400x300/?research,science,education'})`
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center">
                <h3 className="text-white text-xl font-bold mb-2 drop-shadow-lg">
                  Key Point
                </h3>
                <p className="text-white text-lg font-medium leading-relaxed drop-shadow-md">
                  {key_point}
                </p>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 text-white text-sm opacity-75">
              Click to flip
            </div>
          </div>
        </div>

        {/* Back Side - Question */}
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl shadow-lg bg-gradient-to-br from-blue-500 to-purple-600 rotate-y-180">
          <div className="w-full h-full flex items-center justify-center p-6">
            <div className="text-center">
              <h3 className="text-white text-xl font-bold mb-4 drop-shadow-lg">
                Think About This
              </h3>
              <p className="text-white text-lg leading-relaxed drop-shadow-md">
                {question}
              </p>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 text-white text-sm opacity-75">
            Click to flip back
          </div>
        </div>
      </div>
    </div>
  );
};

export default Flashcard;
