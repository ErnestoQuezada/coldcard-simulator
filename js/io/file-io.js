/**
 * io/file-io.js
 * ------------------------------------------------------------
 * Browser file download/upload helpers. This is the ONLY module in
 * the project allowed to touch Blob / URL.createObjectURL / the DOM
 * download mechanism directly — everything else (wallet-export.js,
 * device-state.js) stays pure and hands this module a plain object
 * or string to save. core/ modules never import this file directly;
 * device-instance.js is the bridge (see its onExportRequested wiring).
 *
 * Kept deliberately small and generic: downloadTextFile()/downloadJSON()
 * generalize to "any file to save", and openBinaryFile() below is the
 * read-side counterpart, used for loading a PSBT to sign.
 */

/**
 * Triggers a browser download of a JSON object as a formatted .json file.
 * @param {string} filename
 * @param {object} data - JSON-serializable plain object
 */
export async function downloadJSON(filename, data) {
  await downloadTextFile(filename, JSON.stringify(data, null, 2));
}

/**
 * Triggers a browser download of a plain text file.
 * @param {string} filename
 * @param {string} content
 */
export async function downloadTextFile(filename, content) {
  if (window.__TAURI__) {
    const { save } = window.__TAURI__.dialog;
    const { writeTextFile } = window.__TAURI__.fs;
    const path = await save({ defaultPath: filename });
    if (path) {
      await writeTextFile(path, content);
    }
  } else {
    triggerDownload(new Blob([content], { type: 'application/octet-stream' }), filename);
  }
}

/**
 * Triggers a browser download of raw binary data — used for the
 * signed PSBT, which is a binary format, not text/JSON.
 * @param {string} filename
 * @param {Uint8Array} bytes
 */
export async function downloadBinaryFile(filename, bytes) {
  if (window.__TAURI__) {
    const { save } = window.__TAURI__.dialog;
    const { writeFile } = window.__TAURI__.fs;
    
    // If the filename contains an extension, use it in filters so the save dialog is cleaner
    const extMatch = filename.match(/\.([^.]+)$/);
    const filters = extMatch ? [{ name: extMatch[1].toUpperCase(), extensions: [extMatch[1]] }] : [];

    const path = await save({ defaultPath: filename, filters });
    if (path) {
      try {
        await writeFile(path, bytes);
      } catch (err) {
        console.error("Tauri writeFile failed:", err);
        // Fallback to browser download if native fs write fails (e.g. permission/scope errors)
        triggerDownload(new Blob([bytes], { type: 'application/octet-stream' }), filename);
      }
    }
  } else {
    triggerDownload(new Blob([bytes], { type: 'application/octet-stream' }), filename);
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke on the next tick rather than immediately — revoking right
  // away can cancel the download in some browsers before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Opens the browser's file picker and reads the chosen file as raw
 * bytes — used for loading a PSBT to sign. Resolves to `null` if the
 * user cancels (best-effort: the file input's `cancel` event isn't
 * supported in every browser, so a cancelled pick may not resolve at
 * all in those cases rather than resolving to `null`).
 * @param {object} [opts]
 * @param {string} [opts.accept] - e.g. '.psbt'
 * @returns {Promise<{name: string, bytes: Uint8Array}|null>}
 */
export async function openBinaryFile({ accept = '' } = {}) {
  if (window.__TAURI__) {
    const { open } = window.__TAURI__.dialog;
    const { readFile } = window.__TAURI__.fs;
    const filters = accept 
      ? [{ name: 'Allowed Files', extensions: accept.split(',').map(e => e.trim().replace(/^\./, '')) }] 
      : [];
    
    const path = await open({
      multiple: false,
      directory: false,
      filters
    });
    
    if (!path) return null;
    
    // Extract filename from path
    const name = path.split(/[\\/]/).pop();
    const bytes = await readFile(path);
    return { name, bytes };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      const buffer = await file.arrayBuffer();
      resolve({ name: file.name, bytes: new Uint8Array(buffer) });
    });

    // Best-effort cancel detection — supported in Chromium/Firefox but
    // not universally, hence the caveat above.
    input.addEventListener('cancel', () => resolve(null));

    input.click();
  });
}
