import os
import logging
from pathlib import Path
import uuid
import time
import shutil

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError

from app.services.pdf_processor import process_pdf_file
from fastapi import UploadFile, HTTPException

# **FIX**: Import the necessary function to save paper information
from app.routes.papers import save_paper_info

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the persistent directory for vector stores
VECTOR_STORE_DIR = "temp/vector_stores"
Path(VECTOR_STORE_DIR).mkdir(parents=True, exist_ok=True)

# Initialize the local embedding model once.
try:
    logger.info("Loading local sentence transformer model...")
    embedding_function = SentenceTransformerEmbeddings(
        model_name="BAAI/bge-m3"
    )
    logger.info("✅ Model loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load sentence transformer model: {e}", exc_info=True)
    embedding_function = None

@retry(
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    retry_error_callback=lambda retry_state: logger.error(
        f"Embedding failed after {retry_state.attempt_number} attempts: {retry_state.outcome.exception()}"
    )
)
def add_texts_with_retry(vector_store, texts):
    """A wrapper function to add texts to ChromaDB with retry logic."""
    vector_store.add_texts(texts=texts)


def process_pdf_and_create_store(file: UploadFile, GOOGLE_API_KEY: str) -> str:
    """
    Processes an uploaded PDF, creates a Chroma vector store, persists it,
    and correctly saves the paper's metadata.
    """
    if embedding_function is None:
        raise HTTPException(status_code=500, detail="Embedding model is not available.")

    paper_id = str(uuid.uuid4())
    temp_dir = f"temp/papers/{paper_id}"
    
    try:
        logger.info(f"Starting vector store creation for chat with paper_id: {paper_id}")

        os.makedirs(temp_dir, exist_ok=True)
        pdf_path = os.path.join(temp_dir, file.filename)
        with open(pdf_path, "wb") as buffer:
            buffer.write(file.file.read())

        # 1. Process PDF to extract text and other info
        paper_info = process_pdf_file(pdf_path, paper_id)
        text_file_path = paper_info.get("text_file_path")
        
        if not text_file_path or not os.path.exists(text_file_path):
            raise Exception("Text extraction failed.")

        # 2. Save the paper info to the central storage so it can be found later.
        paper_info["source_type"] = "pdf"
        if "pdf_path" in paper_info:
            paper_info["pdf_file_path"] = paper_info.pop("pdf_path")
        save_paper_info(paper_id, paper_info)
        logger.info(f"Paper info for {paper_id} saved to central storage.")
        
        # 3. Split Text into Chunks for the vector store
        with open(text_file_path, "r", encoding="utf-8") as f:
            document_text = f.read()
            
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = text_splitter.split_text(document_text)
        logger.info(f"Document split into {len(chunks)} chunks.")

        # 4. Create and Persist Chroma Vector Store in Batches
        persist_directory = os.path.join(VECTOR_STORE_DIR, paper_id)
        
        vector_store = Chroma(
            embedding_function=embedding_function,
            persist_directory=persist_directory
        )
        
        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}...")
            
            try:
                add_texts_with_retry(vector_store, batch)
            except RetryError as e:
                 raise Exception(f"Failed to add texts to vector store after multiple retries: {e}")

            time.sleep(0.5)

        vector_store.persist()
        logger.info(f"✅ Successfully created vector store for chat paper_id: {paper_id} at {persist_directory}")
        return paper_id

    except Exception as e:
        logger.error(f"Failed to create vector store for paper_id {paper_id}: {e}", exc_info=True)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise e


def get_conversational_chain(paper_id: str, GOOGLE_API_KEY: str):
    """
    Loads an existing vector store and builds a conversational RAG chain.
    (This function remains unchanged)
    """
    if embedding_function is None:
        raise HTTPException(status_code=500, detail="Embedding model is not available.")

    persist_directory = os.path.join(VECTOR_STORE_DIR, paper_id)
    
    if not os.path.exists(persist_directory):
        logger.error(f"Vector store for paper_id {paper_id} not found.")
        return None

    vector_store = Chroma(
        persist_directory=persist_directory,
        embedding_function=embedding_function
    )
    
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key="answer"
    )
    
    custom_prompt_template = """You are an expert research assistant specializing in academic paper analysis. Your role is to provide clear, well-structured answers about the research paper while supplementing with relevant general knowledge.
    
    *Instructions:*
    1. *Analyze the Document First:* Carefully examine the provided context from the research paper and base your primary answer on this information.
    2. *Structure Your Response:* Use clear formatting like headings, bullet points, bold text, and LaTeX for math.
    3. *Supplement Thoughtfully:* If needed, add general knowledge to define terms or provide background.
    4. *Be Transparent:* If the answer isn't in the document, say so.
    5. *Simple, Clear Answers:* Be concise and avoid over-explaining.
    
    *Context from the research paper:*
    {context}
    
    *Question:* {question}
    
    *Answer:*"""
    
    QA_PROMPT = PromptTemplate(
        template=custom_prompt_template, input_variables=["context", "question"]
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=GOOGLE_API_KEY, temperature=0.2)
    
    retriever = vector_store.as_retriever(
        search_type="similarity", 
        search_kwargs={"k": 5}
    )
    
    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT}
    )
    
    return chain
