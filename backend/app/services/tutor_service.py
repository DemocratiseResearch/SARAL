# app/services/tutor_service.py
import os
import json
import logging
from typing import Dict
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from app.services.pdf_processor import process_pdf_file # Using the existing pdf_processor

logger = logging.getLogger(__name__)

def analyze_paper_for_tutor(paper_id: str, api_keys: dict) -> Dict:
    """Analyzes the full text of a paper and generates a structured learning plan."""
    if not api_keys.get("gemini_key"):
        raise ValueError("Gemini API key is required for analysis.")

    # The text file is created by process_pdf_and_create_store in rag_service.py
    # We need to locate it.
    temp_dir = f"temp/papers/{paper_id}"
    text_file_path = None
    for root, _, files in os.walk(temp_dir):
        for file in files:
            if file.endswith(".txt"):
                text_file_path = os.path.join(root, file)
                break
        if text_file_path:
            break
            
    if not text_file_path or not os.path.exists(text_file_path):
        raise FileNotFoundError(f"Could not find the full text file for the paper_id {paper_id}.")

    with open(text_file_path, 'r', encoding='utf-8') as f:
        paper_text = f.read()

    parser = JsonOutputParser()

    prompt = PromptTemplate(
        template="""
        You are an expert academic tutor creating a structured learning plan for a research paper.
        
        **CRITICAL REQUIREMENTS:**
        1. You MUST return valid JSON with BOTH "prerequisites" and "abstraction_layers" arrays
        2. Each array MUST contain AT LEAST 2 items
        3. If the paper seems self-contained, identify the FOUNDATIONAL CONCEPTS it assumes (e.g., basic statistics, linear algebra, neural networks, machine learning fundamentals)
        
        **For Prerequisites:**
        - Think about what a reader needs to know BEFORE reading this paper
        - Include fundamental concepts from the field (e.g., "Basic Probability Theory", "Linear Regression", "Gradient Descent")
        - Even advanced papers build on basic concepts - identify them
        - Each prerequisite needs: topic, explanation (2-3 sentences), and a simple question
        
        **For Abstraction Layers:**
        - Layer 1: One-sentence summary of the paper's main contribution
        - Layer 2+: Progressively more detailed explanations of methodology and results
        - Each layer needs: summary and a comprehension question
        
        {format_instructions}

        **Paper Text:**
        {paper_text}
        
        Remember: Both arrays must contain at least 2 items each. Do not return empty arrays.
        """,
        input_variables=["paper_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=api_keys["gemini_key"],
        temperature=0.3
    )
    chain = prompt | llm | parser

    logger.info(f"Analyzing paper {paper_id} to create a learning plan...")
    
    learning_plan = chain.invoke({"paper_text": paper_text[:15000]})

    analysis_dir = "temp/rag_analysis"
    os.makedirs(analysis_dir, exist_ok=True)
    analysis_path = os.path.join(analysis_dir, f"{paper_id}.json")
    with open(analysis_path, 'w', encoding='utf-8') as f:
        json.dump(learning_plan, f, indent=2)

    logger.info(f"Learning plan saved to {analysis_path}")
    return learning_plan

# Functions get_user_intent, generate_solution_for_tutor, and evaluate_user_answer
# are copied directly from app_1/utils/rag_utils.py as they are LLM-based and not
# dependent on the specific RAG implementation. I'm omitting them here for brevity,
# but they should be included in this file.
def get_user_intent(user_input: str, api_keys: dict) -> str:
    """
    Uses an LLM to classify the user's intent as either 'answering' or 'needs_help'.
    """
    if not api_keys.get("gemini_key"):
        raise ValueError("Gemini API key is required for intent classification.")

    prompt = PromptTemplate(
        template="""
        You are an intent classifier. Your task is to determine if the user is trying to answer a question or if they are unsure and need help.
        Read the user's input and respond with ONLY ONE of the following two words:
        - "answering" (if the user is attempting to provide an answer)
        - "needs_help" (if the user says they don't know, asks for the answer, or expresses uncertainty)

        User's Input: "{user_input}"

        Your classification:
        """,
        input_variables=["user_input"],
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_keys["gemini_key"], temperature=0.0)
    # Using a simple String Output Parser
    chain = prompt | llm | StrOutputParser()

    print(f"Classifying intent for input: '{user_input}'")
    intent = chain.invoke({"user_input": user_input})
    
    # Clean up the output to be safe
    result = intent.strip().lower()
    print(f"Classified intent as: '{result}'")

    if result not in ["answering", "needs_help"]:
        return "answering" # Default to answering if the model misbehaves
    return result


def generate_solution_for_tutor(question: str, context: str, api_keys: dict) -> str:
    """Uses an LLM to generate a direct answer to a tutor question based on context."""
    if not api_keys.get("gemini_key"):
        raise ValueError("Gemini API key is required for generating a solution.")

    prompt = PromptTemplate(
    template = """You are an expert research assistant specializing in academic paper analysis. Your role is to provide clear, well-structured answers about the research paper while supplementing with relevant general knowledge.
    
    *Instructions:*
    1. *Analyze the Document First:* Carefully examine the provided context from the research paper and base your primary answer on this information.
    2. *Structure Your Response:* Use clear formatting with:
       - Headings (##) for major sections when appropriate
       - Bullet points for lists
       - *Bold* for emphasis on key terms
       - Inline code (code) for technical terms, variables, or short expressions
       - LaTeX for mathematical expressions:
         * Inline math: $E = mc^2$ for formulas within text
         * Block math: $$\\int_0^\\infty x^2 dx$$ for standalone equations
    3. *Supplement Thoughtfully:* IF NEEDED, add general knowledge to:
       - Define technical terms or concepts from the paper
       - Provide background context that aids understanding
       - Explain implications or connections to broader research
       - Compare with related work or standard approaches
       - No need to mention these in a seperate section.
    4. *Be Transparent:*
       - If the answer is directly in the document, cite it clearly
       - If the document doesn't contain the answer, state this explicitly before providing general knowledge
    5. *Simple, Clear Answers*
       - Do not overexplain, keep your answers simple.
       - Only give extra information if needed, not for simple questions.
       - Ensure clear and perfect formatting
       - Do not overuse bullet points
    
    *Example Response Format:*
    
    User: "What loss function did they use?"
    
    Good Answer:
    "The paper uses *cross-entropy loss* for training the model, defined as:
    
    $$L = -\\sum_{{i=1}}^{{n}} y_i \\log(\\hat{{y}}_i)$$
    
    where $y_i$ is the true label and $\\hat{{y}}_i$ is the predicted probability.
    
    Cross-entropy loss is commonly used in classification tasks because it measures the dissimilarity between the predicted probability distribution and the true distribution, penalizing confident wrong predictions more heavily."
    
    ---
    
    *Context from the research paper:*
    {context}
    
    *Question:* {question}
    
    *Answer:*""",
        input_variables=["context", "question"],
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_keys["gemini_key"], temperature=0.1)
    chain = prompt | llm | StrOutputParser()

    print(f"Generating solution for question: '{question}'")
    solution = chain.invoke({
        "context": context,
        "question": question,
    })
    
    return solution

def evaluate_user_answer(user_answer: str, correct_concept: str, question: str, api_keys: dict) -> bool:
    """Uses an LLM to evaluate if a user's answer is correct."""
    if not api_keys.get("gemini_key"):
        raise ValueError("Gemini API key is required for evaluation.")

    prompt = PromptTemplate(
        template="""
        You are an evaluator. Your task is to determine if the user's answer correctly addresses the question, based on the provided concept.
        Respond with only "yes" or "no".

        Concept: {concept}
        Question: {question}
        User's Answer: {answer}
        """,
        input_variables=["concept", "question", "answer"],
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_keys["gemini_key"], temperature=0.0)
    chain = prompt | llm

    print(f"Evaluating user answer for question: '{question}'")
    response = chain.invoke({
        "concept": correct_concept,
        "question": question,
        "answer": user_answer
    })
    
    result = response.content.strip().lower()
    print(f"Evaluation result: '{result}'")
    return result == "yes"
