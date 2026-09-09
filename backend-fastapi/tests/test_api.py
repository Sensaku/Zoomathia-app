import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["project"] == "Zoomathia API"

@pytest.mark.asyncio
async def test_qc_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/qcList")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 13
        assert data[0]["id"] == 1

@pytest.mark.asyncio
async def test_get_authors():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/getAuthors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        authors = [a["name"] for a in data]
        assert "Aristotle" in authors or "Aelian" in authors

@pytest.mark.asyncio
async def test_get_works():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/getWorks")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "title" in data[0]
        assert "uri" in data[0]

@pytest.mark.asyncio
async def test_qc1_query():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/getQC?id=1")
        assert response.status_code == 200
        data = response.json()
        assert "table" in data
        assert "columns" in data["table"]
        assert "data" in data["table"]
        assert len(data["table"]["data"]) > 0

@pytest.mark.asyncio
async def test_qc_spo_query():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/getQCspo?id=1")
        assert response.status_code == 200
        data = response.json()
        assert "head" in data
        assert "results" in data

@pytest.mark.asyncio
async def test_get_theso():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/getTheso?lang=en")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "label" in data[0]
        assert "value" in data[0]

@pytest.mark.asyncio
async def test_get_summary():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test avec une oeuvre connue (Aelian de natura animalium)
        uri = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium"
        response = await client.get(f"/getSummary?uri={uri}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "uri" in data[0]
            assert "children" in data[0]

@pytest.mark.asyncio
async def test_path_traversal_security():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/download-xml?file=../../app.js")
        assert response.status_code in (400, 403)

@pytest.mark.asyncio
async def test_sparql_injection_security():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/download-custom-search-json?sparql=DROP%20ALL")
        assert response.status_code == 400
