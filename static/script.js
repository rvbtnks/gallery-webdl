document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const addBtn = document.getElementById('addBtn');
    const taskList = document.getElementById('taskList');
    const pauseBtn = document.getElementById('pauseBtn');
    const updateGalleryDlBtn = document.getElementById('updateGalleryDl');
    const updateYtDlpBtn = document.getElementById('updateYtDlp');
    const gdVersionSpan = document.getElementById('gd-version');
    const ytVersionSpan = document.getElementById('yt-version');
    const gdStatusSpan = document.getElementById('gd-status');
    const ytStatusSpan = document.getElementById('yt-status');
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');

    // Load initial state
    loadTasks();
    loadVersions();
    loadPauseState();

    // Sidebar Toggle
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // Add Task
    addBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;

        fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                urlInput.value = '';
                loadTasks();
            }
        });
    });

    // Pause/Resume
    pauseBtn.addEventListener('click', () => {
        fetch('/api/settings/pause', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            pauseBtn.textContent = data.paused ? 'Resume Queue' : 'Pause Queue';
            pauseBtn.classList.toggle('paused', data.paused);
        });
    });

    function loadPauseState() {
        fetch('/api/settings/state')
        .then(res => res.json())
        .then(data => {
            pauseBtn.textContent = data.paused ? 'Resume Queue' : 'Pause Queue';
            pauseBtn.classList.toggle('paused', data.paused);
        });
    }

    // Updates
    updateGalleryDlBtn.addEventListener('click', () => {
        gdStatusSpan.textContent = 'Updating...';
        fetch('/api/update-gallery-dl', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                gdStatusSpan.textContent = `Updated to ${data.version}`;
                gdVersionSpan.textContent = data.version;
            } else {
                gdStatusSpan.textContent = 'Update failed';
            }
        });
    });

    updateYtDlpBtn.addEventListener('click', () => {
        ytStatusSpan.textContent = 'Updating...';
        fetch('/api/update-yt-dlp', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                ytStatusSpan.textContent = `Updated to ${data.version}`;
                ytVersionSpan.textContent = data.version;
            } else {
                ytStatusSpan.textContent = 'Update failed';
            }
        });
    });

    function loadVersions() {
        fetch('/api/versions')
        .then(res => res.json())
        .then(data => {
            gdVersionSpan.textContent = data.gallery_dl;
            ytVersionSpan.textContent = data.yt_dlp;
        });
    }

    // Task Management
    function loadTasks() {
        fetch('/api/tasks')
        .then(res => res.json())
        .then(tasks => {
            taskList.innerHTML = '';
            tasks.forEach(task => {
                const div = document.createElement('div');
                div.className = 'task-item';
                
                let statusClass = `status-${task.status}`;
                let statusText = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                if (task.status === 'failed' && task.fail_reason) {
                    statusText = `Failed: ${task.fail_reason}`;
                }

                div.innerHTML = `
                    <div class="task-info">${escapeHtml(task.url)}</div>
                    <div class="task-status ${statusClass}">${statusText}</div>
                    <div class="task-actions">
                        <button class="action-btn bump-btn" title="Bump to Top" data-id="${task.id}">
                            <svg viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>
                        </button>
                        <button class="action-btn delete-btn" title="Delete Task" data-id="${task.id}">
                            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>
                        </button>
                        <button class="action-btn copy-btn" title="Copy URL" data-url="${task.url}">
                            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        </button>
                    </div>
                `;

                // Row click to restart
                div.addEventListener('click', (e) => {
                    // Ignore if clicking buttons
                    if (e.target.closest('.action-btn')) return;
                    
                    if (task.status === 'failed' || task.status === 'completed') {
                        restartTask(task.id);
                    }
                });

                // Button listeners
                div.querySelector('.bump-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    bumpTask(task.id);
                });

                div.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                });

                div.querySelector('.copy-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyUrl(task.url);
                });

                taskList.appendChild(div);
            });
        });
    }

    function restartTask(id) {
        fetch(`/api/task/${id}/restart`, { method: 'POST' })
        .then(() => loadTasks());
    }

    function bumpTask(id) {
        fetch(`/api/task/${id}/bump`, { method: 'POST' })
        .then(() => loadTasks());
    }

    function deleteTask(id) {
        if(confirm('Are you sure you want to delete this task?')) {
            fetch(`/api/task/${id}/delete`, { method: 'POST' })
            .then(() => loadTasks());
        }
    }

    function copyUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            alert('URL copied to clipboard!');
        });
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Auto-refresh every 5 seconds
    setInterval(loadTasks, 5000);
});
