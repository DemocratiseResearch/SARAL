"""Redis stream identity shared by the worker entrypoint and every render mode.

Lives in its own module so the render modes can reference the stream/group
constants without importing ``job`` (which would be a circular import).
"""

import os

STREAM = "saral:jobs:ffmpeg"
GROUP = "saral-workers"
CONSUMER = f"ffmpeg-worker-{os.environ.get('HOSTNAME', str(os.getpid()))}"
