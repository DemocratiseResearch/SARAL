from contextvars import ContextVar

# Context variable to store the execution context (e.g., Endpoint Name)
execution_context_var: ContextVar[str] = ContextVar("execution_context", default="Background/Unknown")

def get_execution_context() -> str:
    """Get the current execution context."""
    return execution_context_var.get()

def set_execution_context(context_name: str):
    """Set the execution context (e.g. 'POST /api/path')."""
    execution_context_var.set(context_name)
