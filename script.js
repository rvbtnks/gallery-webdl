// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle        = document.getElementById('menu-toggle');
  const sidebar           = document.getElementById('sidebar');
  const darkModeToggle    = document.getElementById('dark-mode-toggle');
  const addUrlsBtn        = document.getElementById('add-urls-button');
  const refreshButton     = document.getElementById('refresh-button');
  const clearCompletedBtn = document.getElementById('clear-completed-button');
  const clearAllBtn       = document.getElementById('clear-all-button');
  const exportQueueBtn    = document.getElementById('export-queue-button');
  const concurrentInput   = document.getElementById('concurrent-sites');
  const urlInput          = document.getElementById('url-input');
  const queueList         = document.getElementById('queue-list');
  const updateGalleryDlBtn = document.getElementById('update-gallery-dl');
  const updateStatus      = document.getElementById('update-status');

  // Config modal elements
  const openConfigBtn     = document.getElementById('open-config-btn');
  const configModal       = document.getElementById('config-modal');
  const modalCloseBtn     = configModal.querySelector('.modal-close-btn');
  const tabBtns           = configModal.querySelectorAll('.tab-btn');
  const configExtractor   = document.getElementById('config-extractor');
  const configDownloader  = document.getElementById('config-downloader');
  const siteDropdown      = document.getElementById('site-dropdown');
  const addSiteBtn        = document.getElementById('add-site-btn');
  const siteConfigs       = document.getElementById('site-configs');
  const saveConfigBtn     = document.getElementById('save-config-btn');
  const configStatus      = document.getElementById('config-status');

  // Polling intervals
  const ACTIVE_POLL_INTERVAL = 3000;
  const IDLE_POLL_INTERVAL = 30000;
  let autoRefreshTimer = null;
  let hasActiveItems = false;

  // Store site configs in memory
  let loadedSiteConfigs = {};

  // Known extractors that have their own settings (not global)
  const EXTRACTOR_GLOBAL_KEYS = ['base-directory', 'filename', 'directory', 'skip', 'sleep', 'sleep-request', 'sleep-extractor', 'retries', 'timeout', 'verify', 'download', 'image-range', 'chapter-range', 'archive', 'archive-format', 'postprocessors', 'keywords', 'keywords-default', 'category-transfer', 'parent-directory', 'parent-metadata', 'path-restrict', 'path-replace', 'path-remove', 'extension-map'];

  // Toggle sidebar
  menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.querySelector('.close-menu-btn')
    .addEventListener('click', () => sidebar.classList.remove('open'));

  // Dark mode toggle
  function applyDarkMode(enabled) {
    document.body.classList.toggle('dark-mode', enabled);
    localStorage.setItem('darkMode', enabled ? '1' : '0');
  }

  const savedDarkMode = localStorage.getItem('darkMode') === '1';
  darkModeToggle.checked = savedDarkMode;
  applyDarkMode(savedDarkMode);

  darkModeToggle.addEventListener('change', () => {
    applyDarkMode(darkModeToggle.checked);
  });

  // Fetch & render queue status
  async function refreshStatus() {
    try {
      const resp = await fetch('/status');
      const data = await resp.json();
      queueList.innerHTML = '';

      const activeStatuses = ['pending', 'queued', 'active'];
      hasActiveItems = data.downloads.some(d => activeStatuses.includes(d.status));

      data.downloads.forEach(d => {
        const li = document.createElement('li');
        li.className = 'queue-item';
        li.dataset.id = d.id;
        li.dataset.status = d.status;

        const indicator = document.createElement('span');
        indicator.className = `status-indicator status-${d.status}`;
        li.appendChild(indicator);

        const content = document.createElement('div');
        content.className = 'queue-content';

        const urlSpan = document.createElement('span');
        urlSpan.className = 'queue-url';
        urlSpan.textContent = d.url;
        urlSpan.title = d.url;
        content.appendChild(urlSpan);

        const statusSpan = document.createElement('span');
        statusSpan.className = `queue-status-text status-text-${d.status}`;
        statusSpan.textContent = d.status;
        content.appendChild(statusSpan);

        li.appendChild(content);
        queueList.appendChild(li);
      });

      updatePollingInterval();
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }

  function updatePollingInterval() {
    const interval = hasActiveItems ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
    }
    autoRefreshTimer = setInterval(refreshStatus, interval);
  }

  // Add URLs handler
  addUrlsBtn.addEventListener('click', async () => {
    const urls = urlInput.value.trim();
    if (!urls) return;

    try {
      const resp = await fetch('/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      const data = await resp.json();
      if (data.success) {
        urlInput.value = '';
        refreshStatus();
      }
    } catch (err) {
      console.error('Failed to add URLs:', err);
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addUrlsBtn.click();
    }
  });

  refreshButton.onclick = refreshStatus;

  clearCompletedBtn.onclick = async () => {
    await fetch('/clear-completed', { method: 'POST' });
    refreshStatus();
  };

  clearAllBtn.onclick = async () => {
    if (confirm('Clear all downloads from the queue?')) {
      await fetch('/clear-all', { method: 'POST' });
      refreshStatus();
    }
  };

  exportQueueBtn.onclick = () => {
    window.location = '/export-queue';
  };

  concurrentInput.addEventListener('change', () => {
    fetch('/set-concurrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concurrent: parseInt(concurrentInput.value) || 3 })
    });
  });

  // Update gallery-dl button
  updateGalleryDlBtn.addEventListener('click', async () => {
    updateGalleryDlBtn.disabled = true;
    updateStatus.textContent = 'Updating...';
    updateStatus.className = '';

    try {
      const resp = await fetch('/update-gallery-dl', { method: 'POST' });
      const data = await resp.json();

      if (data.success) {
        updateStatus.textContent = `Updated to v${data.version}`;
        updateStatus.className = 'update-success';
      } else {
        updateStatus.textContent = 'Update failed';
        updateStatus.className = 'update-error';
        console.error('Update output:', data.output);
      }
    } catch (err) {
      updateStatus.textContent = 'Update failed';
      updateStatus.className = 'update-error';
      console.error('Failed to update gallery-dl:', err);
    } finally {
      updateGalleryDlBtn.disabled = false;
    }
  });

  // Click failed item to re-queue
  queueList.addEventListener('click', async (e) => {
    const li = e.target.closest('li');
    if (li && li.dataset.status === 'failed') {
      try {
        const resp = await fetch(`/queue/${li.dataset.id}`, { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
          refreshStatus();
        }
      } catch (err) {
        console.error('Failed to requeue item:', err);
      }
    }
  });

  // =====================
  // Config Modal Logic
  // =====================

  // Open modal
  openConfigBtn.addEventListener('click', async () => {
    sidebar.classList.remove('open');
    configModal.classList.add('open');
    await loadConfig();
    await loadSitesList();
  });

  // Close modal
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
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Load config from server
  async function loadConfig() {
    try {
      const resp = await fetch('/config');
      const config = await resp.json();

      // Separate global extractor settings from site-specific ones
      const extractor = config.extractor || {};
      const globalExtractor = {};
      loadedSiteConfigs = {};

      for (const key in extractor) {
        if (EXTRACTOR_GLOBAL_KEYS.includes(key)) {
          globalExtractor[key] = extractor[key];
        } else if (typeof extractor[key] === 'object' && !Array.isArray(extractor[key])) {
          // It's a site-specific config
          loadedSiteConfigs[key] = extractor[key];
        } else {
          // Unknown key, keep it in global
          globalExtractor[key] = extractor[key];
        }
      }

      configExtractor.value = JSON.stringify(globalExtractor, null, 2);
      configDownloader.value = JSON.stringify(config.downloader || {}, null, 2);

      // Render site configs
      renderSiteConfigs();
    } catch (err) {
      console.error('Failed to load config:', err);
      configStatus.textContent = 'Failed to load config';
      configStatus.className = 'status-error';
    }
  }

  // Load sites dropdown
  async function loadSitesList() {
    try {
      const resp = await fetch('/config/sites');
      const data = await resp.json();
      
      siteDropdown.innerHTML = '<option value="">Select a site...</option>';
      data.sites.forEach(site => {
        // Don't show sites already configured
        if (!loadedSiteConfigs[site]) {
          const opt = document.createElement('option');
          opt.value = site;
          opt.textContent = site;
          siteDropdown.appendChild(opt);
        }
      });
    } catch (err) {
      console.error('Failed to load sites list:', err);
    }
  }

  // Render site config editors
  function renderSiteConfigs() {
    siteConfigs.innerHTML = '';

    for (const site in loadedSiteConfigs) {
      const section = document.createElement('div');
      section.className = 'site-config-section';
      section.dataset.site = site;

      const header = document.createElement('div');
      header.className = 'site-config-header';
      
      const title = document.createElement('h4');
      title.textContent = site;
      header.appendChild(title);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn danger btn-sm';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        delete loadedSiteConfigs[site];
        renderSiteConfigs();
        loadSitesList(); // Re-add to dropdown
      });
      header.appendChild(removeBtn);

      section.appendChild(header);

      const textarea = document.createElement('textarea');
      textarea.className = 'config-editor site-editor';
      textarea.spellcheck = false;
      textarea.value = JSON.stringify(loadedSiteConfigs[site], null, 2);
      textarea.dataset.site = site;
      
      // Update in-memory on change
      textarea.addEventListener('input', () => {
        try {
          loadedSiteConfigs[site] = JSON.parse(textarea.value);
          textarea.classList.remove('invalid');
        } catch {
          textarea.classList.add('invalid');
        }
      });

      section.appendChild(textarea);
      siteConfigs.appendChild(section);
    }

    if (Object.keys(loadedSiteConfigs).length === 0) {
      siteConfigs.innerHTML = '<p class="no-sites">No site-specific configurations. Use the dropdown above to add one.</p>';
    }
  }

  // Add site button
  addSiteBtn.addEventListener('click', () => {
    const site = siteDropdown.value;
    if (!site) return;

    loadedSiteConfigs[site] = {};
    renderSiteConfigs();
    loadSitesList();
  });

  // Save config
  saveConfigBtn.addEventListener('click', async () => {
    configStatus.textContent = '';
    configStatus.className = '';

    let globalExtractor, downloader;

    // Parse global extractor
    try {
      globalExtractor = JSON.parse(configExtractor.value);
    } catch {
      configStatus.textContent = 'Invalid JSON in Extractor Settings';
      configStatus.className = 'status-error';
      return;
    }

    // Parse downloader
    try {
      downloader = JSON.parse(configDownloader.value);
    } catch {
      configStatus.textContent = 'Invalid JSON in Downloader Settings';
      configStatus.className = 'status-error';
      return;
    }

    // Validate site configs
    for (const site in loadedSiteConfigs) {
      const textarea = siteConfigs.querySelector(`textarea[data-site="${site}"]`);
      if (textarea) {
        try {
          loadedSiteConfigs[site] = JSON.parse(textarea.value);
        } catch {
          configStatus.textContent = `Invalid JSON in ${site} config`;
          configStatus.className = 'status-error';
          return;
        }
      }
    }

    // Merge everything
    const extractor = { ...globalExtractor, ...loadedSiteConfigs };

    const config = {
      extractor,
      downloader
    };

    try {
      const resp = await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await resp.json();

      if (data.success) {
        configStatus.textContent = 'Config saved!';
        configStatus.className = 'status-success';
      } else {
        configStatus.textContent = data.error || 'Failed to save';
        configStatus.className = 'status-error';
      }
    } catch (err) {
      configStatus.textContent = 'Failed to save config';
      configStatus.className = 'status-error';
      console.error('Failed to save config:', err);
    }
  });

  // Initial load
  refreshStatus();
});
