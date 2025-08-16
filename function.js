/* Enhanced Smart Job & Portfolio Matcher
   - Adds fuzzy matching (Levenshtein-based) for skill comparison
   - CSV import (file input + drag/drop)
   - Improved PDF export formatting
*/

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

function extractKeywords(text) {
  if(!text) return [];
  const stopwords = new Set(["and","or","the","to","with","a","an","for","in","of","on","is","are","be","by","as","that","this","at","from","we","you","your","will","role","responsible","experience"]);
  return [...new Set(text
    .toLowerCase()
    .replace(/[^\w\s,]/g, " ")
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(s => s && !stopwords.has(s))
  )];
}

// Levenshtein distance & normalized similarity
function levenshtein(a,b){
  if(a===b) return 0;
  const m = a.length, n = b.length;
  if(m===0) return n;
  if(n===0) return m;
  const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}
function similarity(a,b){
  if(!a || !b) return 0;
  const dist = levenshtein(a,b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen); // 1 => identical, 0 => very different
}

// ---------- DOM ----------
const startBtn = document.getElementById('start-btn');
const viewHistoryBtn = document.getElementById('view-history-btn');
const addProjectBtn = document.getElementById('add-project');
const clearProjectsBtn = document.getElementById('clear-projects');
const projectsList = document.getElementById('projects-list');

const projTitle = document.getElementById('proj-title');
const projSkills = document.getElementById('proj-skills');
const projDesc = document.getElementById('proj-desc');

const jobDesc = document.getElementById('job-desc');
const matchBtn = document.getElementById('match-btn');
const suggestBtn = document.getElementById('suggest-btn');

const matchSummary = document.getElementById('match-summary');
const overallPercent = document.getElementById('overall-percent');
const bestRole = document.getElementById('best-role');
const bestProject = document.getElementById('best-project');
const detailedResults = document.getElementById('detailed-results');

const ring = document.querySelector('.ring');
const suggestionsSection = document.getElementById('suggestions');
const suggestionsList = document.getElementById('suggestions-list');

const exportPdfBtn = document.getElementById('export-pdf');
const saveHistoryBtn = document.getElementById('save-history');
const viewHistoryModal = document.getElementById('history-modal');
const viewHistoryBtn2 = document.getElementById('view-history-btn');
const closeHistoryBtn = document.getElementById('close-history');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history');

const csvInput = document.getElementById('csv-input');
const dropZone = document.getElementById('drop-zone');

// ---------- State ----------
let projects = JSON.parse(localStorage.getItem('sm_projects') || '[]');
let history = JSON.parse(localStorage.getItem('sm_history') || '[]');
let lastMatch = null;

// ---------- Init ----------
function renderProjects(){
  projectsList.innerHTML = '';
  if(projects.length === 0){
    projectsList.innerHTML = `<p class="muted">No projects yet. Add one to get started.</p>`;
    return;
  }
  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = 'project-item';
    div.innerHTML = `
      <div class="project-meta">
        <div class="project-title">${p.title}</div>
        <div class="project-skills">${p.skills.join(', ')}</div>
      </div>
      <div>
        <button class="remove-btn" data-id="${p.id}">✕</button>
      </div>
    `;
    projectsList.appendChild(div);
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      projects = projects.filter(x => x.id !== id);
      saveProjects();
      renderProjects();
    };
  });
}

function saveProjects(){
  localStorage.setItem('sm_projects', JSON.stringify(projects));
}
function saveHistory(entry){
  history.unshift(entry);
  if(history.length > 40) history.pop();
  localStorage.setItem('sm_history', JSON.stringify(history));
}

// ---------- Add / Clear Projects ----------
addProjectBtn.addEventListener('click', () => {
  const title = projTitle.value.trim() || 'Untitled Project';
  const skills = extractKeywords(projSkills.value).map(s => s.toUpperCase());
  const desc = projDesc.value.trim();
  if(skills.length === 0){ alert('Add at least one skill (comma or space separated).'); return; }
  const newProj = { id: uid(), title, skills, desc, created: Date.now() };
  projects.push(newProj);
  saveProjects();
  renderProjects();
  projTitle.value = ''; projSkills.value = ''; projDesc.value = '';
});

clearProjectsBtn.addEventListener('click', () => {
  if(!confirm('Clear all projects?')) return;
  projects = []; saveProjects(); renderProjects();
});

