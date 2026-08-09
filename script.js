document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const addBtn = document.getElementById('add-urls-button');
    const refreshBtn = document.getElementById('refresh-button');
    const clearCompletedBtn = document.getElementById('clear-completed-button');
    const clearAllBtn = document.getElementById('clear-all-button');
    const exportBtn = document.getElementById('export-queue-button');
    const queueList = document.getElementById('queue-list');
    
    // Sidebar elements
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const closeMenuBtn = document.querySelector('.close-menu-btn');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const concurrentSitesInput = document.getElementById('concurrent-sites');
    const openConfigBtn = document.getElementById('open-config-btn');
    const updateGalleryDlBtn = document.getElementById('update-gallery-dl');
    const updateStatus = document.getElementById('update-status');
    
    // Config modal elements
    const configModal = document.getElementById('config-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const configExtractor = document.getElementById('config-extractor');
    const configDownloader = document.getElementById('config-downloader');
    const siteDropdown = document.getElementById('site-dropdown');
    const addSiteBtn = document.getElementById('add-site-btn');
    const siteConfigs = document.getElementById('site-configs');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const configStatus = document.getElementById('config-status');

    // Load initial state
    loadTasks();
    loadDarkMode();
    
    // Sidebar toggle
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('open');
    });
    
    closeMenuBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });
    
    // Dark mode toggle
    darkModeToggle.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('dark-mode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('dark-mode', 'false');
        }
    });
    
    function loadDarkMode() {
        const isDark = localStorage.getItem('dark-mode') === 'true';
        darkModeToggle.checked = isDark;
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
    }
    
    // Config modal
    openConfigBtn.addEventListener('click', () => {
        configModal.classList.add('open');
        loadConfig();
    });
    
    modalCloseBtn.addEventListener('click', () => {
        configModal.classList.remove('open');
    });
    
    configModal.addEventListener('click', (e) => {
        if (e.target === configModal) {
            configModal.classList.remove('open');
        }
    });
    
    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
    
    // Update gallery-dl
    updateGalleryDlBtn.addEventListener('click', () => {
        updateStatus.textContent = 'Updating...';
        updateStatus.className = '';
        
        fetch('/api/update-gallery-dl', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                updateStatus.textContent = `Updated to ${data.version}`;
                updateStatus.className = 'update-success';
            } else {
                updateStatus.textContent = 'Update failed';
                updateStatus.className = 'update-error';
            }
        })
        .catch(() => {
            updateStatus.textContent = 'Update failed';
            updateStatus.className = 'update-error';
        });
    });
    
    // Add URLs button
    addBtn.addEventListener('click', () => {
        const urls = urlInput.value.trim().split('\n').filter(u => u.trim());
        if (urls.length === 0) return;
        
        let added = 0;
        const promises = urls.map(url => 
            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() })
            }).then(res => res.json()).then(data => {
                if (data.success) added++;
            })
        );
        
        Promise.all(promises).then(() => {
            urlInput.value = '';
            loadTasks();
        });
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', loadTasks);
    
    // Clear completed button
    clearCompletedBtn.addEventListener('click', () => {
        fetch('/api/tasks')
        .then(res => res.json())
        .then(tasks => {
            const completedIds = tasks.filter(t => t.status === 'completed').map(t => t.id);
            const promises = completedIds.map(id => 
                fetch(`/api/task/${id}/delete`, { method: 'POST' })
            );
            Promise.all(promises).then(loadTasks);
        });
    });
    
    // Clear all button
    clearAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all tasks?')) {
            fetch('/api/tasks')
            .then(res => res.json())
            .then(tasks => {
                const promises = tasks.map(t => 
                    fetch(`/api/task/${t.id}/delete`, { method: 'POST' })
                );
                Promise.all(promises).then(loadTasks);
            });
        }
    });
    
    // Export queue button
    exportBtn.addEventListener('click', () => {
        fetch('/api/tasks')
        .then(res => res.json())
        .then(tasks => {
            const pendingUrls = tasks.filter(t => t.status === 'pending').map(t => t.url).join('\n');
            const blob = new Blob([pendingUrls], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'queue-export.txt';
            a.click();
            URL.revokeObjectURL(url);
        });
    });
    
    // Config functions
    function loadConfig() {
        fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            configExtractor.value = JSON.stringify(config.extractor || {}, null, 2);
            configDownloader.value = JSON.stringify(config.downloader || {}, null, 2);
            loadSiteDropdown(config);
        })
        .catch(() => {
            configExtractor.value = '{}';
            configDownloader.value = '{}';
            siteConfigs.innerHTML = '<p class="no-sites">No site configurations</p>';
        });
    }
    
    function loadSiteDropdown(config) {
        fetch('/api/extractors')
        .then(res => res.json())
        .then(extractors => {
            siteDropdown.innerHTML = '<option value="">Select a site...</option>';
            extractors.forEach(ex => {
                const opt = document.createElement('option');
                opt.value = ex;
                opt.textContent = ex;
                siteDropdown.appendChild(opt);
            });
            
            // Show existing site configs
            const siteKeys = Object.keys(config.site || {});
            if (siteKeys.length > 0) {
                siteConfigs.innerHTML = '';
                siteKeys.forEach(site => {
                    createSiteConfigSection(site, config.site[site]);
                });
            } else {
                siteConfigs.innerHTML = '<p class="no-sites">No site configurations</p>';
            }
        });
    }
    
    function createSiteConfigSection(siteName, config) {
        const section = document.createElement('div');
        section.className = 'site-config-section';
        section.dataset.site = siteName;
        
        section.innerHTML = `
            <div class="site-config-header">
                <h4>${siteName}</h4>
                <button class="btn danger btn-sm remove-site-btn">Remove</button>
            </div>
            <textarea class="config-editor site-editor" spellcheck="false">${JSON.stringify(config, null, 2)}</textarea>
        `;
        
        section.querySelector('.remove-site-btn').addEventListener('click', () => {
            section.remove();
        });
        
        siteConfigs.appendChild(section);
    }
    
    addSiteBtn.addEventListener('click', () => {
        const site = siteDropdown.value;
        if (!site) return;
        
        if (document.querySelector(`.site-config-section[data-site="${site}"]`)) {
            alert('Site already configured');
            return;
        }
        
        createSiteConfigSection(site, {});
    });
    
    saveConfigBtn.addEventListener('click', () => {
        try {
            const extractor = JSON.parse(configExtractor.value || '{}');
            const downloader = JSON.parse(configDownloader.value || '{}');
            const site = {};
            
            document.querySelectorAll('.site-config-section').forEach(section => {
                const siteName = section.dataset.site;
                const textarea = section.querySelector('.site-editor');
                try {
                    site[siteName] = JSON.parse(textarea.value || '{}');
                } catch (e) {
                    alert(`Invalid JSON for site: ${siteName}`);
                    throw e;
                }
            });
            
            fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extractor, downloader, site })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    configStatus.textContent = 'Config saved successfully';
                    configStatus.className = 'status-success';
                } else {
                    configStatus.textContent = 'Failed to save config';
                    configStatus.className = 'status-error';
                }
            });
        } catch (e) {
            configStatus.textContent = 'Invalid JSON in config';
            configStatus.className = 'status-error';
        }
    });

    // Task Management
    function loadTasks() {
        fetch('/api/tasks')
        .then(res => res.json())
        .then(tasks => {
            queueList.innerHTML = '';
            tasks.forEach(task => {
                const li = document.createElement('li');
                li.className = 'queue-item';
                li.dataset.status = task.status;
                li.dataset.id = task.id;
                
                let statusText = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                if (task.status === 'failed' && task.fail_reason) {
                    statusText = `Failed: ${task.fail_reason}`;
                }
                
                const statusClass = `status-${task.status}`;
                const statusTextClass = `status-text-${task.status}`;
                
                li.innerHTML = `
                    <div class="status-indicator ${statusClass}"></div>
                    <div class="queue-content">
                        <div class="queue-url">${escapeHtml(task.url)}</div>
                        <div class="queue-status-text ${statusTextClass}">${statusText}</div>
                    </div>
                    <div class="task-actions">
                        <button class="action-btn bump-btn" title="Bump to Top" data-id="${task.id}">
                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" fill="currentColor"/></svg>
                        </button>
                        <button class="action-btn delete-btn" title="Delete Task" data-id="${task.id}">
                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" fill="currentColor"/></svg>
                        </button>
                        <button class="action-btn copy-btn" title="Copy URL" data-url="${task.url}">
                            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
                        </button>
                    </div>
                `;
                
                // Row click to restart failed/completed tasks
                li.addEventListener('click', (e) => {
                    if (e.target.closest('.action-btn')) return;
                    
                    if (task.status === 'failed' || task.status === 'completed') {
                        restartTask(task.id);
                    }
                });
                
                // Button listeners
                li.querySelector('.bump-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    bumpTask(task.id);
                });
                
                li.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                });
                
                li.querySelector('.copy-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyUrl(task.url);
                });
                
                queueList.appendChild(li);
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
            // Could show a toast notification here instead of alert
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
