FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# SQLite faylı konteynerdən kənar həcmdə saxlanılır.
ENV DATABASE_URL=sqlite:////data/evac.db
VOLUME /data
EXPOSE 8000

# Tək worker: hadisə şini və WebSocket qeydiyyatı proses daxilindədir.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
