from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from modules.ai_adapter.models import AIResultEvent
from modules.ai_adapter.settings import AIAdapterSettings
from modules.ai_contract.schemas import AIEndpointResponse


class AIProcessorUnavailableError(RuntimeError):
    pass


class AIProcessorNotFoundError(ValueError):
    pass


class AIAdapterService:
    _STREAM_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$")

    def __init__(self, settings: AIAdapterSettings, http_client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._http_client = http_client

    @classmethod
    def is_canonical_stream_id(cls, stream_id: str) -> bool:
        return bool(cls._STREAM_ID_PATTERN.fullmatch(stream_id)) and ".." not in stream_id and "//" not in stream_id

    async def analyze(self, db: Session, stream_id: str, processor_id: str, group_id: str) -> AIEndpointResponse:
        if not self.is_canonical_stream_id(stream_id):
            raise ValueError("stream_id is not a valid canonical stream path")
        endpoint = self.settings.processor_endpoints().get(processor_id)
        if endpoint is None:
            raise AIProcessorNotFoundError("AI processor is not configured")
        now = datetime.now(timezone.utc)
        request = {
            "schemaVersion": "ai.detection.v1alpha1",
            "streamId": stream_id,
            "frame": {"streamId": stream_id, "capturedAt": now.isoformat()},
            "imageUrl": f"{self.settings.stream_base_url}/{stream_id}/whep",
        }
        try:
            if self._http_client is not None:
                response = await self._http_client.post(endpoint, json=request)
            else:
                async with httpx.AsyncClient(timeout=self.settings.timeout_seconds) as client:
                    response = await client.post(endpoint, json=request)
            response.raise_for_status()
            result = AIEndpointResponse.model_validate(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise AIProcessorUnavailableError("AI processor request failed") from exc

        db.add(
            AIResultEvent(
                event_id=f"ai-{uuid4()}",
                stream_id=stream_id,
                group_id=group_id,
                processor_id=processor_id,
                schema_version=result.schema_version,
                payload_json=json.dumps(result.model_dump(by_alias=True, mode="json"), separators=(",", ":")),
                generated_at=result.generated_at,
                stored_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return result
