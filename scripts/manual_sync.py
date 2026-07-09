import asyncio
from backend.config import settings
from backend.scheduler.openbis_sync import sync_oscilloscopes_from_openbis

asyncio.run(sync_oscilloscopes_from_openbis(settings))
