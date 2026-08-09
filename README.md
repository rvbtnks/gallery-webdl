# Gallery-DL WebUI

A lightweight web interface for managing gallery-dl and yt-dlp download queues with concurrency control, live logging, and task management.

## Features

- **Queue Management**: Add, pause, resume, bump, restart, and delete download tasks
- **Dual Support**: Handles both gallery-dl and yt-dlp downloads
- **Live Logging**: Real-time output visible via `docker logs`
- **Concurrency Control**: Configurable number of simultaneous downloads (one per site)
- **Task Actions**:
  - Click row to restart failed/completed tasks
  - Bump tasks to top of queue
  - Delete unwanted tasks
  - Copy URLs easily without triggering actions
  - Export queue to clipboard
  - Clear completed or all tasks
- **Version Management**: Update gallery-dl and yt-dlp directly from the UI with version display
- **Failure Detection**: Identifies silent failures (e.g., 0 files downloaded, HTTP errors)
- **Configuration Editor**: Built-in JSON editor for gallery-dl configuration
- **Dark Mode**: Toggle dark/light theme

## Quick Start

### Docker (Pre-built Image)

Pull and run the pre-built image from Docker Hub:

```bash
docker run -d \
  --name gallery-webui \
  -p 8765:5000 \
  -v /path/to/media:/media \
  -v /path/to/config:/app/data \
  -e MAX_CONCURRENT=2 \
  --restart unless-stopped \
  your-dockerhub-username/gallery-webui:latest
```

Update the volume paths:
- `/path/to/media`: Where downloaded files will be stored
- `/path/to/config`: Where database and configuration files are stored

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  gallery-dl-webui:
    build:
      context: .
      dockerfile: Dockerfile
    # Or use pre-built image:
    # image: your-dockerhub-username/gallery-webui:latest
    container_name: gallery-webui
    ports:
      - "8765:5000"
    volumes:
      - /path/to/media:/media
      - /path/to/config:/app/data
    environment:
      - MAX_CONCURRENT=2
    restart: unless-stopped
```

Update the volume paths:
- `/path/to/media`: Where downloaded files will be stored
- `/path/to/config`: Where database and configuration files are stored

Then run:

```bash
docker compose up -d
```

Access the web interface at `http://localhost:8765`

### Viewing Live Logs

To see real-time download progress and errors:

```bash
docker logs -f gallery-webui
```

This shows verbose gallery-dl output including files being downloaded, errors, and completion status.

### Running Without Docker

```bash
# Install dependencies
pip install flask apscheduler gallery-dl yt-dlp

# Run the application
python app.py
```

Access the web interface at `http://localhost:5000`

## Usage

1. **Add Downloads**: Paste URLs in the input field and click "Add URLs"
2. **Manage Queue**:
   - Click a task row to restart it
   - Click ⬆️ to bump a task to the top
   - Click 🗑️ to delete a task
   - Click 📋 to copy the URL
3. **Pause/Resume**: Use the pause button to stop new downloads after the current one finishes
4. **Update Tools**: Use the sidebar buttons to update gallery-dl or yt-dlp
5. **Export Queue**: Click "Export Queue" to copy all queued URLs to clipboard
6. **Clear Tasks**: Use "Clear Completed" or "Clear All" buttons to clean up the queue
7. **Configure gallery-dl**: Open Settings → "Configure gallery-dl" to edit extractor, downloader, and site-specific settings
8. **Dark Mode**: Toggle dark mode in the Settings sidebar

## Configuration

The application stores its database and settings in `/app/data` (mapped to your config volume). Downloaded media is saved to `/media` (mapped to your media volume).

### Environment Variables

- `MAX_CONCURRENT`: Maximum number of simultaneous downloads (default: 2)

### gallery-dl Configuration

Configure gallery-dl options through the built-in configuration editor or by placing a `gallery-dl.json` file in the config directory. The configuration supports:

- **Extractor Settings**: Base directory, filename patterns, and other extractor-wide options
- **Downloader Settings**: Retries, timeout, rate limits, and download behavior
- **Site-Specific Settings**: Per-site configuration for custom behavior

## GitHub Actions (CI/CD)

This repository includes a GitHub Actions workflow for automatically building and pushing Docker images to Docker Hub on pushes to the `main` branch.

To enable automatic builds:

1. Go to your repository's **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Your Docker Hub access token

The workflow will push images tagged as `your-username/gallery-webui:latest`.

## Troubleshooting

- **Downloads not starting**: Check `docker logs` for errors
- **Silent failures**: The UI will show "failed : no files downloaded" or specific error codes like "failed : 403"
- **Permission issues**: Ensure the media and config directories are writable by the docker user
- **Site not downloading**: Only one download per site domain is allowed at a time; wait for the active download to complete
