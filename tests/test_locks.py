import pytest
import pytest_asyncio
import fakeredis.aioredis as fakeredis

from app.locks.service import LockService


@pytest_asyncio.fixture
async def lock_svc():
    redis = fakeredis.FakeRedis()
    return LockService(redis)


@pytest.mark.asyncio
async def test_acquire_lock_success(lock_svc):
    ok = await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    assert ok is True

    lock = await lock_svc.get_lock("scope-01")
    assert lock is not None
    assert lock.owner_user == "alice"
    assert lock.session_id == "sess-001"


@pytest.mark.asyncio
async def test_acquire_lock_exclusive(lock_svc):
    """Second acquire attempt on a held lock returns False."""
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    ok2 = await lock_svc.acquire_lock("scope-01", "bob", "sess-002")
    assert ok2 is False


@pytest.mark.asyncio
async def test_release_lock_own(lock_svc):
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    released = await lock_svc.release_lock("scope-01", "sess-001")
    assert released is True
    assert await lock_svc.get_lock("scope-01") is None


@pytest.mark.asyncio
async def test_release_lock_wrong_session(lock_svc):
    """Cannot release someone else's lock."""
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    released = await lock_svc.release_lock("scope-01", "sess-WRONG")
    assert released is False
    assert await lock_svc.get_lock("scope-01") is not None


@pytest.mark.asyncio
async def test_renew_lock(lock_svc):
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    renewed = await lock_svc.renew_lock("scope-01", "sess-001")
    assert renewed is True


@pytest.mark.asyncio
async def test_renew_lock_wrong_session(lock_svc):
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    renewed = await lock_svc.renew_lock("scope-01", "sess-WRONG")
    assert renewed is False


@pytest.mark.asyncio
async def test_get_lock_none(lock_svc):
    lock = await lock_svc.get_lock("scope-nonexistent")
    assert lock is None


@pytest.mark.asyncio
async def test_reset_all_locks(lock_svc):
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    await lock_svc.acquire_lock("scope-02", "bob", "sess-002")

    count = await lock_svc.reset_all_locks()
    assert count == 2

    assert await lock_svc.get_lock("scope-01") is None
    assert await lock_svc.get_lock("scope-02") is None


@pytest.mark.asyncio
async def test_force_release(lock_svc):
    await lock_svc.acquire_lock("scope-01", "alice", "sess-001")
    released = await lock_svc.force_release_lock("scope-01")
    assert released is True
    assert await lock_svc.get_lock("scope-01") is None


@pytest.mark.asyncio
async def test_force_release_no_lock(lock_svc):
    released = await lock_svc.force_release_lock("scope-nonexistent")
    assert released is False
