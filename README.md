# Gallery-DL WebUI

A lightweight web interface for managing gallery-dl and yt-dlp download queues with concurrency control, live logging, and task management.

## Features

- **Queue Management**: Add, pause, resume, bump, and delete download tasks
- **Dual Support**: Handles both gallery-dl and yt-dlp downloads
- **Live Logging**: Real-time output visible via `docker logs`
- **Concurrency Control**: Configurable number of simultaneous downloads
- **Task Actions**:
  - Click row to restart failed/completed tasks
  - Bump tasks to top of queue
  - Delete unwanted tasks
  - Copy URLs easily without triggering actions
- **Version Management**: Update gallery-dl and yt-dlp directly from the UI with version display
- **Failure Detection**: Identifies silent failures (e.g., 0 files downloaded, HTTP errors)

## Quick Start

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3'
services:
  gallery-dl-webui:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8765:5000"
    volumes:
      - /path/to/media:/media
      - /path/to/config:/app/data
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

## Usage

1. **Add Downloads**: Paste URLs in the input field and click "Add to Queue"
2. **Manage Queue**:
   - Click a task row to restart it
   - Click ⬆️ to bump a task to the top
   - Click 🔴 to delete a task
   - Click 📋 to copy the URL
3. **Pause/Resume**: Use the pause button to stop new downloads after the current one finishes
4. **Update Tools**: Use the sidebar buttons to update gallery-dl or yt-dlp

## Configuration

The application stores its database and settings in `/app/data` (mapped to your config volume). Downloaded media is saved to `/media` (mapped to your media volume).

Configure gallery-dl options by placing a `config.json` in the config directory if needed, though defaults work for most cases.

## Troubleshooting

- **Downloads not starting**: Check `docker logs` for errors
- **Silent failures**: The UI will show "failed : no files downloaded" or specific error codes like "failed : 403"
- **Permission issues**: Ensure the media and config directories are writable by the docker user
