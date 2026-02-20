FROM python:3.11-slim

# Install system deps
# Note: for LAN/TCP SCPI no VISA library is required.
# If you need USB/GPIB instruments, install libvisa or NI-VISA separately.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache)
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Copy application code
COPY app/ ./app/
COPY drivers/ ./drivers/
COPY scripts/ ./scripts/
COPY config/ ./config/

# Create buffer directory
RUN mkdir -p /app/buffer

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
