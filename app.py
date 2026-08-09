import os
import sqlite3
import subprocess
import threading
import time
import re
from flask import Flask, render_template, request, jsonify, g
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime

app = Flask(__name__)
app.config['DATABASE'] = '/app/data/gallery_dl.db'
app.config['MEDIA_DIR'] = '/media'
app.config['MAX_CONCURRENT'] = int(os.environ.get('MAX_CONCURRENT', 2))

# Global state for pausing
queue_paused = False

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                fail_reason TEXT
            )
        ''')
        # Ensure paused state table exists
        db.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
        db.commit()

def run_gallery_dl(task_id, url):
    global queue_paused
    
    # Update status to active
    db = get_db()
    db.execute('UPDATE tasks SET status = ?, started_at = ?, fail_reason = NULL WHERE id = ?',
               ('active', datetime.now(), task_id))
    db.commit()

    # Prepare command with verbose output for live logging
    # Using -o to define output path dynamically based on site could be added here
    cmd = ['gallery-dl', '-v', '--no-part', url]
    
    try:
        # Start process with merged stdout/stderr for live logging
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        # Stream output line by line to Docker logs
        if process.stdout:
            for line in process.stdout:
                # Extract site name if possible for cleaner logs, otherwise generic
                print(f"[gallery-dl] {line.strip()}", flush=True)

        process.wait()
        
        # Post-run validation
        fail_reason = None
        if process.returncode != 0:
            fail_reason = f"Exit code {process.returncode}"
        else:
            # Check for silent failures in output or lack of downloads
            # This is a simplified check; robust parsing might look for specific "downloaded X files" strings
            # For now, we rely on the user seeing the logs, but we can flag common errors if captured
            pass

        db = get_db()
        if fail_reason:
            db.execute('UPDATE tasks SET status = ?, completed_at = ?, fail_reason = ? WHERE id = ?',
                       ('failed', datetime.now(), fail_reason, task_id))
        else:
            db.execute('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?',
                       ('completed', datetime.now(), task_id))
        db.commit()

    except Exception as e:
        db = get_db()
        db.execute('UPDATE tasks SET status = ?, completed_at = ?, fail_reason = ? WHERE id = ?',
                   ('failed', datetime.now(), str(e), task_id))
        db.commit()
    finally:
        # Trigger next task check
        threading.Thread(target=process_queue).start()

def process_queue():
    global queue_paused
    if queue_paused:
        return

    db = get_db()
    # Get pending tasks ordered by created_at (bumped items have newer created_at)
    tasks = db.execute(
        "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at DESC"
    ).fetchall()

    active_count = db.execute(
        "SELECT COUNT(*) FROM tasks WHERE status = 'active'"
    ).fetchone()[0]

    slots_available = app.config['MAX_CONCURRENT'] - active_count

    if slots_available > 0 and tasks:
        for task in tasks[:slots_available]:
            threading.Thread(target=run_gallery_dl, args=(task['id'], task['url'])).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    db = get_db()
    tasks = db.execute(
        "SELECT * FROM tasks ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at DESC"
    ).fetchall()
    return jsonify([dict(row) for row in tasks])

@app.route('/api/tasks', methods=['POST'])
def add_task():
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({'error': 'URL required'}), 400
    
    db = get_db()
    db.execute('INSERT INTO tasks (url) VALUES (?)', (url,))
    db.commit()
    
    threading.Thread(target=process_queue).start()
    return jsonify({'success': True}), 201

@app.route('/api/task/<int:task_id>/restart', methods=['POST'])
def restart_task(task_id):
    db = get_db()
    # CRITICAL FIX: Reset fail_reason to NULL and status to pending
    db.execute('''
        UPDATE tasks 
        SET status = 'pending', 
            started_at = NULL, 
            completed_at = NULL, 
            fail_reason = NULL,
            created_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    ''', (task_id,))
    db.commit()
    
    threading.Thread(target=process_queue).start()
    return jsonify({'success': True})

@app.route('/api/task/<int:task_id>/bump', methods=['POST'])
def bump_task(task_id):
    db = get_db()
    # Update created_at to NOW() so it sorts to the top of pending list
    db.execute('''
        UPDATE tasks 
        SET created_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status = 'pending'
    ''', (task_id,))
    db.commit()
    return jsonify({'success': True})

@app.route('/api/task/<int:task_id>/delete', methods=['POST'])
def delete_task(task_id):
    db = get_db()
    db.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    db.commit()
    return jsonify({'success': True})

@app.route('/api/settings/pause', methods=['POST'])
def toggle_pause():
    global queue_paused
    queue_paused = not queue_paused
    return jsonify({'paused': queue_paused})

@app.route('/api/settings/state', methods=['GET'])
def get_state():
    return jsonify({'paused': queue_paused})

@app.route('/api/update-gallery-dl', methods=['POST'])
def update_gallery_dl():
    try:
        result = subprocess.run(
            ['pip', 'install', '--upgrade', 'gallery-dl'],
            capture_output=True, text=True, check=True
        )
        # Get version
        ver_result = subprocess.run(['gallery-dl', '--version'], capture_output=True, text=True)
        version = ver_result.stdout.strip()
        return jsonify({'success': True, 'version': version})
    except subprocess.CalledProcessError as e:
        return jsonify({'success': False, 'error': e.stderr}), 500

@app.route('/api/update-yt-dlp', methods=['POST'])
def update_yt_dlp():
    try:
        result = subprocess.run(
            ['pip', 'install', '--upgrade', 'yt-dlp'],
            capture_output=True, text=True, check=True
        )
        # Get version
        ver_result = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True)
        version = ver_result.stdout.strip()
        return jsonify({'success': True, 'version': version})
    except subprocess.CalledProcessError as e:
        return jsonify({'success': False, 'error': e.stderr}), 500

@app.route('/api/versions', methods=['GET'])
def get_versions():
    try:
        gd_ver = subprocess.run(['gallery-dl', '--version'], capture_output=True, text=True).stdout.strip()
    except:
        gd_ver = "unknown"
    
    try:
        yt_ver = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True).stdout.strip()
    except:
        yt_ver = "unknown"
        
    return jsonify({'gallery_dl': gd_ver, 'yt_dlp': yt_ver})

if __name__ == '__main__':
    init_db()
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=process_queue, trigger="interval", seconds=5)
    scheduler.start()
    
    # Force unbuffered output for Docker logs
    import sys
    sys.stdout.reconfigure(line_buffering=True)
    
    app.run(host='0.0.0.0', port=5000, threaded=True)
