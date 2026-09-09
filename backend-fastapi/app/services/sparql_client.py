import httpx
import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import HTTPException
from app.core.config import settings

import time
from collections import OrderedDict

logger = logging.getLogger("zoomathia.sparql")

class SPARQLClient:
    def __init__(self, endpoint: str = settings.SPARQL_ENDPOINT, timeout: float = settings.SPARQL_TIMEOUT, cache_ttl: float = 1800.0, max_cache_size: int = 500):
        self.endpoint = endpoint
        self.timeout = timeout
        self.cache_ttl = cache_ttl
        self.max_cache_size = max_cache_size
        self._cache: OrderedDict[str, tuple[float, Dict[str, Any]]] = OrderedDict()
        self._client: Optional[httpx.AsyncClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def get_client(self) -> httpx.AsyncClient:
        current_loop = asyncio.get_running_loop()
        if self._client is None or self._client.is_closed or self._loop != current_loop:
            self._loop = current_loop
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=10.0),
                headers={"User-Agent": "ZoomathiaFastAPI/1.0"}
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
            self._loop = None

    def clear_cache(self):
        """Vide le cache des requêtes SPARQL."""
        self._cache.clear()

    async def query(self, sparql_query: str, use_cache: bool = True) -> Dict[str, Any]:
        """Exécute une requête SPARQL SELECT et renvoie le JSON standardisé (avec mise en cache TTL)."""
        clean_query = " ".join(sparql_query.split())
        now = time.time()

        if use_cache and clean_query in self._cache:
            timestamp, data = self._cache[clean_query]
            if now - timestamp < self.cache_ttl:
                # Déplacer à la fin pour simuler LRU
                self._cache.move_to_end(clean_query)
                return data
            else:
                del self._cache[clean_query]

        client = await self.get_client()
        params = {"query": sparql_query, "format": "json"}
        headers = {"Accept": "application/sparql-results+json"}
        
        try:
            response = await client.get(self.endpoint, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

            if use_cache:
                # Éviction LRU si limite atteinte
                if len(self._cache) >= self.max_cache_size:
                    self._cache.popitem(last=False)
                self._cache[clean_query] = (now, data)

            return data
        except httpx.ConnectError as e:
            logger.error(f"Impossible de joindre l'endpoint SPARQL ({self.endpoint}): {e}")
            raise HTTPException(status_code=502, detail="SPARQL endpoint unreachable")
        except httpx.TimeoutException as e:
            logger.error(f"Timeout sur la requête SPARQL: {e}")
            raise HTTPException(status_code=504, detail="SPARQL query timed out")
        except httpx.HTTPStatusError as e:
            logger.error(f"Erreur HTTP retournée par SPARQL ({e.response.status_code}): {e.response.text}")
            raise HTTPException(status_code=502, detail=f"SPARQL error: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Erreur inattendue lors de la requête SPARQL: {e}")
            raise HTTPException(status_code=500, detail=f"Internal SPARQL processing error: {str(e)}")

    async def construct(self, sparql_query: str) -> str:
        """Exécute une requête SPARQL CONSTRUCT ou DESCRIBE et renvoie du texte Turtle."""
        client = await self.get_client()
        params = {"query": sparql_query}
        headers = {"Accept": "text/turtle"}
        
        try:
            response = await client.get(self.endpoint, params=params, headers=headers)
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.error(f"Erreur CONSTRUCT SPARQL: {e}")
            raise HTTPException(status_code=502, detail=f"SPARQL query failed: {str(e)}")

sparql_client = SPARQLClient()