// ---------- CSV import & Drag/Drop ----------
function parseCSV(text){
  // Very simple CSV parse: split lines, split by comma, trim.
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out = [];
  for(let line of lines){
    // allow quoted values? simple split for now:
    const parts = line.split(',').map(p=>p.trim());
    // If only skills provided, fill title
    const title = parts[0] || 'Untitled';
    const skills = (parts[1] || '').replace(/;+/g,',').trim();
    const desc = parts.slice(2).join(',') || '';
    out.push({ title, skills, desc });
  }
  return out;
}

csvInput && csvInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = parseCSV(ev.target.result);
    parsed.forEach(row => {
      const p = { id: uid(), title: row.title, skills: extractKeywords(row.skills).map(s=>s.toUpperCase()), desc: row.desc, created: Date.now() };
      if(p.skills.length) projects.push(p);
    });
    saveProjects(); renderProjects();
  };
  reader.readAsText(file);
});

// drag & drop
if(dropZone){
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      parsed.forEach(row => {
        const p = { id: uid(), title: row.title, skills: extractKeywords(row.skills).map(s=>s.toUpperCase()), desc: row.desc, created: Date.now() };
        if(p.skills.length) projects.push(p);
      });
      saveProjects(); renderProjects();
    };
    reader.readAsText(file);
  });
}

