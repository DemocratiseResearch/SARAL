# app/routes/tutor.py
import json
import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from app.models.request_models import RagTutorRequest  # Assuming you'll add this to request_models
from app.routes.api_keys import get_api_keys
from app.services.tutor_service import (
    analyze_paper_for_tutor,
    evaluate_user_answer,
    generate_solution_for_tutor,
    get_user_intent,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze/{paper_id}")
async def analyze_paper(paper_id: str, api_keys: dict = Depends(get_api_keys)):
    """
    Analyzes the paper to generate the structured learning plan.
    This is a one-time operation per paper.
    """
    analysis_dir = "temp/rag_analysis"
    os.makedirs(analysis_dir, exist_ok=True)
    analysis_path = f"{analysis_dir}/{paper_id}.json"

    if os.path.exists(analysis_path):
        with open(analysis_path, 'r') as f:
            return json.load(f)

    try:
        # This function now lives in tutor_service and uses the existing RAG setup
        learning_plan = analyze_paper_for_tutor(paper_id, api_keys)
        return learning_plan
    except Exception as e:
        logger.error(f"Error analyzing paper: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze paper: {str(e)}")


@router.post("/tutor/{paper_id}")
async def tutor_chat(paper_id: str, request: RagTutorRequest, api_keys: dict = Depends(get_api_keys)):
    """Handles the stateful, interactive tutoring session."""
    analysis_path = f"temp/rag_analysis/{paper_id}.json"
    if not os.path.exists(analysis_path):
        raise HTTPException(status_code=404, detail="Learning plan not found. Please analyze the paper first.")

    with open(analysis_path, 'r') as f:
        plan = json.load(f)

    state = request.state
    user_answer = request.user_answer
    
    # Get current step's data from the plan
    current_data = None
    if state.current_step_type == 'prerequisite':
        current_data = plan['prerequisites'][state.current_step_index]
    else: # 'layer'
        current_data = plan['abstraction_layers'][state.current_step_index]

    # 1. Determine the user's intent first
    intent = get_user_intent(user_answer, api_keys)
    is_correct = False
    bot_message = ""
    next_state = state.copy()
    is_final = False

    if intent == "needs_help":
        # 2. If the user needs help, generate the solution
        context = current_data['explanation'] if state.current_step_type == 'prerequisite' else current_data['summary']
        solution = generate_solution_for_tutor(
            question=current_data['question'],
            context=context,
            api_keys=api_keys
        )
        
        # Show the answer first
        bot_message = f"No problem! Here is the answer:\n\n**Answer:** {solution}\n\n"
        
        # Reset retry count when moving to next step
        next_state.retry_count = 0
        
        # Now move to the next step
        if state.current_step_type == 'prerequisite':
            next_index = state.current_step_index + 1
            if next_index < len(plan['prerequisites']):
                next_state.current_step_index = next_index
                next_state.current_step = state.current_step + 1
                next_step_data = plan['prerequisites'][next_index]
                bot_message += f"Let's move on to the next topic.\n\n**{next_step_data['topic']}**\n\n{next_step_data['explanation']}\n\n{next_step_data['question']}"
            else:
                next_state.completed_prerequisites = True
                next_state.current_step_type = 'layer'
                next_state.current_step_index = 0
                next_state.current_step = state.current_step + 1
                next_step_data = plan['abstraction_layers'][0]
                bot_message += f"Great, you've covered the prerequisites. Now let's dive into the paper itself.\n\n**High-Level Summary:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
        else: # 'layer'
            next_index = state.current_step_index + 1
            if next_index < len(plan['abstraction_layers']):
                next_state.current_step_index = next_index
                next_state.current_step = state.current_step + 1
                next_step_data = plan['abstraction_layers'][next_index]
                bot_message += f"Let's move on.\n\n**Next Level of Detail:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
            else:
                next_state.current_step = state.current_step + 1
                bot_message += "Excellent! You've successfully gone through all the layers of the paper. You should now have a solid understanding of it. The session is complete."
                is_final = True

    else: # intent == "answering"
        # 3. If the user is answering, evaluate their answer
        is_correct = evaluate_user_answer(
            user_answer=user_answer,
            correct_concept=current_data['explanation'] if state.current_step_type == 'prerequisite' else current_data['summary'],
            question=current_data['question'],
            api_keys=api_keys
        )

        if is_correct:
            bot_message = "Correct! Let's move on.\n\n"
            
            # Reset retry count when moving to next step
            next_state.retry_count = 0
            
            # Move to the next step
            if state.current_step_type == 'prerequisite':
                next_index = state.current_step_index + 1
                if next_index < len(plan['prerequisites']):
                    next_state.current_step_index = next_index
                    next_state.current_step = state.current_step + 1 
                    next_step_data = plan['prerequisites'][next_index]
                    bot_message += f"Next topic: **{next_step_data['topic']}**\n\n{next_step_data['explanation']}\n\n{next_step_data['question']}"
                else:
                    next_state.completed_prerequisites = True
                    next_state.current_step_type = 'layer'
                    next_state.current_step_index = 0
                    next_step_data = plan['abstraction_layers'][0]
                    bot_message += f"Great, you've covered the prerequisites. Now let's dive into the paper itself.\n\n**High-Level Summary:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
            else: # 'layer'
                next_index = state.current_step_index + 1
                if next_index < len(plan['abstraction_layers']):
                    next_state.current_step_index = next_index
                    next_state.current_step = state.current_step + 1
                    next_step_data = plan['abstraction_layers'][next_index]
                    bot_message += f"**Next Level of Detail:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
                else:
                    next_state.current_step = state.current_step + 1
                    bot_message += "Excellent! You've successfully gone through all the layers of the paper. You should now have a solid understanding of it. The session is complete."
                    is_final = True
        else:
            # Increment retry count
            current_retry_count = getattr(state, 'retry_count', 0)
            next_state.retry_count = current_retry_count + 1
            
            # Check if user has exceeded retry limit (3 attempts)
            if next_state.retry_count >= 3:
                # Generate and show the answer after 3 failed attempts
                context = current_data['explanation'] if state.current_step_type == 'prerequisite' else current_data['summary']
                solution = generate_solution_for_tutor(
                    question=current_data['question'],
                    context=context,
                    api_keys=api_keys
                )
                
                bot_message = f"I see you're having trouble with this one. Let me help you out.\n\n**Answer:** {solution}\n\n"
                
                # Reset retry count and move to next step
                next_state.retry_count = 0
                
                # Move to the next step (same logic as "needs_help")
                if state.current_step_type == 'prerequisite':
                    next_index = state.current_step_index + 1
                    if next_index < len(plan['prerequisites']):
                        next_state.current_step_index = next_index
                        next_state.current_step = state.current_step + 1
                        next_step_data = plan['prerequisites'][next_index]
                        bot_message += f"Let's move on to the next topic.\n\n**{next_step_data['topic']}**\n\n{next_step_data['explanation']}\n\n{next_step_data['question']}"
                    else:
                        next_state.completed_prerequisites = True
                        next_state.current_step_type = 'layer'
                        next_state.current_step_index = 0
                        next_state.current_step = state.current_step + 1
                        next_step_data = plan['abstraction_layers'][0]
                        bot_message += f"Great, you've covered the prerequisites. Now let's dive into the paper itself.\n\n**High-Level Summary:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
                else: # 'layer'
                    next_index = state.current_step_index + 1
                    if next_index < len(plan['abstraction_layers']):
                        next_state.current_step_index = next_index
                        next_state.current_step = state.current_step + 1
                        next_step_data = plan['abstraction_layers'][next_index]
                        bot_message += f"Let's move on.\n\n**Next Level of Detail:**\n{next_step_data['summary']}\n\n{next_step_data['question']}"
                    else:
                        next_state.current_step = state.current_step + 1
                        bot_message += "You've successfully gone through all the layers of the paper. The session is complete."
                        is_final = True
            else:
                # Re-explain and re-ask (attempts 1 and 2)
                attempts_left = 3 - next_state.retry_count
                bot_message = f"Not quite. Let me explain it again. (You have {attempts_left} attempt{'s' if attempts_left > 1 else ''} left)\n\n"
                explanation = current_data['explanation'] if state.current_step_type == 'prerequisite' else current_data['summary']
                bot_message += f"{explanation}\n\nLet's try this question again:\n{current_data['question']}"
    
    return {
        "bot_message": bot_message,
        "next_state": next_state,
        "is_final": is_final
    }
