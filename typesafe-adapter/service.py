"""Private HTTP bridge for TypeSafe AI's official System One Adapter.

The adapter calls the configured provider directly. It accepts only the TypeSafe
question shape used by Aterum and never writes provider responses to stdout.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from system_one_adapter import AsyncSystemOneAdapterClient, Choice
from system_one_adapter.providers.anthropic import AsyncAnthropicProvider

MAX_BODY_BYTES = 1_000_000
MODEL = os.environ.get("JEV_ADAPTER_MODEL", "claude-haiku-4-5-20251001")
TOKEN = os.environ.get("JEV_ADAPTER_TOKEN", "")
MAX_TOKENS = int(os.environ.get("JEV_ADAPTER_MAX_TOKENS", "2048"))


def build_questions(raw: Any) -> dict[str, Choice]:
    if not isinstance(raw, dict) or not 4 <= len(raw) <= 7:
        raise ValueError("INVALID_QUESTIONS")
    direction_keys = [key for key, question in raw.items() if isinstance(question, dict)
                      and isinstance(question.get("criteria"), dict) and "NO_TRADE" in question["criteria"]]
    if len(direction_keys) != 1:
        raise ValueError("INVALID_QUESTIONS")
    base = direction_keys[0]
    directions = set(raw[base]["criteria"])
    if "NO_TRADE" not in directions or not directions <= {"NO_TRADE", "LONG", "SHORT"} or len(directions) < 2:
        raise ValueError("INVALID_CHOICES")
    sides = directions - {"NO_TRADE"}
    expected = {base} | {f"{base}_{side}_{kind}" for side in sides for kind in ("leverage", "sl", "tp")}
    if set(raw) != expected:
        raise ValueError("INVALID_QUESTIONS")
    questions: dict[str, Choice] = {}
    for key, question in raw.items():
        if not isinstance(key, str) or not isinstance(question, dict):
            raise ValueError("INVALID_QUESTIONS")
        if question.get("type") != "choice" or not isinstance(question.get("criteria"), dict):
            raise ValueError("UNSUPPORTED_QUESTION")
        criteria = question["criteria"]
        valid = [key == base and set(criteria) == directions,
                 key.endswith("_leverage") and 0 < len(criteria) <= 10 and set(criteria) <= {f"x{i}" for i in range(1, 11)},
                 key.endswith("_sl") and 0 < len(criteria) <= 3 and set(criteria) <= {f"sl{i}" for i in range(1, 4)},
                 key.endswith("_tp") and 0 < len(criteria) <= 3 and set(criteria) <= {f"tp{i}" for i in range(1, 4)}]
        if not any(valid):
            raise ValueError("INVALID_CHOICES")
        questions[key] = Choice(instructions=question.get("instructions"), criteria=criteria)
    return questions


async def evaluate_payload(payload: dict[str, Any], *, client_type=AsyncSystemOneAdapterClient,
                           provider_type=AsyncAnthropicProvider) -> dict[str, Any]:
    state = payload.get("state")
    if not isinstance(state, (dict, list, str)):
        raise ValueError("INVALID_STATE")
    questions = build_questions(payload.get("questions"))
    provider = provider_type(MODEL, max_tokens=MAX_TOKENS)
    client = client_type(
        structured_outputs=True,
        llm_answer_mode="probabilities",
        normalize_probabilities=False,
        n_retry_malformed_structure=0,
        model=provider,
    )
    try:
        response = await client.system_one(state, questions)
        answers = {
            key: {
                "type": "choice",
                "choice": value.choice,
                "probabilities": value.probabilities,
                "confidence": value.confidence,
            }
            for key, value in response.answers.items()
        }
        return {
            "model": response.model,
            "answers": answers,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "latency_ms": round(response.usage.latency * 1000),
                "retries": response.usage.n_retries,
                "malformed_retries": response.usage.n_retries_malformed_structure,
            },
        }
    finally:
        await provider.aclose()


class Handler(BaseHTTPRequestHandler):
    server_version = "AterumTypeSafeAdapter/1"

    def log_message(self, _format: str, *_args: object) -> None:
        # Requests can contain trading context; do not log bodies or headers.
        return

    def respond(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self.respond(HTTPStatus.OK, {"ok": True, "provider": "anthropic", "model": MODEL})
        else:
            self.respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:
        supplied = self.headers.get("authorization", "")
        expected = f"Bearer {TOKEN}"
        if not TOKEN or not hmac.compare_digest(supplied.encode(), expected.encode()):
            self.respond(HTTPStatus.UNAUTHORIZED, {"error": "UNAUTHORIZED"})
            return
        if self.path != "/v1/systemone":
            self.respond(HTTPStatus.NOT_FOUND, {"error": "NOT_FOUND"})
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            if size <= 0 or size > MAX_BODY_BYTES:
                raise ValueError("INVALID_BODY_SIZE")
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError("INVALID_BODY")
            self.respond(HTTPStatus.OK, asyncio.run(evaluate_payload(payload)))
        except ValueError as error:
            self.respond(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception:
            # The Node caller turns this into NO_TRADE; never disclose provider details.
            self.respond(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "ADAPTER_UNAVAILABLE"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