// ---------- Matching Algorithm with fuzzy matching ----------
function runMatch(){
  const jobText = jobDesc.value.trim();
  if(!jobText){ alert('Please paste a job description to match.'); return; }
  if(projects.length === 0){ alert('Add at least one project to match against.'); return; }

  const jobKeywordsRaw = extractKeywords(jobText);
  const jobKeywords = jobKeywordsRaw.map(k => k.toUpperCase());

  // For each project: for each project skill, try exact or fuzzy match against jobKeywords.
  // If similarity >= 0.75 consider it matched.
  const results = projects.map(p => {
    const matched = [];
    const missing = [];
    p.skills.forEach(skill => {
      // exact
      if(jobKeywords.includes(skill)){
        matched.push(skill);
        return;
      }
      // fuzzy
      let bestSim = 0;
      for(const jk of jobKeywords){
        const sim = similarity(skill.toLowerCase(), jk.toLowerCase());
        if(sim > bestSim) bestSim = sim;
      }
      if(bestSim >= 0.75){
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    });
    const score = Math.round((matched.length / Math.max(p.skills.length,1)) * 100);
    return { ...p, matched, missing, score };
  });

  const best = results.reduce((a,b) => (b.score > a.score ? b : a), results[0]);
  displayResults(results, best, jobKeywords);
  lastMatch = { timestamp: Date.now(), jobText, results, best, jobKeywords };
}

// ---------- Display & animation ----------
function displayResults(results, best, jobKeywords){
  const overall = best.score || 0;
  animateRing(overall);
  overallPercent.textContent = overall;
  bestRole.textContent = `Best Project Match: ${best.title} (${best.score}%)`;
  bestProject.textContent = best.desc ? `Description: ${best.desc}` : 'No description provided';

  detailedResults.innerHTML = '';
  results.sort((a,b) => b.score - a.score).forEach(r => {
    const div = document.createElement('div');
    div.className = 'job-result';
    div.innerHTML = `
      <div class="job-info">
        <div class="job-title">${r.title}</div>
        <div class="job-meta">Skills: ${r.skills.join(', ')}</div>
        <div class="job-meta">Matched: ${r.matched.join(', ') || '—'}</div>
        <div class="missing-list">Missing: ${r.missing.join(', ') || 'None'}</div>
      </div>
      <div>
        <div class="match-pill">${r.score}%</div>
      </div>
    `;
    detailedResults.appendChild(div);
  });

  matchSummary.classList.remove('hidden');
  suggestionsSection.classList.add('hidden');
}

function animateRing(percent){
  const circle = document.querySelector('.ring');
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  const offset = circumference - (percent / 100 * circumference);
  circle.style.strokeDashoffset = circumference;
  setTimeout(() => { circle.style.strokeDashoffset = offset; }, 80);
}

// ---------- Suggestions ----------
suggestBtn.addEventListener('click', () => {
  const jobText = jobDesc.value.trim();
  if(!jobText){ alert('Paste a job description to generate suggestions.'); return; }
  const jobKeywords = extractKeywords(jobText).map(k => k.toUpperCase());
  const allProjectSkills = projects.flatMap(p => p.skills);
  const missing = jobKeywords.filter(k => !allProjectSkills.includes(k));
  suggestionsList.innerHTML = '';
  if(missing.length === 0){
    suggestionsList.innerHTML = `<li>Nice! Your portfolio covers most keywords from the job.</li>`;
  } else {
    missing.slice(0,12).forEach(ms => {
      const li = document.createElement('li');
      li.textContent = `Consider adding projects or learning: ${ms}`;
      suggestionsList.appendChild(li);
    });
  }
  suggestionsSection.classList.remove('hidden');
});

// ---------- Export PDF (cleaner report) ----------
exportPdfBtn.addEventListener('click', () => {
  if(!lastMatch){
    alert('Run a match first then export.');
    return;
  }
  const el = document.createElement('div');
  el.style.padding = '18px';
  el.style.fontFamily = 'Poppins, Arial, sans-serif';
  const date = new Date().toLocaleString();
  el.innerHTML = `
    <h2>Match Report</h2>
    <p><strong>Generated:</strong> ${date}</p>
    <h3>Best Project: ${lastMatch.best.title} — ${lastMatch.best.score}%</h3>
    <p>${lastMatch.best.desc || ''}</p>
    <h4>Detailed Scores</h4>
    ${lastMatch.results.map(r => `
      <div style="margin-bottom:8px;padding:8px;border:1px solid #eee;border-radius:6px">
        <strong>${r.title}</strong> — ${r.score}%<br>
        Matched: ${r.matched.join(', ') || '—'}<br>
        Missing: ${r.missing.join(', ') || 'None'}
      </div>
    `).join('')}
    <h4>Job Snippet</h4>
    <pre style="white-space:pre-wrap;background:#fafafa;padding:10px;border-radius:6px">${lastMatch.jobText.slice(0,1000)}</pre>
  `;
  const opt = { margin:0.4, filename:`match-report-${Date.now()}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} };
  html2pdf().set(opt).from(el).save();
});

// ---------- History & UI ----------
saveHistoryBtn.addEventListener('click', () => {
  if(!lastMatch){ alert('Run a match first before saving to history.'); return; }
  const entry = { id: uid(), ts: Date.now(), best: lastMatch.best.title, bestScore: lastMatch.best.score, results: lastMatch.results.map(r=>({title:r.title,score:r.score,matched:r.matched,missing:r.missing})), jobSnippet: lastMatch.jobText.slice(0,300) };
  saveHistory(entry);
  renderHistory();
  alert('Saved to history.');
});

viewHistoryBtn.addEventListener('click', openHistory);
viewHistoryBtn2 && (viewHistoryBtn2.onclick = openHistory);
closeHistoryBtn && (closeHistoryBtn.onclick = () => viewHistoryModal.classList.add('hidden'));
clearHistoryBtn && (clearHistoryBtn.onclick = () => { if(confirm('Clear history?')){ history=[]; localStorage.removeItem('sm_history'); renderHistory(); } });

function openHistory(){ renderHistory(); viewHistoryModal.classList.remove('hidden'); }
function renderHistory(){
  historyList.innerHTML = '';
  if(history.length === 0){ historyList.innerHTML = '<p class="muted">No saved matches yet.</p>'; return; }
  history.forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const date = new Date(h.ts).toLocaleString();
    div.innerHTML = `<div>
      <div style="font-weight:700">${h.best} — ${h.bestScore}%</div>
      <div style="font-size:13px;color:#6b7280">${date}</div>
      <div style="font-size:13px;margin-top:6px">${h.jobSnippet}...</div>
    </div>
    <div>
      <button class="btn small" data-id="${h.id}">Load</button>
    </div>`;
    historyList.appendChild(div);
  });

  document.querySelectorAll('.history-item button').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const entry = history.find(x => x.id === id);
      if(entry){
        alert(`Loaded history entry — open console for details.`);
        console.log('History load:', entry);
      }
    };
  });
}

// ---------- Bind match ----------
matchBtn.addEventListener('click', runMatch);

// ---------- Hero typing ----------
const heroText = "Smart Job & Portfolio Matcher";
let idx = 0;
function heroTyping(){ const el = document.getElementById('hero-typing'); if(idx <= heroText.length){ el.textContent = heroText.slice(0, idx++); setTimeout(heroTyping, 60); } }
heroTyping();

// ---------- Startup ----------
renderProjects();
(function(){ history = JSON.parse(localStorage.getItem('sm_history') || '[]'); })();
