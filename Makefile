# Python 3.11+ tələb olunur.
PYTHON ?= $(shell command -v python3.12 || command -v python3.11 || command -v python3)
VENV := backend/.venv
PIP := $(VENV)/bin/pip
API_URL ?= http://localhost:8000

.PHONY: help install dev backend frontend test simulate scenario reset loadtest docker-up docker-down clean

help:
	@echo "make install     - backend (venv) və frontend asılılıqlarını qur"
	@echo "make dev         - backend (8000) + frontend (5173) birlikdə işə sal"
	@echo "make test        - pytest testləri"
	@echo "make scenario    - «Zəlzələ ssenarisi»ni işə sal (~2 dəq)"
	@echo "make simulate ARGS='sos --zone yasamal --count 4'"
	@echo "make reset       - demo məlumatını sıfırla"
	@echo "make loadtest    - saxta SOS axını ilə yük sınağı (ARGS='--requests 60000 --connections 500')"
	@echo "make docker-up   - Docker ilə işə sal"

$(VENV)/bin/uvicorn: backend/requirements.txt backend/requirements-dev.txt
	$(PYTHON) -m venv $(VENV)
	$(PIP) install -q -r backend/requirements-dev.txt
	@touch $@

frontend/node_modules: frontend/package.json
	cd frontend && npm install --no-audit --no-fund
	@touch $@

install: $(VENV)/bin/uvicorn frontend/node_modules

backend: $(VENV)/bin/uvicorn
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend: frontend/node_modules
	cd frontend && npm run dev

# Hər iki proses eyni terminalda; Ctrl+C ikisini də dayandırır.
dev: install
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

test: $(VENV)/bin/uvicorn
	cd backend && .venv/bin/python -m pytest -q

simulate:
	$(PYTHON) scripts/simulate.py --api-url $(API_URL) $(ARGS)

scenario:
	$(PYTHON) scripts/simulate.py --api-url $(API_URL) scenario

reset:
	$(PYTHON) scripts/simulate.py --api-url $(API_URL) reset

# Saxta SOS axını: orta cavab müddəti 399 ms-dən azdırsa 0, yoxsa 1 qaytarır.
loadtest:
	$(PYTHON) scripts/loadtest.py --api-url $(API_URL) $(ARGS)

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf $(VENV) frontend/node_modules frontend/dist backend/data backend/.pytest_cache
