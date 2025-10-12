from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Response
from pydantic import BaseModel
from typing import List, Any, Optional
import markdown_it
from bs4 import BeautifulSoup
import re
import logging


from app.services.rag_service import process_pdf_and_create_store, get_conversational_chain
from app.routes.api_keys import get_api_keys
from app.services.tts_service import SarvamTTS

router = APIRouter()
logger = logging.getLogger(__name__)

conversation_chains = {}

class ChatUploadResponse(BaseModel):
    paper_id: str
    filename: str

class AskRequest(BaseModel):
    question: str

class AskWithContextRequest(BaseModel):
    question: str
    context: str

class AskResponse(BaseModel):
    answer: str
    context: Optional[List[str]] = None

class TTSRequest(BaseModel):
    text: str

@router.post("/upload", response_model=ChatUploadResponse)
async def upload_for_chat(
    file: UploadFile = File(...),
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to upload a PDF file specifically for the chat feature.
    Creates and persists a vector store.
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed for chat.")

    try:
        paper_id = process_pdf_and_create_store(file, api_keys["gemini_key"])
        return ChatUploadResponse(paper_id=paper_id, filename=file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF for chat: {str(e)}")


@router.post("/{paper_id}/ask", response_model=AskResponse)
async def ask_question(
    paper_id: str,
    request: AskRequest,
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to ask a question to the conversational RAG chain.
    """
    try:
        # Get or create conversational chain for this paper_id
        if paper_id not in conversation_chains:
            chain = get_conversational_chain(paper_id, api_keys["gemini_key"])
            if not chain:
                raise HTTPException(status_code=404, detail="Chat session not found for this paper.")
            conversation_chains[paper_id] = chain
        else:
            chain = conversation_chains[paper_id]

        # Use the chain's built-in memory for conversation context
        logger.info(f"Invoking chain with question: {request.question}")
        result = chain.invoke({
            "question": request.question
        })
        
        logger.info(f"Chain result type: {type(result)}")
        logger.info(f"Chain result: {result}")
        
        # Handle different return formats
        answer = None
        source_docs = []
        
        if isinstance(result, dict):
            answer = result.get("answer", "")
            source_docs = result.get("source_documents", [])
        elif isinstance(result, tuple):
            # Handle tuple: (answer, source_docs) or just (answer,)
            answer = result[0] if len(result) > 0 else ""
            source_docs = result[1] if len(result) > 1 else []
        else:
            # Fallback: convert to string
            answer = str(result)
            source_docs = []
        
        # Gather retrieved context snippets (if available)
        context_snippets: List[str] = []
        for doc in source_docs[:5]:  # limit to top 5 chunks
            text = getattr(doc, 'page_content', None)
            if text:
                snippet = text.strip()
                if len(snippet) > 800:
                    snippet = snippet[:800] + "…"
                context_snippets.append(snippet)

        return AskResponse(answer=answer, context=context_snippets or None)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask_question: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get answer: {str(e)}")

@router.post("/{paper_id}/ask_with_context", response_model=AskResponse)
async def ask_with_context(
    paper_id: str,
    request: AskWithContextRequest,
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to ask a question to the conversational RAG chain with additional context.
    """
    try:
        if paper_id not in conversation_chains:
            chain = get_conversational_chain(paper_id, api_keys["gemini_key"])
            if not chain:
                raise HTTPException(status_code=404, detail="Chat session not found for this paper.")
            conversation_chains[paper_id] = chain
        else:
            chain = conversation_chains[paper_id]

        # Modify the prompt to include the context
        prompt_with_context = f"Given the following context from a PDF, please answer the question.\n\nContext:\n---\n{request.context}\n---\n\nQuestion: {request.question}"

        logger.info(f"Invoking chain with context question: {request.question}")
        result = chain.invoke({
            "question": prompt_with_context
        })

        logger.info(f"Chain result type: {type(result)}")
        
        # Handle different return formats
        answer = None
        source_docs = []
        
        if isinstance(result, dict):
            answer = result.get("answer", "")
            source_docs = result.get("source_documents", [])
        elif isinstance(result, tuple):
            answer = result[0] if len(result) > 0 else ""
            source_docs = result[1] if len(result) > 1 else []
        else:
            answer = str(result)
            source_docs = []

        context_snippets: List[str] = []
        for doc in source_docs[:5]:
            text = getattr(doc, 'page_content', None)
            if text:
                snippet = text.strip()
                if len(snippet) > 800:
                    snippet = snippet[:800] + "…"
                context_snippets.append(snippet)

        return AskResponse(answer=answer, context=context_snippets or None)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask_with_context: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get answer with context: {str(e)}")


def clean_text_for_tts(text: str) -> str:
    """
    Clean text by removing markdown, LaTeX, and special formatting for TTS.
    """
    # Remove LaTeX block equations
    text = re.sub(r'\$\$.+?\$\$', ' equation ', text, flags=re.DOTALL)
    
    # Remove LaTeX inline equations
    text = re.sub(r'\$.+?\$', ' equation ', text)
    
    # Remove markdown headers
    text = re.sub(r'#{1,6}\s+', '', text)
    
    # Remove markdown bold
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    
    # Remove markdown italic
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    
    # Remove inline code
    text = re.sub(r'`(.+?)`', r'\1', text)
    
    # Remove code blocks
    text = re.sub(r'```.*?```', ' code block ', text, flags=re.DOTALL)
    
    # Remove markdown links
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    
    # Remove markdown images
    text = re.sub(r'!\[.*?\]\(.+?\)', '', text)
    
    # Remove bullet points and list markers
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    
    # Remove blockquotes
    text = re.sub(r'^\s*>\s+', '', text, flags=re.MULTILINE)
    
    # Remove horizontal rules
    text = re.sub(r'^\s*[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    
    # Remove HTML tags
    text = re.sub(r'<.+?>', '', text)
    
    # Remove extra whitespace and newlines
    text = re.sub(r'\n+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    
    # Remove special characters but keep basic punctuation
    text = re.sub(r'[^\w\s.,!?;:\-]', ' ', text)
    
    return text.strip()


@router.post("/tts")
async def text_to_speech(
    request: TTSRequest,
    api_keys: dict = Depends(get_api_keys)
):
    """
    Endpoint to convert text to speech.
    """
    try:
        tts_client = SarvamTTS(api_key=api_keys["sarvam_key"])
        
        # Clean the text first
        cleaned_text = clean_text_for_tts(request.text)
        logger.info(f"Original text length: {len(request.text)}, Cleaned text length: {len(cleaned_text)}")
        
        # Split text into chunks of 490 characters without breaking words
        text_chunks = []
        words = cleaned_text.split(' ')
        current_chunk = ""
        for word in words:
            if len(current_chunk) + len(word) + 1 > 490:
                text_chunks.append(current_chunk)
                current_chunk = word
            else:
                if current_chunk:
                    current_chunk += " " + word
                else:
                    current_chunk = word
        if current_chunk:
            text_chunks.append(current_chunk)

        audio_bytes = b''
        for chunk in text_chunks:
            audio_bytes += tts_client.synthesize_text(
                text=chunk,
                target_language='en-IN',
                voice='vidya'
            )

        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"Error in text_to_speech: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to convert text to speech: {str(e)}")
