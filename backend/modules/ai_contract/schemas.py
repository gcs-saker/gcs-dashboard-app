from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


SchemaVersion = Literal["ai.detection.v1alpha1"]
AI_CONTRACT_SCHEMA_VERSION: SchemaVersion = "ai.detection.v1alpha1"


class ContractBaseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class FrameReference(ContractBaseModel):
    stream_id: str = Field(alias="streamId", min_length=1)
    frame_id: str | None = Field(default=None, alias="frameId", min_length=1)
    captured_at: AwareDatetime = Field(alias="capturedAt")
    pts_ms: int | None = Field(default=None, alias="ptsMs", ge=0)


class BoundingBox(ContractBaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)

    @model_validator(mode="after")
    def ensure_box_stays_inside_frame(self) -> "BoundingBox":
        if self.x + self.width > 1.0:
            raise ValueError("bbox x + width must be <= 1.0")
        if self.y + self.height > 1.0:
            raise ValueError("bbox y + height must be <= 1.0")
        return self


class AIEndpointRequest(ContractBaseModel):
    schema_version: SchemaVersion = Field(default=AI_CONTRACT_SCHEMA_VERSION, alias="schemaVersion")
    stream_id: str = Field(alias="streamId", min_length=1)
    frame: FrameReference
    image_url: str | None = Field(default=None, alias="imageUrl", min_length=1)
    frame_data_base64: str | None = Field(default=None, alias="frameDataBase64", min_length=1)

    @model_validator(mode="after")
    def ensure_frame_belongs_to_stream(self) -> "AIEndpointRequest":
        if self.frame.stream_id != self.stream_id:
            raise ValueError("frame.streamId must match streamId")
        if not self.image_url and not self.frame_data_base64:
            raise ValueError("imageUrl or frameDataBase64 is required")
        return self


class DetectionResult(ContractBaseModel):
    label: str = Field(min_length=1)
    bbox: BoundingBox
    confidence: float = Field(ge=0.0, le=1.0)
    risk_score: float = Field(alias="riskScore", ge=0.0, le=1.0)
    track_id: str | None = Field(default=None, alias="trackId", min_length=1)


class AIEndpointResponse(ContractBaseModel):
    schema_version: SchemaVersion = Field(default=AI_CONTRACT_SCHEMA_VERSION, alias="schemaVersion")
    stream_id: str = Field(alias="streamId", min_length=1)
    frame: FrameReference
    generated_at: AwareDatetime = Field(alias="generatedAt")
    risk_score: float = Field(alias="riskScore", ge=0.0, le=1.0)
    report_text: str = Field(alias="reportText", min_length=1)
    detections: list[DetectionResult] = Field(default_factory=list)


class AIEndpointErrorDetail(ContractBaseModel):
    code: str = Field(min_length=1)
    message: str = Field(min_length=1)
    retryable: bool = False


class AIEndpointErrorResponse(ContractBaseModel):
    schema_version: SchemaVersion = Field(default=AI_CONTRACT_SCHEMA_VERSION, alias="schemaVersion")
    stream_id: str | None = Field(default=None, alias="streamId", min_length=1)
    frame: FrameReference | None = None
    generated_at: AwareDatetime = Field(alias="generatedAt")
    error: AIEndpointErrorDetail
