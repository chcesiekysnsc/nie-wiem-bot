const express = require('express');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state for scanning and moving
let scanStatus = { active: false, progress: 0, currentDir: '', results: null };
let moveStatus = { active: false, progress: 0, currentFile: '', speed: 0, eta: '', logs: [], error: null };
let scanProgressClients = [];
let moveProgressClients = [];

// Helper to run PowerShell code
async function runPowerShellCode(code) {
  const tmpFile = path.join(os.tmpdir(), `helper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ps1`);
  await fs.writeFile(tmpFile, '\ufeff' + code, 'utf8');
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { maxBuffer: 50 * 1024 * 1024 }, async (error, stdout, stderr) => {
      try { await fs.unlink(tmpFile); } catch (e) {}
      if (error) reject(error || stderr);
      else resolve(stdout);
    });
  });
}

// Get logical drives info
app.get('/api/drives', async (req, res) => {
  const psCode = `
    @(Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, Size, FreeSpace) | ConvertTo-Json
  `;
  try {
    const output = await runPowerShellCode(psCode);
    let drives = [];
    if (output.trim()) {
      const parsed = JSON.parse(output);
      drives = Array.isArray(parsed) ? parsed : [parsed];
    }
    const cleaned = drives.map(d => ({
      letter: d.DeviceID,
      name: d.VolumeName || 'Dysk lokalny',
      size: d.Size ? parseInt(d.Size) : 0,
      free: d.FreeSpace ? parseInt(d.FreeSpace) : 0,
    }));
    res.json(cleaned);
  } catch (err) {
    console.error('Error fetching drives:', err);
    res.status(500).json({ error: 'Nie można pobrać informacji o dyskach.' });
  }
});

// Server-Sent Events setup
function sendProgress(clients, data) {
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

app.get('/api/scan/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  scanProgressClients.push(res);
  req.on('close', () => {
    scanProgressClients = scanProgressClients.filter(c => c !== res);
  });
  res.write(`data: ${JSON.stringify({ active: scanStatus.active, progress: scanStatus.progress, currentDir: scanStatus.currentDir })}\n\n`);
});

app.get('/api/move/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  moveProgressClients.push(res);
  req.on('close', () => {
    moveProgressClients = moveProgressClients.filter(c => c !== res);
  });
  res.write(`data: ${JSON.stringify({ active: moveStatus.active, progress: moveStatus.progress, currentFile: moveStatus.currentFile, speed: moveStatus.speed, eta: moveStatus.eta, logs: moveStatus.logs, error: moveStatus.error })}\n\n`);
});

// Protect system directories and files from deletion/moving
const PROTECTED_PATHS = [
  'c:\\windows',
  'c:\\$recycle.bin',
  'c:\\system volume information',
  'c:\\recovery',
  'c:\\boot',
  'c:\\programdata',
  'c:\\program files\\microsoft',
  'c:\\program files (x86)\\microsoft'
];

function isPathProtected(fullPath) {
  const lowerPath = fullPath.toLowerCase();
  
  // Protect root itself
  if (lowerPath === 'c:\\' || lowerPath === 'c:') return true;
  
  // Protect core directories
  for (const p of PROTECTED_PATHS) {
    if (lowerPath === p || lowerPath.startsWith(p + '\\')) {
      return true;
    }
  }

  // Protect AppData folder for users
  if (lowerPath.includes('\\appdata\\local') || lowerPath.includes('\\appdata\\roaming')) {
    return true;
  }

  // Protect system files in root
  const sysFiles = ['ntuser.dat', 'pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'dumpstack.log.tmp'];
  const baseName = path.basename(lowerPath);
  if (sysFiles.includes(baseName)) {
    return true;
  }

  return false;
}

// Recursive directory size calculator (handles permission errors)
async function getFolderSize(dirPath) {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      
      // Skip symbolic links and reparse points to prevent infinite loops
      const stat = await fs.lstat(fullPath);
      if (stat.isSymbolicLink()) continue;

      if (file.isDirectory()) {
        // Skip System Volume Information & Recycle Bin to avoid hanging
        const lowerName = file.name.toLowerCase();
        if (lowerName === 'system volume information' || lowerName === '$recycle.bin') continue;
        size += await getFolderSize(fullPath);
      } else if (file.isFile()) {
        size += stat.size;
      }
    }
  } catch (e) {
    // Permission denied, file locked, etc. -> skip
  }
  return size;
}

