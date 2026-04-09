# ArcFace Embedding Service

This service receives webcam images, runs `InsightFace` / `ArcFace`, and returns face embedding vectors to the Nest backend.

The backend expects this service at:

```env
ARCFACE_SERVICE_URL=http://127.0.0.1:8001
```

## Windows Setup

Open a new PowerShell terminal in the project root, then run:

```powershell
cd face-embedding-service
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

Important notes:
- Use `python -m uvicorn ...` instead of `uvicorn ...` on Windows.
- The first run may take longer because `InsightFace` can download model files.
- Keep this terminal open while testing register/login.

## Health Check

After starting the service, test it in another PowerShell terminal:

```powershell
Invoke-WebRequest http://127.0.0.1:8001/health
```

Expected result:

```json
{"status":"ok"}
```

You can also open this in your browser:

```text
http://127.0.0.1:8001/health
```

## Backend Setup

Make sure [auth-backend/.env](d:/IU/Top-up/Advanced%20Web%20Development/Project/auth-backend/.env) contains:

```env
ARCFACE_SERVICE_URL=http://127.0.0.1:8001
```

Then restart the Nest backend after changing `.env`.

## Endpoint

`POST /embed-batch`

Example request:

```json
{
  "samples": [
    {
      "angle": "STRAIGHT",
      "capturedAt": "2026-04-04T10:00:00.000Z",
      "imageDataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

Example response:

```json
[
  {
    "angle": "STRAIGHT",
    "capturedAt": "2026-04-04T10:00:00.000Z",
    "vector": [0.123, -0.456, 0.789],
    "qualityScore": 0.82
  }
]
```

## Environment Variables

Optional environment variables:

- `ARCFACE_MODEL_NAME`
  Default: `buffalo_l`
- `ARCFACE_DET_SIZE`
  Default: `640`
- `ARCFACE_CTX_ID`
  Default: `-1` for CPU

Example:

```powershell
$env:ARCFACE_MODEL_NAME="buffalo_l"
$env:ARCFACE_DET_SIZE="640"
$env:ARCFACE_CTX_ID="-1"
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

## Troubleshooting

### `uvicorn : The term 'uvicorn' is not recognized`

Cause:
- `uvicorn` is not installed yet, or it is not on `PATH`.

Fix:

```powershell
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

Do not rely on:

```powershell
uvicorn app:app --host 127.0.0.1 --port 8001
```

Prefer:

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

### `Unable to connect to the ArcFace embedding service`

Cause:
- The Python service is not running
- The backend `.env` does not match the service URL
- The backend was not restarted after updating `.env`

Fix:
1. Start the Python service
2. Check `http://127.0.0.1:8001/health`
3. Confirm `ARCFACE_SERVICE_URL=http://127.0.0.1:8001`
4. Restart the Nest backend

### `PayloadTooLargeError: request entity too large`

Cause:
- Camera images are too large for the backend body parser

Status:
- This project has already been updated to allow larger payloads in [main.ts](d:/IU/Top-up/Advanced%20Web%20Development/Project/auth-backend/src/main.ts)

Fix:
- Restart the backend after pulling the latest code

### `No face detected for angle ...`

Cause:
- The camera frame did not contain a clear face
- The face was too small, blurred, too dark, or turned too far

Fix:
- Improve lighting
- Move closer to the camera
- Keep only one face in frame
- Retake the capture with a clearer angle

### Package install fails for `insightface` or `onnxruntime`

Cause:
- Old `pip`
- Missing virtual environment isolation
- Python version mismatch

Fix:

```powershell
cd face-embedding-service
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

If it still fails, verify Python version:

```powershell
python --version
```

Recommended:
- Python `3.10.x`

### Service starts but register/login is still failing

Check in order:
1. `http://127.0.0.1:8001/health` returns success
2. The backend `.env` has the correct `ARCFACE_SERVICE_URL`
3. The Nest backend was restarted
4. The MySQL `users` table contains:
   - `face_embeddings_json`
   - `face_verification_threshold`
5. Registration is using `HIGH` security and completes all guided captures

## Quick Start

Use these 3 terminals:

Terminal 1:

```powershell
cd face-embedding-service
.\.venv\Scripts\activate
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

Terminal 2:

```powershell
cd auth-backend
npm run start:dev
```

Terminal 3:

```powershell
cd auth-frontend
npm run dev
```
