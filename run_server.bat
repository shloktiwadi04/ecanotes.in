@echo off
echo ========================================================
echo Starting EcaNotes.in Server
echo Backend: FastAPI + SQLite + Persistent File Storage
echo URL: http://localhost:8000
echo ========================================================

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
) else if exist "%USERPROFILE%\.local\bin\uv.exe" (
    "%USERPROFILE%\.local\bin\uv.exe" run python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
) else (
    python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
)
pause
