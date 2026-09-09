"""
Client asynchrone pour l'API REST OpenTheso (Huma-Num) dédié au thésaurus TheZoo (th310).
Fournit l'autocomplétion en temps réel et la récupération des notices de concepts SKOS.
"""

import time
import httpx
from typing import List, Dict, Any, Optional

OPENTHESO_BASE_URL = "https://opentheso.huma-num.fr"
DEFAULT_THESO_ID = "th310"  # Identifiant OpenTheso du thésaurus Zoomathia TheZoo

# Cache mémoire simple avec expiration TTL (600 secondes = 10 minutes)
_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 600


class OpenThesoClient:
    """Client HTTP résilient pour interagir avec le serveur OpenTheso d'Huma-Num."""

    def __init__(self, timeout: float = 8.0):
        self.timeout = timeout

    async def autocomplete(
        self, query: str, theso_id: str = DEFAULT_THESO_ID
    ) -> List[Dict[str, str]]:
        """
        Recherche des suggestions de concepts dans TheZoo par autocomplétion.
        Retourne une liste d'objets : [{"label": "canis", "uri": "https://...", "identifier": "..."}]
        """
        query_clean = query.strip()
        if not query_clean or len(query_clean) < 2:
            return []

        cache_key = f"autocomplete:{theso_id}:{query_clean.lower()}"
        now = time.time()

        if cache_key in _CACHE:
            cached = _CACHE[cache_key]
            if now - cached["timestamp"] < CACHE_TTL_SECONDS:
                return cached["data"]

        url = f"{OPENTHESO_BASE_URL}/openapi/v1/concept/{theso_id}/autocomplete/{query_clean}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    raw_data = response.json()
                    # Normalisation des résultats OpenTheso
                    results: List[Dict[str, str]] = []
                    if isinstance(raw_data, list):
                        for item in raw_data:
                            if isinstance(item, dict) and "label" in item and "uri" in item:
                                results.append({
                                    "label": item.get("label", ""),
                                    "uri": item.get("uri", ""),
                                    "identifier": str(item.get("identifier", ""))
                                })
                    _CACHE[cache_key] = {"data": results, "timestamp": now}
                    return results
        except Exception as e:
            # En cas de coupure temporaire d'Huma-Num, on logge sans faire crasher l'application
            print(f"[OpenThesoClient] Avertissement autocomplétion OpenTheso ({url}): {e}")

        return []

    async def get_concept_details(
        self, concept_id: str, theso_id: str = DEFAULT_THESO_ID
    ) -> Optional[Dict[str, Any]]:
        """
        Récupère les détails sémantiques complets d'un concept en JSON-LD (labels multilingues, broader).
        """
        cache_key = f"concept:{theso_id}:{concept_id}"
        now = time.time()

        if cache_key in _CACHE:
            cached = _CACHE[cache_key]
            if now - cached["timestamp"] < CACHE_TTL_SECONDS:
                return cached["data"]

        url = f"{OPENTHESO_BASE_URL}/api/{theso_id}.{concept_id}.jsonld"

        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    _CACHE[cache_key] = {"data": data, "timestamp": now}
                    return data
        except Exception as e:
            print(f"[OpenThesoClient] Avertissement récupération concept OpenTheso ({url}): {e}")

        return None


# Instance singleton réutilisable
opentheso_client = OpenThesoClient()
