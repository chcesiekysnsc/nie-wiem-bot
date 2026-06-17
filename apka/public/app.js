// Global state variables
let availableDrives = [];
let scanResults = null;
let selectedItems = [];
let scanEventSource = null;
let moveEventSource = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  loadDrives();
  setupScanOptions();
  setupEventListeners();
  initCircularProgress();
});

// 1. Navigation handling
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-target');

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === targetId) {
          section.classList.add('active');
        }
      });
    });
  });
}

// 2. Fetch drives
async function loadDrives() {
  const container = document.getElementById('drives-container');
  const selectDest = document.getElementById('select-dest-drive');
  
  try {
    const res = await fetch('/api/drives');
    if (!res.ok) throw new Error('Błąd pobierania dysków');
    
    availableDrives = await res.json();
    container.innerHTML = '';
    selectDest.innerHTML = '';

    availableDrives.forEach(drive => {
      const isSystemDrive = drive.letter.toUpperCase() === 'C:';
      const usedSpace = drive.size - drive.free;
      const usagePercent = drive.size > 0 ? Math.round((usedSpace / drive.size) * 100) : 0;

      const card = document.createElement('div');
      card.className = `card drive-card`;
      card.innerHTML = `
        <div class="drive-info-row">
          <div class="drive-letter-badge">${drive.letter}</div>
          <div class="drive-details">
            <div class="drive-name">${drive.name}</div>
            <div class="drive-usage-text">${isSystemDrive ? 'Dysk Systemowy' : 'Dysk Docelowy'}</div>
          </div>
        </div>
        <div class="drive-progress-container">
          <div class="drive-progress-fill" style="width: ${usagePercent}%"></div>
        </div>
        <div class="drive-space-row">
          <div class="drive-free">Wolne: ${formatBytes(drive.free)}</div>
          <div class="drive-used">Zajęte: ${formatBytes(usedSpace)} / ${formatBytes(drive.size)}</div>
        </div>
      `;
      container.appendChild(card);

      if (!isSystemDrive) {
        const option = document.createElement('option');
        option.value = drive.letter;
        option.textContent = `${drive.letter} (${drive.name}) - Wolne: ${formatBytes(drive.free)}`;
        selectDest.appendChild(option);
      }
    });

    if (selectDest.options.length === 0 && availableDrives.length > 0) {
      const option = document.createElement('option');
      option.value = availableDrives[0].letter;
      option.textContent = `${availableDrives[0].letter} (Zalecany inny dysk niż systemowy)`;
      selectDest.appendChild(option);
    }
  } catch (err) {
    container.innerHTML = `<div class="alert alert-warning">Błąd pobierania informacji o dyskach: ${err.message}</div>`;
  }
}

// 3. Scan scope options layout toggle
function setupScanOptions() {
  const scanRadios = document.querySelectorAll('input[name="scan-type"]');
  const customPathContainer = document.getElementById('custom-path-container');

  scanRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'custom') {
        customPathContainer.style.display = 'block';
      } else {
        customPathContainer.style.display = 'none';
      }
    });
  });
}

// 4. Setup Event Listeners
function setupEventListeners() {
  const btnStartScan = document.getElementById('btn-start-scan');
  const btnStartMigration = document.getElementById('btn-start-migration');

  btnStartScan.addEventListener('click', startScan);
  btnStartMigration.addEventListener('click', startMigration);
}