// Build a directory tree up to maxDepth
async function buildTree(dirPath, currentDepth = 1, maxDepth = 2, onProgressUpdate = null) {
  const name = path.basename(dirPath) || dirPath;
  const isProtected = isPathProtected(dirPath);
  
  const node = {
    name,
    path: dirPath,
    size: 0,
    type: 'dir',
    protected: isProtected,
    hasChildren: false,
    children: []
  };

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    if (entries.length > 0) {
      node.hasChildren = true;
    }

    if (currentDepth <= maxDepth) {
      for (const entry of entries) {
        const childPath = path.join(dirPath, entry.name);
        
        try {
          const lstat = await fs.lstat(childPath);
          if (lstat.isSymbolicLink()) continue;

          if (entry.isDirectory()) {
            const lowerName = entry.name.toLowerCase();
            if (lowerName === 'system volume information' || lowerName === '$recycle.bin') continue;

            if (onProgressUpdate) onProgressUpdate(childPath);

            // Recurse children
            const childNode = await buildTree(childPath, currentDepth + 1, maxDepth, onProgressUpdate);
            node.children.push(childNode);
            node.size += childNode.size;
          } else if (entry.isFile()) {
            node.children.push({
              name: entry.name,
              path: childPath,
              size: lstat.size,
              type: 'file',
              protected: isPathProtected(childPath),
              hasChildren: false,
              children: []
            });
            node.size += lstat.size;
          }
        } catch (err) {}
      }

      // Sort children by size descending
      node.children.sort((a, b) => b.size - a.size);
    } else {
      // Deeper than max depth -> just calculate total size recursively
      node.size = await getFolderSize(dirPath);
    }
  } catch (err) {
    // Directory is locked or inaccessible
  }

  return node;
}

// Main Scan Endpoint (scans starting directory up to depth 2, returns size-calculated tree)
app.post('/api/scan', async (req, res) => {
  if (scanStatus.active) {
    return res.status(400).json({ error: 'Skanowanie już trwa.' });
  }

  const startPath = req.body.path || 'C:\\';
  scanStatus.active = true;
  scanStatus.progress = 0;
  scanStatus.currentDir = `Rozpoczynanie analizy katalogu: ${startPath}...`;
  scanStatus.results = null;

  res.json({ message: 'Analiza rozpoczęta.' });

  (async () => {
    try {
      let foldersScannedCount = 0;
      
      const onProgress = (currentPath) => {
        foldersScannedCount++;
        scanStatus.currentDir = `Analizowanie (${foldersScannedCount} folderów): ${currentPath}`;
        // Limit progress updates to prevent SSE spam
        if (foldersScannedCount % 10 === 0) {
          sendProgress(scanProgressClients, { 
            active: true, 
            progress: Math.min(99, Math.round((foldersScannedCount / 200) * 100)), // dynamic estimation
            currentDir: scanStatus.currentDir 
          });
        }
      };

      const tree = await buildTree(startPath, 1, 2, onProgress);

      scanStatus.active = false;
      scanStatus.progress = 100;
      scanStatus.currentDir = 'Zakończono analizę dysku';
      scanStatus.results = tree;

      sendProgress(scanProgressClients, { 
        active: false, 
        progress: 100, 
        currentDir: 'Skanowanie zakończone', 
        results: tree 
      });
    } catch (err) {
      console.error('Scan error:', err);
      scanStatus.active = false;
      scanStatus.currentDir = 'Błąd skanowania: ' + err.message;
      sendProgress(scanProgressClients, { active: false, progress: 0, error: err.message });
    }
  })();
});

// Lazy-load Subdirectory API (scans children for a clicked node)
app.get('/api/scan/subdir', async (req, res) => {
  const subdirPath = req.query.path;
  if (!subdirPath) {
    return res.status(400).json({ error: 'Brak ścieżki katalogu.' });
  }

  try {
    // Scan one level of subdir
    const tree = await buildTree(subdirPath, 1, 1);
    res.json(tree.children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to copy files/folders recursively
async function copyFileOrFolder(src, dest, onProgressUpdate) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyFileOrFolder(path.join(src, entry.name), path.join(dest, entry.name), onProgressUpdate);
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    return new Promise((resolve, reject) => {
      const rd = fsSync.createReadStream(src);
      const wr = fsSync.createWriteStream(dest);
      rd.on('error', err => reject(err));
      wr.on('error', err => reject(err));
      rd.on('data', chunk => {
        onProgressUpdate(chunk.length);
      });
      wr.on('finish', () => resolve());
      rd.pipe(wr);
    });
  }
}

// Helper to recursively delete folders/files
async function deleteFileOrFolder(src) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await deleteFileOrFolder(path.join(src, entry.name));
    }
    await fs.rmdir(src);
  } else {
    await fs.unlink(src);
  }
}

// Calculate total size of selected tree items
async function calculateItemsSize(items) {
  let size = 0;
  for (const item of items) {
    size += item.size;
  }
  return size;
}

