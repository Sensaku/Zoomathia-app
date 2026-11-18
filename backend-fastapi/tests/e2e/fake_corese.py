"""A fake Corese for the end-to-end stack: it answers recorded SPARQL results (stdlib only)."""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

EMPTY_RESULT: dict[str, Any] = {"head": {"vars": []}, "results": {"bindings": []}}


def collapse(text: str) -> str:
    """Whitespace collapsed to single spaces, so a fixture does not depend on indentation."""
    return re.sub(r"\s+", " ", text).strip()


def load_rules(path: Path) -> list[dict[str, Any]]:
    """The rules of `corese.json`: `{name, contains, result}`; `contains` is collapsed too."""
    rules: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    for rule in rules:
        rule["contains"] = [collapse(part) for part in rule["contains"]]
    return rules


def answer_for(rules: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    """The result of the first rule whose substrings all appear in `query`, else `None`."""
    flat = collapse(query)
    for rule in rules:
        if all(part in flat for part in rule["contains"]):
            result: dict[str, Any] = rule["result"]
            return result
    return None


def make_handler(rules: list[dict[str, Any]]) -> type[BaseHTTPRequestHandler]:
    """A request handler class answering `GET /sparql?query=...` from `rules`."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - name set by http.server
            url = urlsplit(self.path)
            queries = parse_qs(url.query).get("query")
            if url.path != "/sparql" or not queries:
                self._send(400, {"error": "expected GET /sparql?query=..."})
                return
            result = answer_for(rules, queries[0])
            if result is None:
                print(f"fake-corese: no fixture for: {collapse(queries[0])[:300]}", file=sys.stderr)
                result = EMPTY_RESULT
            self._send(200, result)

        def _send(self, status: int, body: dict[str, Any]) -> None:
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/sparql-results+json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            """Stay silent: only the `no fixture` lines matter."""

    return Handler


def make_server(port: int, rules: list[dict[str, Any]]) -> ThreadingHTTPServer:
    """The fake Corese, bound to `127.0.0.1:port`; the caller runs `serve_forever`."""
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(rules))
