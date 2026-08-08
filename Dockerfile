FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python packages
RUN pip install --no-cache-dir --break-system-packages \
    flask \
    apscheduler \
    gallery-dl \
    yt-dlp

# Create necessary directories
RUN mkdir -p /app/data /media /app/templates /app/static

# Copy application files
COPY app.py /app/
COPY index.html /app/templates/
COPY style.css /app/static/
COPY script.js /app/static/

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]
