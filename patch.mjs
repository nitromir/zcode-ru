// patch.mjs — ZCode Russian localization engine (English-base mode)
// Replaces en-US strings with Russian translations. Untranslated keys fall back to English.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
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
        return text.includes('en-US":R') || text.includes('en-US": R') || text.includes('"settings.locale.en-US":`Русский`');
      } catch {}
    }
    return false;
  } catch (err) {
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

// Create backup if not exists or if pristine asar is needed
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(asarPath, backupPath);
  log('Created backup:', backupPath);
}

const unpackedDir = asarPath + '.unpacked';
const backupUnpackedDir = backupPath + '.unpacked';
if (fs.existsSync(unpackedDir) && !fs.existsSync(backupUnpackedDir)) {
  fs.cpSync(unpackedDir, backupUnpackedDir, { recursive: true });
  log('Backup unpacked copied:', backupUnpackedDir);
}

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

// Find locale map: g={"zh-CN":p,"en-US":m} or similar
const mapRegex = /g=\{(?:"zh-CN":([a-zA-Z0-9_$]+),"en-US":([a-zA-Z0-9_$]+)|"en-US":([a-zA-Z0-9_$]+),"zh-CN":([a-zA-Z0-9_$]+))\}/;
const mapMatch = src.match(mapRegex);
if (!mapMatch) {
  throw new Error('Locale map pattern (g={"zh-CN":..., "en-US":...}) not found in ' + intlName);
}

const zhVar = mapMatch[1] || mapMatch[4];
const enVar = mapMatch[2] || mapMatch[3];
log('Detected locale variables: zh-CN=' + zhVar + ', en-US=' + enVar);

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

const targetMap = mapMatch[0];
const replacementMap = targetMap.includes('"zh-CN":' + zhVar + ',"en-US":' + enVar)
  ? 'g={"zh-CN":' + zhVar + ',"en-US":R}'
  : 'g={"en-US":R,"zh-CN":' + zhVar + '}';

// Inject R dictionary before the map
const patternBefore = '},h=n(),' + targetMap;
if (src.includes(patternBefore)) {
  const injected = '},R={' + entries.join(',') + '},h=n(),' + replacementMap;
  src = src.split(patternBefore).join(injected);
} else {
  // Generic injection before targetMap
  const injected = ',R={' + entries.join(',') + '},' + replacementMap;
  src = src.split(targetMap).join(injected);
}

// Safety validations
if (!src.includes('en-US":R') && !src.includes('en-US": R')) {
  throw new Error('Validation failed: replacementMap was not injected');
}
if (!src.includes('"settings.locale.en-US":`Русский`')) {
  throw new Error('Validation failed: Russian language label not found');
}

fs.writeFileSync(intlPath, src);
log('Patched', intlName, 'successfully. New size:', src.length, 'bytes');

// Pack back into app.asar
log('Repacking app.asar...');
execFileSync(process.execPath, [asarBin, 'pack', workDir, asarPath], { stdio: 'pipe' });
log('Repacked to:', asarPath);

// Cleanup work directory
fs.rmSync(workDir, { recursive: true, force: true });
log('Cleaned up temp directory.');

// Update setting.json to en-US
try {
  const settingsPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.zcode', 'v2', 'setting.json');
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    let changed = false;
    if (settings.locale !== 'en-US') { settings.locale = 'en-US'; changed = true; }
    if (settings.localePreference !== 'en-US') { settings.localePreference = 'en-US'; changed = true; }
    if (changed) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      log('Updated setting.json to en-US (Russian locale mapped).');
    }
  }
} catch (e) {
  log('Note: setting.json update warning:', e.message);
}

log('PATCH OK — ZCode localized to Russian on en-US base.');
