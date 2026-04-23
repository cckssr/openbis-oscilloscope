import asyncio
from app.config import settings
from app.scheduler.openbis_sync import sync_oscilloscopes_from_openbis

asyncio.run(sync_oscilloscopes_from_openbis(settings))
