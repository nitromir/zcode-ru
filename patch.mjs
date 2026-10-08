// patch.mjs — ZCode Russian localization engine (English-base mode)
// Replaces en-US strings with Russian translations. Untranslated keys fall back to English.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

let installDirArg = null;
let dictPath = path.join(here, 'ru.json');
let isCheck = false;
let isRevert = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--check' || arg === '-Check') isCheck = true;
  else if (arg === '--revert' || arg === '-Revert') isRevert = true;
  else if (!installDirArg) installDirArg = arg;
  else if (arg.endsWith('.json')) dictPath = arg;
}

if (!installDirArg) {
  // auto-detect candidates
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ZCode'),
    path.join(process.env.ProgramFiles || '', 'ZCode'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'ZCode')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'ZCode.exe'))) {
      installDirArg = c;
      break;
    }
  }
}

if (!installDirArg) {
  console.error('Usage: node patch.mjs <ZCode install dir> [ru.json] [--check] [--revert]');
  process.exit(1);
}

const installDir = path.resolve(installDirArg);
const asarPath = path.join(installDir, 'resources', 'app.asar');
const backupPath = asarPath + '.original';
const workDir = path.join(here, '_asar_work');

let asarBin;
try {
  asarBin = require.resolve('@electron/asar/bin/asar.mjs');
} catch {
  asarBin = path.join(here, 'node_modules', '@electron', 'asar', 'bin', 'asar.mjs');
}

const log = (...a) => console.log('[patch]', ...a);

function collectUnpackedPaths(entry, prefix = '', out = []) {
  if (entry?.unpacked) out.push(prefix);
  for (const [name, child] of Object.entries(entry?.files || {})) {
    collectUnpackedPaths(child, prefix ? `${prefix}/${name}` : name, out);
  }
  return out;
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function uniquePath(basePath) {
  let candidate = basePath;
  let index = 2;
  while (fs.existsSync(candidate)) candidate = basePath + '.' + index++;
  return candidate;
}

function buildPackageStreams(rootDir, unpackedPaths) {
  const streams = [];
  const isUnpacked = relativePath => {
    for (const unpackedPath of unpackedPaths) {
      if (relativePath === unpackedPath || relativePath.startsWith(unpackedPath + '/')) return true;
    }
    return false;
  };
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        streams.push({ path: relativePath, type: 'directory', unpacked: isUnpacked(relativePath) });
        walk(absolutePath);
      } else if (entry.isSymbolicLink()) {
        streams.push({
          path: relativePath,
          type: 'link',
          unpacked: isUnpacked(relativePath),
          symlink: fs.readlinkSync(absolutePath)
        });
      } else {
        const stat = fs.statSync(absolutePath);
        streams.push({
          path: relativePath,
          type: 'file',
          unpacked: isUnpacked(relativePath),
          stat,
          streamGenerator: () => fs.createReadStream(absolutePath)
        });
      }
    }
  };
  walk(rootDir);
  return streams;
}

if (!fs.existsSync(asarPath)) {
  console.error('ERROR: app.asar not found at:', asarPath);
  process.exit(1);
}

// ---- Revert mode ----
if (isRevert) {
  if (!fs.existsSync(backupPath)) {
    console.error('ERROR: No backup found at:', backupPath);
    process.exit(1);
  }
  fs.copyFileSync(backupPath, asarPath);
  log('Reverted app.asar from backup successfully.');
  process.exit(0);
}

// ---- Check patched status ----
function checkIsPatched() {
  try {
    const list = asar.listPackage(asarPath).map(String);
    const intlEntry = list.find(f => /IntlProvider-.*\.js$/.test(f.replace(/\\/g, '/')));
    if (!intlEntry) return false;
    
    const candidates = [
      intlEntry.replace(/^[\\\/]+/, ''),
      intlEntry.replace(/^[\\\/]+/, '').replace(/\//g, '\\'),
      intlEntry.replace(/^[\\\/]+/, '').replace(/\\/g, '/')
    ];
    for (const p of candidates) {
      try {
        const buf = asar.extractFile(asarPath, p);
        const text = buf.toString('utf8');
        if (text.includes(',,R=')) {
          throw new Error('Legacy broken patch detected. Revert app.asar before applying a new patch.');
        }
        return text.includes('"settings.locale.en-US":`Русский`');
      } catch (err) {
        if (err?.message?.startsWith('Legacy broken patch')) throw err;
      }
    }
    return false;
  } catch (err) {
    if (err?.message?.startsWith('Legacy broken patch')) throw err;
    return false;
  }
}

const alreadyPatched = checkIsPatched();

if (isCheck) {
  log('Installed:', installDir);
  log('Patched (RU on en-US):', alreadyPatched);
  process.exit(alreadyPatched ? 0 : 2);
}

if (alreadyPatched) {
  log('ZCode is already patched with Russian on en-US. Nothing to do.');
  process.exit(0);
}

// ---- Apply patch ----
if (!fs.existsSync(dictPath)) {
  console.error('ERROR: Dictionary file not found:', dictPath);
  process.exit(1);
}

const ruDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
log('Dictionary loaded:', Object.keys(ruDict).length, 'keys');

const unpackedDir = asarPath + '.unpacked';
const backupUnpackedDir = backupPath + '.unpacked';

// Extract asar to workDir
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });
log('Extracting app.asar...');
execFileSync(process.execPath, [asarBin, 'extract', asarPath, workDir], { stdio: 'pipe' });
log('Extracted to:', workDir);

