# Secure Authentication System Frontend

## Start Sequentially

Run the services in this order:

### 1. Start backend

From the `auth-backend` directory:

```bash
yarn start
```

### 2. Start frontend

From the `auth-frontend` directory:

```bash
npm run dev
```

### 3. Start face verification

From the `face-embedding-service` directory:

```bash
cd face-embedding-service
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8001
```

## Default Local URLs

- Frontend: `http://localhost:3000`
- Face verification service: `http://127.0.0.1:8001`
