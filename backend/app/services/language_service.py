from sarvamai import SarvamAI
from app.utils.timing import track_performance

# Comprehensive language mapping for Sarvam SDK
SUPPORTED_LANGUAGES = {
    'Hindi': 'hi-IN',
    'Bengali': 'bn-IN',
    'Gujarati': 'gu-IN',
    'Kannada': 'kn-IN',
    'Malayalam': 'ml-IN',
    'Marathi': 'mr-IN',
    'Odia': 'od-IN',
    'Punjabi': 'pa-IN',
    'Tamil': 'ta-IN',
    'Telugu': 'te-IN'
}

@track_performance
def get_supported_languages():
    """
    Get list of all supported languages.
    
    Returns:
        dict: Dictionary mapping language names to language codes
    """
    return SUPPORTED_LANGUAGES.copy()

@track_performance
def is_language_supported(language):
    """
    Check if a language is supported.
    
    Args:
        language (str): Language name or code
        
    Returns:
        bool: True if language is supported
    """
    return (language in SUPPORTED_LANGUAGES or 
            language in SUPPORTED_LANGUAGES.values())

@track_performance
def get_language_code(language):
    """
    Get language code for a given language name.
    
    Args:
        language (str): Language name
        
    Returns:
        str: Language code or None if not supported
    """
    if language in SUPPORTED_LANGUAGES:
        return SUPPORTED_LANGUAGES[language]
    elif language in SUPPORTED_LANGUAGES.values():
        return language
    return None

@track_performance
def translate_to_language(english_script, target_language, api_key, mode="code-mixed"):
    """
    Translate English script to target language using SarvamAI.

    Args:
        english_script (str): Original English script
        target_language (str): Target language name or code
        api_key (str): API key for SarvamAI service
        mode (str): Translation mode ("code-mixed" or "translation")

    Returns:
        str: Translated script or None if translation fails
    """
    if english_script is None or not english_script.strip():
        return None
    
    # Get target language code
    target_code = get_language_code(target_language)
    if not target_code:
        raise ValueError(f"Unsupported language: {target_language}")
    
    # Maximum character limit for mayura:v1 model
    MAX_CHUNK_SIZE = 990
    
    # If text is within limit, process it directly
    if len(english_script) <= MAX_CHUNK_SIZE:
        return _translate_text(english_script, target_code, api_key, mode)
    
    # Split text into chunks at sentence boundaries
    chunks = _split_into_chunks(english_script, MAX_CHUNK_SIZE)
    
    # Translate each chunk and join the results
    translated_chunks = []
    for chunk in chunks:
        translated_chunk = _translate_text(chunk, target_code, api_key, mode)
        if translated_chunk:
            translated_chunks.append(translated_chunk)
    
    return ' '.join(translated_chunks)

@track_performance
def _translate_text(text, target_language_code, api_key, mode="code-mixed"):
    """Helper function to translate text using SarvamAI."""
    client = SarvamAI(api_subscription_key=api_key)
    try:
        response = client.text.translate(
            input=text,
            source_language_code="en-IN",
            target_language_code=target_language_code,
            model="mayura:v1",
            mode=mode
        )
        return response.translated_text
    except Exception as e:
        print(f"Translation error: {str(e)}")
        return None

@track_performance
def _split_into_chunks(text, max_size):
    """
    Split text into chunks not exceeding max_size, respecting sentence boundaries.
    
    Args:
        text (str): Text to split
        max_size (int): Maximum chunk size
        
    Returns:
        list: List of text chunks
    """
    # Common sentence delimiters
    sentence_delimiters = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
    
    chunks = []
    current_chunk = ""
    
    sentences = []
    remaining_text = text
    
    # Split text into sentences
    while remaining_text:
        delimiter_indices = [(remaining_text.find(delimiter), delimiter) 
                             for delimiter in sentence_delimiters 
                             if remaining_text.find(delimiter) != -1]
        
        if not delimiter_indices:
            sentences.append(remaining_text)
            break
            
        earliest_index, delimiter = min(delimiter_indices, key=lambda x: x[0])
        sentence = remaining_text[:earliest_index + len(delimiter)]
        sentences.append(sentence)
        remaining_text = remaining_text[earliest_index + len(delimiter):]
    
    # Group sentences into chunks
    for sentence in sentences:
        if len(current_chunk) + len(sentence) <= max_size:
            current_chunk += sentence
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence
    
    # Add the last chunk if it's not empty
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    return chunks

# Convenience functions for specific languages
@track_performance
def translate_to_hindi(english_script, api_key):
    """Convenience function to translate to Hindi."""
    return translate_to_language(english_script, 'hindi', api_key)

@track_performance
def translate_to_bengali(english_script, api_key):
    """Convenience function to translate to Bengali."""
    return translate_to_language(english_script, 'bengali', api_key)

@track_performance
def translate_to_tamil(english_script, api_key):
    """Convenience function to translate to Tamil."""
    return translate_to_language(english_script, 'tamil', api_key)

@track_performance
def translate_to_telugu(english_script, api_key):
    """Convenience function to translate to Telugu."""
    return translate_to_language(english_script, 'telugu', api_key)
