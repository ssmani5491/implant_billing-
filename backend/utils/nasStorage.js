const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const NAS_SHARE_PATH = process.env.NAS_SHARE_PATH;
const NAS_USERNAME = process.env.NAS_USERNAME;
const NAS_PASSWORD = process.env.NAS_PASSWORD;

let authenticated = false;

// Authenticates the UNC share via `net use` if credentials are configured.
// Only relevant for UNC paths (\\host\share) — a mapped drive letter (Z:\...)
// is assumed to already be connected. No-ops (and is safe to call repeatedly)
// once authentication has succeeded once per process.
function authenticateShare() {
  return new Promise((resolve, reject) => {
    if (authenticated) return resolve();
    if (!NAS_SHARE_PATH || !NAS_SHARE_PATH.startsWith('\\\\') || !NAS_USERNAME) {
      authenticated = true;
      return resolve();
    }

    const uncRoot = NAS_SHARE_PATH.split('\\').slice(0, 4).join('\\'); // \\host\share
    execFile('net', ['use', uncRoot, NAS_PASSWORD || '', `/user:${NAS_USERNAME}`], (err, stdout, stderr) => {
      if (err) {
        // "already connected" isn't a real failure — treat as success.
        if (/already/i.test(stderr) || /already/i.test(stdout)) {
          authenticated = true;
          return resolve();
        }
        return reject(new Error(`Failed to authenticate NAS share: ${stderr || err.message}`));
      }
      authenticated = true;
      resolve();
    });
  });
}

function assertConfigured() {
  if (!NAS_SHARE_PATH) {
    throw new Error('NAS_SHARE_PATH is not configured.');
  }
}

// Files are organized under a per-invoice folder named by the human-readable
// invoice number (e.g. IMP-2026-000005), not the numeric invoice id, since
// that's the identifier staff recognize when browsing the NAS directly.
function invoiceFolderPath(invoiceNo) {
  assertConfigured();
  return path.join(NAS_SHARE_PATH, invoiceNo);
}

function nasFilePath(invoiceNo, storedFilename) {
  return path.join(invoiceFolderPath(invoiceNo), storedFilename);
}

// Moves a freshly-uploaded file from local staging (multer's temp dir) onto
// the NAS share, into a folder named after the invoice number, then removes
// the local copy. Called only after the DB row referencing storedFilename has
// committed, so a failure here never leaves an orphaned DB record pointing at
// a file that isn't anywhere.
async function moveToNas(localPath, invoiceNo, storedFilename) {
  await authenticateShare();

  const folder = invoiceFolderPath(invoiceNo);
  await fsPromises.mkdir(folder, { recursive: true });

  const destPath = nasFilePath(invoiceNo, storedFilename);
  await fsPromises.copyFile(localPath, destPath);
  await fsPromises.unlink(localPath);
}

async function deleteFromNas(invoiceNo, storedFilename) {
  await authenticateShare();
  const filePath = nasFilePath(invoiceNo, storedFilename);
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function nasFileExists(invoiceNo, storedFilename) {
  await authenticateShare();
  try {
    await fsPromises.access(nasFilePath(invoiceNo, storedFilename), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = { moveToNas, deleteFromNas, nasFileExists, nasFilePath, authenticateShare };