// 5. Scan trigger
async function startScan() {
  let scanPath = '';
  const selectedType = document.querySelector('input[name="scan-type"]:checked').value;

  if (selectedType === 'custom') {
    scanPath = document.getElementById('input-scan-path').value.trim();
    if (!scanPath) {
      alert('Wpisz ścieżkę do skanowania.');
      return;
    }
  } else {
    scanPath = selectedType;
  }

  // Visual transitions
  document.getElementById('nav-scan').click();
  document.getElementById('scan-progress-overlay').style.display = 'flex';
  document.getElementById('scan-results-container').style.display = 'none';
  document.getElementById('scan-empty-state').style.display = 'none';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: scanPath })
    });

    if (!res.ok) throw new Error(await res.text());

    if (scanEventSource) scanEventSource.close();
    scanEventSource = new EventSource('/api/scan/progress');

    scanEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.active) {
        document.getElementById('scan-progress-bar').style.width = `${data.progress}%`;
        document.getElementById('scan-progress-text').textContent = `${data.progress}%`;
        document.getElementById('scan-progress-subtitle').textContent = data.currentDir;
      }

      if (!data.active && data.progress === 100) {
        scanEventSource.close();
        document.getElementById('scan-progress-overlay').style.display = 'none';
        
        if (data.results) {
          scanResults = data.results;
          renderScanTree(data.results);
        } else {
          document.getElementById('scan-empty-state').style.display = 'flex';
        }
      }

      if (data.error) {
        scanEventSource.close();
        document.getElementById('scan-progress-overlay').style.display = 'none';
        alert(`Błąd skanowania: ${data.error}`);
        document.getElementById('scan-empty-state').style.display = 'flex';
      }
    };
  } catch (err) {
    document.getElementById('scan-progress-overlay').style.display = 'none';
    document.getElementById('scan-empty-state').style.display = 'flex';
    alert(`Błąd podczas skanowania: ${err.message}`);
  }
}

// 6. Tree View Rendering
function renderScanTree(rootNode) {
  const container = document.getElementById('tree-container');
  container.innerHTML = '';

  if (!rootNode) {
    document.getElementById('scan-empty-state').style.display = 'flex';
    return;
  }

  document.getElementById('scan-results-container').style.display = 'block';

  // Start recursion
  renderTreeNode(rootNode, container, 0);

  // Bind first level of checkbox events
  bindCheckboxEvents(container);
  calculateSelectedSummary();
}

function renderTreeNode(node, container, depth = 0) {
  const itemRow = document.createElement('div');
  itemRow.className = `tree-node depth-${depth}`;
  if (node.protected) itemRow.classList.add('node-protected');
  itemRow.setAttribute('data-path', node.path);
  itemRow.setAttribute('data-size', node.size);
  itemRow.setAttribute('data-type', node.type);

  // Styling indentation based on folder tree depth
  itemRow.style.paddingLeft = `${depth * 20 + 12}px`;

  const arrow = node.type === 'dir' && node.hasChildren
    ? `<span class="tree-expand-arrow">▶</span>`
    : `<span class="tree-expand-arrow-placeholder"></span>`;

  const checkbox = `<input type="checkbox" class="tree-checkbox" ${node.protected ? 'disabled' : ''}>`;

  const icon = node.protected 
    ? '🔒' 
    : (node.type === 'dir' ? '📁' : '📄');

  itemRow.innerHTML = `
    <div class="tree-node-left">
      ${arrow}
      ${checkbox}
      <span class="tree-icon">${icon}</span>
      <span class="tree-label" title="${node.path}">${node.name}</span>
    </div>
    <span class="tree-size">${formatBytes(node.size)}</span>
  `;

  container.appendChild(itemRow);

  // Sibling children wrapper
  if (node.type === 'dir') {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children-container';
    childrenContainer.style.display = 'none';
    container.appendChild(childrenContainer);

    // If sub-children are pre-loaded (from backend buildTree up to depth 2)
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        renderTreeNode(child, childrenContainer, depth + 1);
      });

      const arrowEl = itemRow.querySelector('.tree-expand-arrow');
      if (arrowEl) {
        arrowEl.addEventListener('click', () => {
          const isExpanded = itemRow.classList.toggle('expanded');
          childrenContainer.style.display = isExpanded ? 'block' : 'none';
          arrowEl.textContent = isExpanded ? '▼' : '▶';
        });
      }
    } else if (node.hasChildren) {
      // Lazy load subdirectories when user clicks to expand
      const arrowEl = itemRow.querySelector('.tree-expand-arrow');
      if (arrowEl) {
        let loaded = false;
        arrowEl.addEventListener('click', async () => {
          const isExpanded = itemRow.classList.toggle('expanded');
          arrowEl.textContent = isExpanded ? '▼' : '▶';

          if (isExpanded) {
            childrenContainer.style.display = 'block';
            if (!loaded) {
              childrenContainer.innerHTML = `<div class="tree-loading" style="padding-left: ${(depth + 1) * 20 + 24}px; font-size: 12px; color: var(--text-muted);">Ładowanie folderów...</div>`;
              try {
                const res = await fetch(`/api/scan/subdir?path=${encodeURIComponent(node.path)}`);
                if (!res.ok) throw new Error();
                const children = await res.json();
                
                childrenContainer.innerHTML = '';
                children.forEach(child => {
                  renderTreeNode(child, childrenContainer, depth + 1);
                });
                
                loaded = true;
                bindCheckboxEvents(childrenContainer);
                
                // Inherit parent checkbox state for newly loaded children
                const parentCb = itemRow.querySelector('.tree-checkbox');
                if (parentCb && parentCb.checked) {
                  childrenContainer.querySelectorAll('.tree-checkbox:not([disabled])').forEach(ccb => ccb.checked = true);
                }
              } catch (e) {
                childrenContainer.innerHTML = `<div class="tree-error" style="padding-left: ${(depth + 1) * 20 + 24}px; font-size: 12px; color: var(--color-danger);">Nie można załadować zawartości.</div>`;
              }
            }
          } else {
            childrenContainer.style.display = 'none';
          }
        });
      }
    }
  }
}

