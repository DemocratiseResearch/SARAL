# Re-export all models so SQLModel.metadata knows about them at create_all() time.
from app.models.user import User  # noqa: F401
from app.models.paper import Paper  # noqa: F401
from app.models.script import Script  # noqa: F401
from app.models.slide import Slide  # noqa: F401
from app.models.media import Media  # noqa: F401
from app.models.job import Job  # noqa: F401
