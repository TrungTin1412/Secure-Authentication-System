from __future__ import annotations

import base64
import io
import os
from functools import lru_cache
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from insightface.app import FaceAnalysis
from PIL import Image
from pydantic import BaseModel, Field


class FaceCaptureRequest(BaseModel):
    angle: str = Field(..., examples=["STRAIGHT"])
    imageDataUrl: str
    capturedAt: str


class BatchEmbedRequest(BaseModel):
    samples: List[FaceCaptureRequest]


class FaceEmbeddingResponse(BaseModel):
    angle: str
    capturedAt: str
    vector: List[float]
    qualityScore: Optional[float] = None


app = FastAPI(title="ArcFace Embedding Service", version="1.0.0")


@lru_cache(maxsize=1)
def get_face_app() -> FaceAnalysis:
    model_name = os.getenv("ARCFACE_MODEL_NAME", "buffalo_l")
    det_size = int(os.getenv("ARCFACE_DET_SIZE", "640"))
    ctx_id = int(os.getenv("ARCFACE_CTX_ID", "-1"))

    face_app = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
    face_app.prepare(ctx_id=ctx_id, det_size=(det_size, det_size))
    return face_app


def decode_image_data_url(image_data_url: str) -> np.ndarray:
    if "," not in image_data_url:
        raise HTTPException(status_code=400, detail="Invalid image data URL")

    try:
        _, encoded = image_data_url.split(",", 1)
        image_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to decode image data") from exc

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unsupported image format") from exc

    rgb = np.array(image)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def estimate_quality(image_bgr: np.ndarray) -> float:
    grayscale = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    laplacian_variance = cv2.Laplacian(grayscale, cv2.CV_64F).var()
    normalized = min(max(laplacian_variance / 400.0, 0.0), 1.0)
    return round(float(normalized), 4)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/embed-batch", response_model=List[FaceEmbeddingResponse])
def embed_batch(payload: BatchEmbedRequest):
    if not payload.samples:
        raise HTTPException(status_code=400, detail="At least one face capture is required")

    face_app = get_face_app()
    results: List[FaceEmbeddingResponse] = []

    for sample in payload.samples:
        image_bgr = decode_image_data_url(sample.imageDataUrl)
        faces = face_app.get(image_bgr)

        if not faces:
            raise HTTPException(
                status_code=400,
                detail=f"No face detected for angle {sample.angle}",
            )

        # Use the largest detected face in the frame.
        face = max(
            faces,
            key=lambda item: (item.bbox[2] - item.bbox[0]) * (item.bbox[3] - item.bbox[1]),
        )

        embedding = face.embedding.tolist()
        results.append(
            FaceEmbeddingResponse(
                angle=sample.angle,
                capturedAt=sample.capturedAt,
                vector=[float(value) for value in embedding],
                qualityScore=estimate_quality(image_bgr),
            )
        )

    return results