// 7. Cascading checkboxes selection
function bindCheckboxEvents(container) {
  const checkboxes = container.querySelectorAll('.tree-checkbox');
  checkboxes.forEach(cb => {
    if (cb.dataset.bound) return;
    cb.dataset.bound = 'true';

    cb.addEventListener('change', (e) => {
      const isChecked = cb.checked;
      const nodeRow = cb.closest('.tree-node');
      const siblingContainer = nodeRow.nextElementSibling;

      // 1. Cascade down (check all descendants)
      if (siblingContainer && siblingContainer.classList.contains('tree-children-container')) {
        siblingContainer.querySelectorAll('.tree-checkbox:not([disabled])').forEach(ccb => {
          ccb.checked = isChecked;
          ccb.indeterminate = false;
        });
      }

      // 2. Cascade up (propagate changes to parent categories)
      updateParentCheckboxes(nodeRow);

      // 3. Update summary
      calculateSelectedSummary();
    });
  });
}

function updateParentCheckboxes(nodeRow) {
  const parentContainer = nodeRow.parentElement;
  if (!parentContainer || !parentContainer.classList.contains('tree-children-container')) return;

  const parentNodeRow = parentContainer.previousElementSibling;
  if (!parentNodeRow || !parentNodeRow.classList.contains('tree-node')) return;

  const parentCb = parentNodeRow.querySelector('.tree-checkbox');
  if (!parentCb) return;

  const siblingCbs = parentContainer.querySelectorAll('.tree-node > .tree-node-left > .tree-checkbox');
  const allChecked = Array.from(siblingCbs).every(scb => scb.checked || scb.disabled);
  const someChecked = Array.from(siblingCbs).some(scb => scb.checked || scb.indeterminate);

  parentCb.checked = allChecked;
  parentCb.indeterminate = someChecked && !allChecked;

  // Recurse parents
  updateParentCheckboxes(parentNodeRow);
}

// 8. Summarizing selected files sizes
function calculateSelectedSummary() {
  selectedItems = [];
  let totalSize = 0;

  // We only collect the HIGHEST level checked nodes to prevent folder duplication inside move array
  const allNodes = document.querySelectorAll('.tree-node');
  allNodes.forEach(nodeEl => {
    const cb = nodeEl.querySelector('.tree-checkbox');
    if (cb && cb.checked && !cb.disabled) {
      if (!isAncestorChecked(nodeEl)) {
        const path = nodeEl.getAttribute('data-path');
        const size = parseInt(nodeEl.getAttribute('data-size')) || 0;
        const name = nodeEl.querySelector('.tree-label').textContent;

        selectedItems.push({ name, path, size });
        totalSize += size;
      }
    }
  });

  document.getElementById('lbl-selected-count').textContent = selectedItems.length;
  document.getElementById('lbl-selected-size').textContent = formatBytes(totalSize);

  const btn = document.getElementById('btn-start-migration');
  if (selectedItems.length === 0) {
    btn.disabled = true;
    btn.style.opacity = 0.5;
  } else {
    btn.disabled = false;
    btn.style.opacity = 1;
  }
}