// Move API
app.post('/api/move', async (req, res) => {
  if (moveStatus.active) {
    return res.status(400).json({ error: 'Operacja przenoszenia już trwa.' });
  }

  const { items, destination, safeMode } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Nie wybrano plików do przeniesienia.' });
  }
  if (!destination) {
    return res.status(400).json({ error: 'Nie wybrano folderu docelowego.' });
  }

  // Double check protection on backend
  for (const item of items) {
    if (isPathProtected(item.path)) {
      return res.status(400).json({ error: `Plik lub katalog jest chroniony przez system: ${item.path}` });
    }
  }

  moveStatus.active = true;
  moveStatus.progress = 0;
  moveStatus.currentFile = '';
  moveStatus.speed = 0;
  moveStatus.eta = '';
  moveStatus.logs = ['Rozpoczęto proces bezpiecznego przenoszenia...', `Folder docelowy: ${destination}`, `Tryb bezpieczny: ${safeMode ? 'Włączony' : 'Wyłączony'}`];
  moveStatus.error = null;

  res.json({ message: 'Przenoszenie rozpoczęte.' });

  (async () => {
    try {
      const totalBytes = await calculateItemsSize(items);
      let bytesMoved = 0;
      let startTime = Date.now();
      let lastTime = Date.now();
      let lastBytes = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        moveStatus.currentFile = item.name || path.basename(item.path);

        // Convert path C:\Users\dupek\Desktop -> C\Users\dupek\Desktop
        let relativePath = item.path;
        if (relativePath.includes(':')) {
          relativePath = relativePath.replace(':', '');
        }

        const targetPath = path.join(destination, relativePath);
        
        moveStatus.logs.push(`[${i+1}/${items.length}] Przenoszenie: ${item.path} -> ${targetPath}`);
        sendProgress(moveProgressClients, moveStatus);

        const onProgressUpdate = (chunkLength) => {
          bytesMoved += chunkLength;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          moveStatus.progress = Math.round((bytesMoved / totalBytes) * 100);

          const interval = now - lastTime;
          if (interval >= 500) {
            const bytesSinceLast = bytesMoved - lastBytes;
            moveStatus.speed = Math.round(bytesSinceLast / (interval / 1000));
            lastTime = now;
            lastBytes = bytesMoved;

            if (moveStatus.speed > 0) {
              const remainingBytes = totalBytes - bytesMoved;
              const remainingSeconds = remainingBytes / moveStatus.speed;
              if (remainingSeconds < 60) {
                moveStatus.eta = `${Math.round(remainingSeconds)} sek.`;
              } else {
                moveStatus.eta = `${Math.round(remainingSeconds / 60)} min. ${Math.round(remainingSeconds % 60)} sek.`;
              }
            }
          }
          sendProgress(moveProgressClients, moveStatus);
        };

        if (safeMode) {
          try {
            await copyFileOrFolder(item.path, targetPath, onProgressUpdate);
            
            // Check size integrity
            const srcSize = item.size;
            let destSize = 0;
            if (fsSync.statSync(targetPath).isDirectory()) {
              destSize = await getFolderSize(targetPath);
            } else {
              const destStat = await fs.stat(targetPath);
              destSize = destStat.size;
            }

            if (srcSize === destSize) {
              await deleteFileOrFolder(item.path);
              moveStatus.logs.push(`  [Sukces] Zweryfikowano rozmiar i usunięto oryginał.`);
            } else {
              throw new Error(`Błąd spójności rozmiaru. Źródło: ${srcSize}B, Cel: ${destSize}B.`);
            }
          } catch (err) {
            moveStatus.logs.push(`  [BŁĄD] Operacja przerwana: ${err.message}`);
            try {
              if (fsSync.existsSync(targetPath)) await deleteFileOrFolder(targetPath);
            } catch (e) {}
          }
        } else {
          // Direct rename move (fallback to copy/delete if across drives)
          try {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.rename(item.path, targetPath);
            bytesMoved += item.size;
            moveStatus.progress = Math.round((bytesMoved / totalBytes) * 100);
            moveStatus.logs.push(`  [Sukces] Przeniesiono.`);
          } catch (err) {
            moveStatus.logs.push(`  [Kopia] Ruch bezpośredni zablokowany. Kopiowanie...`);
            try {
              await copyFileOrFolder(item.path, targetPath, onProgressUpdate);
              await deleteFileOrFolder(item.path);
              moveStatus.logs.push(`  [Sukces] Skopiowano i usunięto oryginał.`);
            } catch (copyErr) {
              moveStatus.logs.push(`  [BŁĄD] Nie można przenieść: ${copyErr.message}`);
            }
          }
        }
        sendProgress(moveProgressClients, moveStatus);
      }

      moveStatus.active = false;
      moveStatus.progress = 100;
      moveStatus.currentFile = '';
      moveStatus.speed = 0;
      moveStatus.eta = 'Ukończono';
      moveStatus.logs.push('=========================================');
      moveStatus.logs.push(`Migracja zakończona! Zwolniono ${Math.round(bytesMoved / (1024 * 1024))} MB.`);
      sendProgress(moveProgressClients, moveStatus);
    } catch (err) {
      console.error('Migration error:', err);
      moveStatus.active = false;
      moveStatus.error = err.message;
      moveStatus.logs.push(`[BŁĄD KRYTYCZNY] ${err.message}`);
      sendProgress(moveProgressClients, moveStatus);
    }
  })();
});

// Run server or export for testing
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Serwer Asystenta Czyszczenia działa na http://localhost:${PORT}`);
  });
} else {
  module.exports = {
    buildTree,
    isPathProtected,
    getFolderSize,
    copyFileOrFolder,
    deleteFileOrFolder
  };
}
