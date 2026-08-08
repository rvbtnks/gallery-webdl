import os
import sqlite3
import subprocess
import threading
import time
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler

# Paths
DATA_DIR = '/app/data'
TEMPLATES_DIR = '/app/templates'
STATIC_DIR = '/app/static'
DB_PATH = os.path.join(DATA_DIR, 'gallery_dl_queue.db')
SETTINGS_PATH = os.path.join(DATA_DIR, 'settings.json')
CONFIG_PATH = os.path.join(DATA_DIR, 'gallery-dl.json')

os.makedirs(DATA_DIR, exist_ok=True)

# Thread-local storage for database connections
thread_local = threading.local()

def get_db_connection():
    """Get a thread-local database connection"""
    if not hasattr(thread_local, 'connection'):
        thread_local.connection = sqlite3.connect(
            DB_PATH,
            timeout=30.0,
            check_same_thread=False
        )
        thread_local.connection.execute('PRAGMA journal_mode=WAL')
        thread_local.connection.execute('PRAGMA synchronous=NORMAL')
        thread_local.connection.execute('PRAGMA cache_size=1000')
        thread_local.connection.execute('PRAGMA wal_autocheckpoint=1000')
    return thread_local.connection

def close_db_connection():
    """Close thread-local database connection"""
    if hasattr(thread_local, 'connection'):
        thread_local.connection.close()
        delattr(thread_local, 'connection')

def execute_db_query(query, params=(), fetch=False):
    """Execute database query with retry logic for locked DB"""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(query, params)
            
            if fetch:
                return cur.fetchall()
            else:
                conn.commit()
                return cur.lastrowid if cur.lastrowid else None
                
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                print(f"Database locked, retrying... (attempt {attempt + 1})")
                time.sleep(0.1 * (attempt + 1))
                continue
            else:
                print(f"Database error: {e}")
                raise