function isAncestorChecked(nodeEl) {
  let parentContainer = nodeEl.parentElement;
  while (parentContainer && parentContainer.classList.contains('tree-children-container')) {
    const parentNodeRow = parentContainer.previousElementSibling;
    if (parentNodeRow && parentNodeRow.classList.contains('tree-node')) {
      const parentCb = parentNodeRow.querySelector('.tree-checkbox');
      if (parentCb && parentCb.checked) {
        return true;
      }
      parentContainer = parentNodeRow.parentElement;
    } else {
      break;
    }
  }
  return false;
}

// 9. Migration trigger
async function startMigration() {
  if (selectedItems.length === 0) {
    alert('Wybierz katalogi lub pliki do przeniesienia.');
    return;
  }

  const destDrive = document.getElementById('select-dest-drive').value;
  const destFolder = document.getElementById('input-dest-folder').value.trim();
  const safeMode = document.getElementById('chk-safe-mode').checked;

  if (!destDrive) {
    alert('Podłącz i wybierz dysk docelowy.');
    return;
  }
  if (!destFolder) {
    alert('Wpisz nazwę folderu docelowego.');
    return;
  }

  const confirmation = confirm(`Czy na pewno chcesz przenieść te ${selectedItems.length} elementy na dysk docelowy ${destDrive}\\${destFolder}?\n` +
    (safeMode ? 'Zostanie użyty Bezpieczny Tryb (kopiowanie, weryfikacja bajtowa, usunięcie źródła).' : 'Tryb bezpośredni przeniesie pliki od razu.'));

  if (!confirmation) return;

  document.getElementById('nav-migrate').click();
  document.getElementById('migration-active-card').style.display = 'block';
  document.getElementById('migration-empty-state').style.display = 'none';

  const destinationPath = `${destDrive}\\${destFolder}`;

  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selectedItems,
        destination: destinationPath,
        safeMode: safeMode
      })
    });

    if (!res.ok) throw new Error(await res.text());

    if (moveEventSource) moveEventSource.close();
    moveEventSource = new EventSource('/api/move/progress');

    const consoleLog = document.getElementById('migrate-console-log');
    consoleLog.innerHTML = '';

    moveEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.active || data.progress === 100) {
        setCircularProgress(data.progress);
        document.getElementById('migrate-progress-percent').textContent = `${data.progress}%`;
        document.getElementById('migrate-current-file').textContent = data.currentFile || 'Analizowanie folderów...';
        document.getElementById('migrate-speed').textContent = data.speed > 0 ? `${(data.speed / (1024 * 1024)).toFixed(2)} MB/s` : '0 MB/s';
        document.getElementById('migrate-eta').textContent = data.eta || 'Obliczanie...';
        
        consoleLog.innerHTML = '';
        data.logs.forEach(log => {
          const div = document.createElement('div');
          div.textContent = log;
          if (log.includes('[BŁĄD]')) {
            div.style.color = 'var(--color-danger)';
          } else if (log.includes('[Sukces]')) {
            div.style.color = 'var(--color-success)';
          } else if (log.includes('Uwaga')) {
            div.style.color = 'var(--color-warning)';
          }
          consoleLog.appendChild(div);
        });
        consoleLog.scrollTop = consoleLog.scrollHeight;
      }

      if (!data.active && data.progress === 100) {
        moveEventSource.close();
        document.getElementById('migrate-status-title').textContent = 'Migracja zakończona!';
        document.getElementById('migrate-current-file').textContent = 'Wybrane elementy zostały bezpiecznie przeniesione.';
        loadDrives();
      }

      if (data.error) {
        moveEventSource.close();
        document.getElementById('migrate-status-title').textContent = 'Migracja przerwana';
        document.getElementById('migrate-current-file').style.color = 'var(--color-danger)';
        document.getElementById('migrate-current-file').textContent = `Błąd: ${data.error}`;
      }
    };

  } catch (err) {
    alert(`Błąd migracji: ${err.message}`);
  }
}

// 10. Circle progress setup
let progressCircle = null;
let circumference = 0;

function initCircularProgress() {
  progressCircle = document.getElementById('migrate-circle-progress');
  if (!progressCircle) return;
  const radius = progressCircle.r.baseVal.value;
  circumference = radius * 2 * Math.PI;
  progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
  progressCircle.style.strokeDashoffset = circumference;
}

function setCircularProgress(percent) {
  if (!progressCircle) return;
  const offset = circumference - (percent / 100) * circumference;
  progressCircle.style.strokeDashoffset = offset;
}

// Byte formatter
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
