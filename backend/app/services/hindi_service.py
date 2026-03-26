from sarvamai import SarvamAI
from app.utils.timing import track_performance

@track_performance
def generate_hindi_script_with_google(english_script, api_key):
    """
    Generate a natural Hindi script with appropriate English words mixed in using SarvamAI.

    Args:
        english_script (str): Original English script
        api_key (str): API key for SarvamAI service

    Returns:
        str: Hindi script with natural English mixing
    """
    if english_script is None or not english_script.strip():
        return None
    
    # Maximum character limit for mayura:v1 model
    MAX_CHUNK_SIZE = 990
    
    # If text is within limit, process it directly
    if len(english_script) <= MAX_CHUNK_SIZE:
        return _translate_text(english_script, api_key)
    
    # Split text into chunks at sentence boundaries
    chunks = _split_into_chunks(english_script, MAX_CHUNK_SIZE)
    
    # Translate each chunk and join the results
    translated_chunks = []
    for chunk in chunks:
        translated_chunk = _translate_text(chunk, api_key)
        if translated_chunk:
            translated_chunks.append(translated_chunk)
    
    return ' '.join(translated_chunks)

@track_performance
def _translate_text(text, api_key):
    """Helper function to translate text using SarvamAI."""
    client = SarvamAI(api_subscription_key=api_key)
    try:
        response = client.text.translate(
            input=text,
            source_language_code="en-IN",
            target_language_code="hi-IN",
            model="mayura:v1",
            mode="code-mixed"
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