def checkpoint_database():
    """Force a WAL checkpoint"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        conn.close()
    except Exception as e:
        print(f"Error during checkpoint: {e}")

def extract_site(url):
    """Extract main domain from URL (e.g., 'twitter' from 'https://www.twitter.com/...')"""
    host = url.split('://')[-1].split('/')[0]
    if host.startswith('www.'):
        host = host[4:]
    parts = host.split('.')
    if len(parts) >= 2:
        return parts[-2]
    return parts[0]

# Initialize database
conn = sqlite3.connect(DB_PATH)
conn.execute('PRAGMA journal_mode=WAL')
conn.execute('PRAGMA synchronous=NORMAL')
c = conn.cursor()
c.execute('''
    CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        site TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        added_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_time TIMESTAMP
    )
''')
conn.commit()
conn.close()
checkpoint_database()

# Load or create settings
if os.path.exists(SETTINGS_PATH):
    with open(SETTINGS_PATH) as f:
        settings = json.load(f)
else:
    settings = {'concurrency': 3}
    with open(SETTINGS_PATH, 'w') as f:
        json.dump(settings, f)

def save_settings():
    with open(SETTINGS_PATH, 'w') as f:
        json.dump(settings, f)


def get_default_config():
    """Return default config structure"""
    return {
        "extractor": {
            "base-directory": "/media"
        },
        "downloader": {
            "retries": 3,
            "timeout": 30
        }
    }


def load_config():
    """Load config from file or return default"""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return get_default_config()
    return get_default_config()


def save_config(config):
    """Save config to file"""
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)

# Flask app
app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)


def run_gallery_dl(download_id, site, url):
    """Run gallery-dl command for a specific URL"""
    try:
        execute_db_query(
            'UPDATE downloads SET status = ? WHERE id = ?',
            ('active', download_id)
        )

        output_dir = '/media'
        cmd = ['gallery-dl', url, '-d', output_dir]
        if os.path.exists(CONFIG_PATH):
            cmd.extend(['-c', CONFIG_PATH])
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()

        status = 'completed' if process.returncode == 0 else 'failed'
        if status == 'failed':
            print(f"Download failed for {url}. Error: {stderr.decode('utf-8')}")

        execute_db_query(
            'UPDATE downloads SET status = ?, completed_time = ? WHERE id = ?',
            (status, datetime.now().isoformat(), download_id)
        )

    except Exception as e:
        print(f"Exception in run_gallery_dl for {url}: {e}")
        try:
            execute_db_query(
                'UPDATE downloads SET status = ?, completed_time = ? WHERE id = ?',
                ('failed', datetime.now().isoformat(), download_id)
            )
        except:
            pass
    finally:
        close_db_connection()


def process_queue():
    """Start downloads for pending items, one per site, up to concurrency limit."""
    try:
        # Get sites that are currently active
        active_rows = execute_db_query(
            "SELECT DISTINCT site FROM downloads WHERE status = 'active'",
            fetch=True
        )
        active_sites = {row[0] for row in active_rows}

        # Calculate available slots
        slots = settings.get('concurrency', 3) - len(active_sites)
        if slots <= 0:
            return

        # Get pending downloads
        pending = execute_db_query(
            "SELECT id, site, url FROM downloads WHERE status = 'pending' ORDER BY added_time ASC",
            fetch=True
        )

        # Start downloads for sites that aren't already running
        started = 0
        for download_id, site, url in pending:
            if started >= slots:
                break
            if site in active_sites:
                continue
            
            threading.Thread(
                target=run_gallery_dl,
                args=(download_id, site, url),
                daemon=True
            ).start()
            active_sites.add(site)
            started += 1

    except Exception as e:
        print(f"Error in process_queue: {e}")


# Scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(process_queue, 'interval', seconds=5)
scheduler.add_job(checkpoint_database, 'interval', minutes=15)
scheduler.start()


# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/add', methods=['POST'])
def add_urls():
    data = request.json
    urls = [u.strip() for u in data.get('urls', '').split('\n') if u.strip()]
    
    for url in urls:
        site = extract_site(url)
        execute_db_query(
            'INSERT INTO downloads (url, site, status, added_time) VALUES (?, ?, ?, ?)',
            (url, site, 'pending', datetime.now().isoformat())
        )
    
    return jsonify({'success': True, 'added': len(urls)})

@app.route('/status')
def status():
    rows = execute_db_query(
        'SELECT id, url, site, status, added_time, completed_time FROM downloads ORDER BY added_time ASC',
        fetch=True
    )
    downloads = [
        {
            'id': r[0],
            'url': r[1],
            'site': r[2],
            'status': r[3],
            'added_time': r[4],
            'completed_time': r[5]
        }
        for r in rows
    ]
    return jsonify({
        'downloads': downloads,
        'concurrency': settings.get('concurrency', 3)
    })

@app.route('/clear-completed', methods=['POST'])
def clear_completed():
    execute_db_query('DELETE FROM downloads WHERE status = "completed"')
    checkpoint_database()
    return jsonify({'success': True})

@app.route('/clear-all', methods=['POST'])
def clear_all():
    execute_db_query('DELETE FROM downloads')
    checkpoint_database()
    return jsonify({'success': True})

@app.route('/export-queue', methods=['GET'])
def export_queue():
    rows = execute_db_query(
        'SELECT url, status FROM downloads WHERE status IN ("pending", "failed") ORDER BY added_time ASC',
        fetch=True
    )
    lines = [f"{url}\t{status}" for url, status in rows]
    return app.response_class(
        '\n'.join(lines),
        mimetype='text/plain',
        headers={'Content-Disposition': 'attachment; filename=queue_export.txt'}
    )

@app.route('/set-concurrent', methods=['POST'])
def set_concurrent():
    data = request.get_json() or {}
    val = int(data.get('concurrent', settings.get('concurrency', 3)))
    settings['concurrency'] = val
    save_settings()
    return jsonify({'concurrent': settings['concurrency']})

@app.route('/queue/<int:download_id>', methods=['POST'])
def requeue(download_id):
    rows = execute_db_query(
        'SELECT status FROM downloads WHERE id = ?',
        (download_id,),
        fetch=True
    )
    if not rows or rows[0][0] != 'failed':
        return jsonify({'error': 'Not a failed task'}), 400
    
    execute_db_query(
        'UPDATE downloads SET status = "pending", completed_time = NULL WHERE id = ?',
        (download_id,)
    )
    return jsonify({'success': True, 'id': download_id})


@app.route('/update-gallery-dl', methods=['POST'])
def update_gallery_dl():
    """Update gallery-dl via pip"""
    try:
        cmd = ['pip', 'install', '--upgrade', 'gallery-dl', '--break-system-packages']
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(timeout=120)
        
        output = stdout.decode('utf-8') + stderr.decode('utf-8')
        success = process.returncode == 0
        
        # Get current version after update
        version_cmd = ['gallery-dl', '--version']
        version_process = subprocess.Popen(version_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        version_out, _ = version_process.communicate()
        version = version_out.decode('utf-8').strip() if version_process.returncode == 0 else 'unknown'
        
        return jsonify({
            'success': success,
            'output': output,
            'version': version
        })
    except subprocess.TimeoutExpired:
        process.kill()
        return jsonify({'success': False, 'output': 'Update timed out', 'version': 'unknown'})
    except Exception as e:
        return jsonify({'success': False, 'output': str(e), 'version': 'unknown'})


@app.route('/config', methods=['GET'])
def get_config():
    """Get current config"""
    config = load_config()
    return jsonify(config)


@app.route('/config', methods=['POST'])
def update_config():
    """Update config"""
    try:
        config = request.get_json()
        if not config:
            return jsonify({'success': False, 'error': 'No config provided'}), 400
        
        if not isinstance(config, dict):
            return jsonify({'success': False, 'error': 'Config must be a JSON object'}), 400
        
        save_config(config)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/config/sites', methods=['GET'])
def get_known_sites():
    """Return list of gallery-dl extractors from gallery-dl itself"""
    try:
        process = subprocess.run(
            ['gallery-dl', '--list-extractors'],
            capture_output=True,
            text=True,
            timeout=30
        )
        categories = set()
        for line in process.stdout.split('\n'):
            if 'Category:' in line:
                category = line.split('Category:')[1].split('-')[0].strip()
                categories.add(category)
        return jsonify({'sites': sorted(categories)})
    except Exception as e:
        print(f"Failed to get extractors: {e}")
        return jsonify({'sites': ['twitter', 'instagram', 'reddit', 'pixiv']})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