// Locate IntlProvider-*.js
const assetsDir = path.join(workDir, 'out', 'renderer', 'assets');
if (!fs.existsSync(assetsDir)) {
  throw new Error('Assets directory not found at: ' + assetsDir);
}

const files = fs.readdirSync(assetsDir);
const intlName = files.find(f => /^IntlProvider-.*\.js$/.test(f));
if (!intlName) {
  throw new Error('IntlProvider-*.js not found in ' + assetsDir);
}

const intlPath = path.join(assetsDir, intlName);
let src = fs.readFileSync(intlPath, 'utf8');

function findObj(srcText, varName) {
  const re = new RegExp('[;,\\s]' + varName + '\\s*=\\s*\\{');
  const m = re.exec(srcText);
  if (!m) throw new Error('Dict variable declaration not found: ' + varName);
  const open = m.index + m[0].length - 1;
  let d = 0;
  for (let j = open; j < srcText.length; j++) {
    if (srcText[j] === '{') d++;
    else if (srcText[j] === '}') { d--; if (d === 0) return [open, j]; }
  }
  throw new Error('Unclosed object for ' + varName);
}

function parseDict(text, start, end) {
  const body = text.slice(start + 1, end);
  const out = {}; let i = 0;
  while (i < body.length) {
    while (i < body.length && ', \n\r\t'.includes(body[i])) i++;
    if (i >= body.length) break;
    if (body[i] !== '"') throw new Error('Key expected @' + i);
    let j = i + 1;
    while (body[j] !== '"') { if (body[j] === '\\') j++; j++; }
    const key = JSON.parse(body.slice(i, j + 1));
    i = j + 1;
    while (' \n\r\t'.includes(body[i])) i++;
    if (body[i] !== ':') throw new Error('Colon expected for ' + key);
    i++;
    while (' \n\r\t'.includes(body[i])) i++;
    const q = body[i];
    if (q === '"' || q === "'") {
      let k = i + 1, v = '';
      while (body[k] !== q) { if (body[k] === '\\') { v += body[k] + body[k + 1]; k += 2; } else v += body[k++]; }
      out[key] = q === '"' ? JSON.parse(body.slice(i, k + 1)) : v.replace(/\\'/g, "'");
      i = k + 1; continue;
    }
    if (q !== '`') throw new Error('Value syntax unsupported for key ' + key);
    let k = i + 1, v = '';
    while (body[k] !== '`') { if (body[k] === '\\') { v += body[k] + body[k + 1]; k += 2; } else v += body[k++]; }
    out[key] = v; i = k + 1;
  }
  return out;
}

// Find locale map: g={"zh-CN":p,"en-US":m} or similar.
// The minifier renames the map variable and helper calls between ZCode releases.
const mapRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)=\{(?:"zh-CN":([a-zA-Z0-9_$]+),"en-US":([a-zA-Z0-9_$]+)|"en-US":([a-zA-Z0-9_$]+),"zh-CN":([a-zA-Z0-9_$]+))\}/;
const mapMatch = src.match(mapRegex);
if (!mapMatch) {
  throw new Error('Locale map pattern ("zh-CN"/"en-US") not found in ' + intlName);
}

const mapVar = mapMatch[1];
const zhVar = mapMatch[2] || mapMatch[5];
const enVar = mapMatch[3] || mapMatch[4];
log('Detected locale map: ' + mapVar + ' (zh-CN=' + zhVar + ', en-US=' + enVar + ')');

const enRange = findObj(src, enVar);
const enDict = parseDict(src, ...enRange);
const enKeys = Object.keys(enDict);
log('Original English keys in bundle:', enKeys.length);

