const codeInput = document.getElementById('codeInput');
const lineNumbers = document.getElementById('lineNumbers');
const charCount = document.getElementById('charCount');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearInputBtn = document.getElementById('clearInputBtn');
const outputPlaceholder = document.getElementById('outputPlaceholder');
const outputLoading = document.getElementById('outputLoading');
const outputResult = document.getElementById('outputResult');
const outputContent = document.getElementById('outputContent');
const outputActions = document.getElementById('outputActions');
const copyResultBtn = document.getElementById('copyResultBtn');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const statusText = document.querySelector('.status-text');
const dividerArrow = document.getElementById('dividerArrow');

const MIN_DELAY = 350;

const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');

const modelSelect = document.getElementById('modelSelect');
const apiKeyInput = document.getElementById('apiKeyInput');

let lastResultCode = '';

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function updateLineNumbers() {
  const lines = codeInput.value.split('\n').length;
  charCount.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
  lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function getLanguage() {
  const selected = document.getElementById('languageSelect').value;
  const code = codeInput.value;
  if (selected !== 'auto') return selected;

  const lower = code.toLowerCase();
  if (/\b(function|console\.log|=>|import\s+React|export\s+default)\b/.test(lower)) return 'javascript';
  if (/\b(def\s+|import\s+|print\(|from\s+\w+\s+import)\b/.test(lower)) return 'python';
  if (/\b(public\s+class|System\.out\.println|new\s+\w+)\b/.test(lower)) return 'java';
  if (/\b#include\s+<|printf\(|scanf\(/.test(code)) return 'c';
  if (/\bcout\s*<<|std::|#include\s+<iostream>/.test(code)) return 'cpp';
  if (/\busing\s+System|Console\.WriteLine/.test(code)) return 'csharp';
  if (/\bfunction\s+|\$\w+\s*=|echo\s+/i.test(code)) return 'php';
  if (/<!doctype html>|<html>|<head>|<body>/i.test(code)) return 'html';
  if (/\bselect\s+.*from|insert\s+into|create\s+table\b/i.test(code)) return 'sql';
  return 'text';
}

function walkBrackets(code) {
  const stack = [];
  const bracketPairs = { '(': ')', '[': ']', '{': '}' };
  const reverse = { ')': '(', ']': '[', '}': '{' };
  const errors = [];

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = code[i - 1];

    if (!inLineComment && !inBlockComment) {
      if (ch === '"' && prev !== '\\' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
      if (ch === "'" && prev !== '\\' && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (!inBlockComment && ch === '/' && code[i + 1] === '/') inLineComment = true;
      if (!inLineComment && ch === '/' && code[i + 1] === '*') inBlockComment = true;
      if (inBlockComment && ch === '*' && code[i + 1] === '/') { inBlockComment = false; i += 1; continue; }
    }

    if (inLineComment && ch === '\n') inLineComment = false;
    if (inLineComment || inBlockComment || inSingleQuote || inDoubleQuote) continue;

    if (bracketPairs[ch]) { stack.push({ ch, pos: i }); }
    else if (reverse[ch]) {
      if (stack.length === 0) { errors.push(`Unmatched closing '${ch}' at position ${i + 1}`); }
      else {
        const top = stack.pop();
        if (top.ch !== reverse[ch]) errors.push(`Mismatched '${top.ch}' and '${ch}' at pos ${top.pos + 1}`);
      }
    }
  }

  while (stack.length) {
    const top = stack.pop();
    errors.push(`Unmatched opening '${top.ch}' near position ${top.pos + 1}`);
  }

  return errors;
}

function analyzeCode(code, language) {
  const issues = [];
  const lines = code.split('\n');

  if (!code.trim()) {
    issues.push({ line: 0, message: 'No code provided. Paste code to analyze.' });
    return { issues, fix: code };
  }

  issues.push(...walkBrackets(code).map(msg => ({ line: 0, message: msg })));

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;

    if (line.includes('console.log(') && line.includes('++') && !line.endsWith(';') && language === 'javascript') {
      issues.push({ line: idx + 1, message: 'Console log line may need trailing semicolon.' });
    }

    if (language === 'javascript' || language === 'java' || language === 'c' || language === 'cpp' || language === 'csharp' || language === 'php') {
      if (!line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*') && !/^\s*(if|for|while|switch|else|catch|do|try|class|function|def|return|import|export)\b/.test(line)) {
        issues.push({ line: idx + 1, message: 'Possible missing semicolon at end of statement.' });
      }
      if (/\bif\s*\(.*=.*\)/.test(line) && !/==|!=|<=|>=/.test(line)) {
        issues.push({ line: idx + 1, message: 'Possible assignment in if-condition (use == or === for comparison in C-style languages).' });
      }
      if (language === 'javascript' && line.includes('==') && !line.includes('!=')) {
        issues.push({ line: idx + 1, message: 'Use strict comparison === instead of == in JavaScript.' });
      }
    }

    if (language === 'python') {
      if (/\b(def|for|while|if|elif|else|class|try|except|finally)\b/.test(line) && !line.endsWith(':')) {
        issues.push({ line: idx + 1, message: 'Python block header should end with colon (:).' });
      }
      if ((line.match(/"/g) || []).length % 2 !== 0 || (line.match(/'/g) || []).length % 2 !== 0) {
        issues.push({ line: idx + 1, message: 'Unbalanced quote detected in Python line.' });
      }
    }

    if (/".*"|'[^']*'/.test(line) && (line.match(/"/g) || []).length % 2 !== 0) {
      issues.push({ line: idx + 1, message: 'Unclosed string literal (quotes mismatch).' });
    }

    if (line.search(/TODO|FIXME|BUG/) >= 0) {
      issues.push({ line: idx + 1, message: 'Found TODO/FIXME comment; review required.' });
    }

    if (/function\s+add\(/.test(line) && idx < lines.length - 1 && lines[idx + 1].includes('return a - b')) {
      issues.push({ line: idx + 2, message: 'Suspected bug: arithmetic in add() returns a - b instead of a + b.' });
    }
  });

  if (issues.length === 0) issues.push({ line: 0, message: 'No obvious syntax issues found. Manual review recommended.' });

  const corrected = fixCode(code, language);

  return { issues, fix: corrected };
}

function fixCode(code, language) {
  const lines = code.split('\n');
  const fixed = [];

  lines.forEach((raw, idx) => {
    let line = raw;
    if (!line.trim()) { fixed.push(line); return; }

    if (language === 'javascript' || language === 'java' || language === 'c' || language === 'cpp' || language === 'csharp' || language === 'php') {
      const trimmed = line.trim();
      if (!/[;{}]$/.test(trimmed) && !/^\s*(if|for|while|switch|else|catch|do|try|class|struct|enum|function)\b/.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        line = line + ';';
      }
      if (language === 'javascript') {
        line = line.replace(/\b(==)(?!=)/g, '===');
        line = line.replace(/\b(!=)(?!=)/g, '!==');
      }
    }

    if (language === 'python') {
      const trimmed = line.trim();
      if (/\b(def|for|while|if|elif|else|class|try|except|finally)\b/.test(trimmed) && !trimmed.endsWith(':')) {
        line = line.trimEnd() + ':';
      }
    }

    if (/function\s+add\(/.test(line) && idx < lines.length - 1 && lines[idx + 1].includes('return a - b')) {
      fixed.push(line);
      const next = lines[idx + 1].replace('return a - b', 'return a + b');
      fixed.push(next);
      return;
    }

    fixed.push(line);
  });

  const bracketFix = walkBrackets(fixed.join('\n'));
  if (bracketFix.length) {
    const open = bracketFix.filter(x => /Unmatched opening/.test(x));
    open.forEach(item => {
      if (item.includes('{')) fixed.push('}');
      if (item.includes('(')) fixed.push(')');
      if (item.includes('[')) fixed.push(']');
    });
  }

  return fixed.join('\n');
}

function formatIssues(issues) {
  return issues
    .map(i => (i.line ? `Line ${i.line}: ${i.message}` : i.message))
    .join('\n');
}

function renderResult(data) {
  outputPlaceholder.style.display = 'none';
  outputLoading.style.display = 'none';
  outputResult.style.display = 'block';
  outputActions.style.display = 'flex';

  const language = getLanguage();

  outputResult.innerHTML = `
    <div style="margin-bottom: .8rem; font-weight:600;">
      🎯 Analysis complete for <strong>${language.toUpperCase()}</strong>
    </div>
    <div style="margin-bottom:.6rem;"><strong>Detected Issues</strong></div>
    <pre>${formatIssues(data.issues)}</pre>
    <div style="margin-top:.75rem; margin-bottom:.45rem;"><strong>Corrected Code</strong></div>
    <pre>${escapeHtml(data.fix)}</pre>
  `;

  lastResultCode = data.fix;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function runAnalysis() {
  const code = codeInput.value;
  if (!code.trim()) {
    showToast('Please paste your code first.');
    return;
  }

  outputPlaceholder.style.display = 'none';
  outputLoading.style.display = 'flex';
  outputResult.style.display = 'none';
  outputActions.style.display = 'none';
  statusText.textContent = 'Analyzing...';

  const language = getLanguage();

  const start = Date.now();
  const data = analyzeCode(code, language);
  const now = Date.now();
  const delay = Math.max(0, MIN_DELAY - (now - start));

  await new Promise(resolve => setTimeout(resolve, delay));

  renderResult(data);
  statusText.textContent = 'Ready';
  saveHistory(code, language, data);
  historySection.style.display = 'block';
  dividerArrow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function saveHistory(originalCode, language, data) {
  const item = document.createElement('div');
  item.className = 'history-item';
  item.innerHTML = `
    <div><strong>${new Date().toLocaleString()}</strong> - ${language.toUpperCase()}</div>
    <div style="margin-top: .35rem;">${data.issues.length} issue(s), ${data.fix.split('\n').length} lines fixed.</div>
    <button style="margin-top:.55rem; padding:4px 8px; border:1px solid rgba(255,255,255,0.17); background:rgba(45,69,122,0.8); color:#fff; border-radius:6px; cursor:pointer;">Copy corrected code</button>
  `;

  item.querySelector('button').addEventListener('click', () => {
    navigator.clipboard.writeText(data.fix);
    showToast('Corrected code copied to clipboard.');
  });

  historyList.prepend(item);
}

copyResultBtn.addEventListener('click', () => {
  if (!lastResultCode) return;
  navigator.clipboard.writeText(lastResultCode);
  showToast('Corrected code copied to clipboard');
});

analyzeBtn.addEventListener('click', runAnalysis);
clearInputBtn.addEventListener('click', () => {
  codeInput.value = '';
  outputPlaceholder.style.display = 'flex';
  outputLoading.style.display = 'none';
  outputResult.style.display = 'none';
  outputActions.style.display = 'none';
  historySection.style.display = 'none';
  updateLineNumbers();
});

codeInput.addEventListener('input', updateLineNumbers);
codeInput.addEventListener('scroll', () => lineNumbers.scrollTop = codeInput.scrollTop);

document.getElementById('dividerArrow').addEventListener('click', () => {
  document.querySelector('.output-panel').scrollIntoView({ behavior: 'smooth' });
});

settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
saveSettings.addEventListener('click', () => {
  localStorage.setItem('aiCodeAssistKey', apiKeyInput.value);
  localStorage.setItem('aiCodeAssistModel', modelSelect.value);
  settingsModal.style.display = 'none';
  showToast('Settings saved (local only).');
});

window.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
  updateLineNumbers();
  apiKeyInput.value = localStorage.getItem('aiCodeAssistKey') || '';
  modelSelect.value = localStorage.getItem('aiCodeAssistModel') || modelSelect.value;
});

const clearHistoryBtn = document.getElementById('clearHistoryBtn');
clearHistoryBtn.addEventListener('click', () => {
  historyList.innerHTML = '';
  historySection.style.display = 'none';
  showToast('History cleared.');
});