const esc = v => '`' + String(v)
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${') + '`';

const entries = [];
let fallbackCount = 0;
let translatedCount = 0;

for (const k of enKeys) {
  let v = ruDict[k];
  if (k === 'settings.locale.en-US' || k === 'sidebar.settings.locale.en-US') {
    v = 'Русский';
    translatedCount++;
  } else if (k === 'settings.locale.zh-CN' || k === 'sidebar.settings.locale.zh-CN') {
    v = '中文简体';
    translatedCount++;
  } else if (v && typeof v === 'string' && v.trim()) {
    translatedCount++;
  } else {
    fallbackCount++;
    v = enDict[k]; // Fallback to English original string
  }
  entries.push(JSON.stringify(k) + ':' + esc(v));
}

log('Translated keys:', translatedCount, '| English fallbacks:', fallbackCount);

// Replace the existing en-US object in place. Older builds allowed injecting
// a new R variable into the surrounding minified declaration. In 3.14 the
// declaration changed from `h=n(),g=...` to `h=r(),g=...`; the old fallback
// produced `h=r(),,R=...` and made the renderer syntactically invalid.
const replacement = '{' + entries.join(',') + '}';
src = src.slice(0, enRange[0]) + replacement + src.slice(enRange[1] + 1);

// Safety validations
if (!src.includes(mapMatch[0])) {
  throw new Error('Validation failed: locale map was changed unexpectedly');
}
if (!src.includes('"settings.locale.en-US":`Русский`')) {
  throw new Error('Validation failed: Russian language label not found');
}

// Validate the generated JavaScript before touching app.asar.
fs.writeFileSync(intlPath, src);
try {
  execFileSync(process.execPath, ['--check', intlPath], { stdio: 'pipe' });
} catch (err) {
  const detail = err?.stderr?.toString()?.trim() || err?.message || 'unknown syntax error';
  throw new Error('Validation failed: generated IntlProvider is invalid: ' + detail);
}

// Create or refresh backups only after the candidate JavaScript has passed validation.
if (fs.existsSync(backupPath)) {
  const currentHash = sha256File(asarPath);
  const backupHash = sha256File(backupPath);
  if (currentHash !== backupHash) {
    const previousBackup = uniquePath(backupPath + '.' + backupHash.slice(0, 12));
    fs.renameSync(backupPath, previousBackup);
    if (fs.existsSync(backupUnpackedDir)) {
      fs.renameSync(backupUnpackedDir, uniquePath(backupUnpackedDir + '.' + backupHash.slice(0, 12)));
    }
    fs.copyFileSync(asarPath, backupPath);
    log('Rotated stale backup:', previousBackup);
  }
}
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(asarPath, backupPath);
  log('Created backup:', backupPath);
}
if (fs.existsSync(unpackedDir) && !fs.existsSync(backupUnpackedDir)) {
  fs.cpSync(unpackedDir, backupUnpackedDir, { recursive: true });
  log('Backup unpacked copied:', backupUnpackedDir);
}

log('Patched', intlName, 'successfully. New size:', src.length, 'bytes');

// Pack to a temporary archive and verify it before replacing app.asar.
const packedPath = asarPath + '.zcode-ru.tmp';
const packedUnpackedPath = packedPath + '.unpacked';
try {
  fs.rmSync(packedPath, { force: true });
  fs.rmSync(packedUnpackedPath, { recursive: true, force: true });
  const originalUnpackedPaths = collectUnpackedPaths(asar.getRawHeader(asarPath).header);
  log('Preserving unpacked entries:', originalUnpackedPaths.length);
  log('Repacking app.asar...');
  const streams = buildPackageStreams(workDir, new Set(originalUnpackedPaths));
  await asar.createPackageFromStreams(packedPath, streams);
  const packedUnpackedPaths = collectUnpackedPaths(asar.getRawHeader(packedPath).header);
  const missingUnpacked = originalUnpackedPaths.filter(p => !packedUnpackedPaths.includes(p));
  if (missingUnpacked.length) {
    throw new Error('Validation failed: unpacked entries were lost: ' + missingUnpacked.join(', '));
  }
  const packedEntry = path.join('out', 'renderer', 'assets', intlName);
  const packedSource = asar.extractFile(packedPath, packedEntry).toString('utf8');
  if (!packedSource.includes('"settings.locale.en-US":`Русский`')) {
    throw new Error('Validation failed: packed IntlProvider does not contain Russian locale label');
  }
  fs.copyFileSync(packedPath, asarPath);
  log('Repacked to:', asarPath);
} finally {
  fs.rmSync(packedPath, { force: true });
  fs.rmSync(packedUnpackedPath, { recursive: true, force: true });
  fs.rmSync(workDir, { recursive: true, force: true });
  log('Cleaned up temp files.');
}

log('PATCH OK — ZCode localized to Russian on en-US base.');
