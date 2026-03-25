// Disaster Tweet Classification Frontend JS
// NOTE: Backend API endpoints must be set up separately.


// --- Section Navigation Logic ---
const mainPage = document.getElementById('main-page');
const resultPage = document.getElementById('result-page');
const dashboardPage = document.getElementById('dashboard-page');

let lastResult = null;
let selectedHistoryIndex = null;

function showSection(section) {
  mainPage.classList.add('d-none');
  resultPage.classList.add('d-none');
  dashboardPage.classList.add('d-none');
  section.classList.remove('d-none');
  if (section === dashboardPage) renderDashboard();
  if (section === resultPage) renderResult();
}

// Navbar links
document.querySelectorAll('a[href="#main-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(mainPage); }));
document.querySelectorAll('a[href="#result-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(resultPage); }));
document.querySelectorAll('a[href="#dashboard-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(dashboardPage); }));

// Action buttons in result/dashboard

// Button actions for dashboard and result page
document.addEventListener('click', function(e) {
  // Classify Another Tweet (Result page)
  if (e.target.closest('.btn-dark') && e.target.textContent.includes('Classify Another')) {
    showSection(mainPage);
    tweetInput.value = '';
    if (csvUpload) csvUpload.value = '';
    lastResult = null;
    selectedHistoryIndex = null;
  }
  // View Dashboard (Result page)
  if (e.target.closest('.btn-outline-dark') && e.target.textContent.includes('Dashboard')) {
    showSection(dashboardPage);
  }
  // Go Back (Result page)
  if (e.target.closest('.btn-outline-secondary') && e.target.textContent.includes('Go Back')) {
    showSection(mainPage);
  }
  // View details (Dashboard history)
  if (e.target.closest('a') && e.target.textContent.includes('View details')) {
    const idx = e.target.closest('.list-group-item').dataset.idx;
    selectedHistoryIndex = parseInt(idx, 10);
    showSection(resultPage);
  }
  // Export CSV (Dashboard)
  if (e.target.closest('button') && e.target.textContent.includes('Export CSV')) {
    exportResults(getHistory());
  }
  // Clear All (Dashboard)
  if (e.target.closest('button') && e.target.textContent.includes('Clear All')) {
    if (confirm('Clear all classification history?')) {
      localStorage.removeItem(HISTORY_KEY);
      lastResult = null;
      selectedHistoryIndex = null;
      renderDashboard();
      showSection(mainPage);
    }
  }
  // Export Result (Result page)
  if (e.target.closest('button') && e.target.textContent.includes('Export Result')) {
    let r = lastResult;
    const history = getHistory();
    if (selectedHistoryIndex !== null && history[selectedHistoryIndex]) {
      r = history[selectedHistoryIndex];
    }
    if (r) exportResults([r]);
  }
});

// Example Tweets
document.querySelectorAll('#example-tweets button').forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    tweetInput.value = btn.textContent;
    classifyAndShowResult([btn.textContent]);
  });
});

// Tab logic for single/batch
const tabSingle = document.getElementById('tab-single');
const tabBatch = document.getElementById('tab-batch');
const singleInputCard = document.getElementById('single-input-card');
const batchInputCard = document.getElementById('batch-input-card');
if (tabSingle && tabBatch && singleInputCard && batchInputCard) {
  tabSingle.addEventListener('click', () => {
    tabSingle.classList.add('active');
    tabBatch.classList.remove('active');
    singleInputCard.classList.remove('d-none');
    batchInputCard.classList.add('d-none');
  });
  tabBatch.addEventListener('click', () => {
    tabBatch.classList.add('active');
    tabSingle.classList.remove('active');
    batchInputCard.classList.remove('d-none');
    singleInputCard.classList.add('d-none');
  });
}

// --- Classification and History Logic ---
const tweetForm = document.getElementById('tweet-form');
const tweetInput = document.getElementById('tweet-input');
const csvUpload = document.getElementById('csv-upload');
const clearBtn = document.getElementById('clear-btn');

if (tweetForm) tweetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tweets = getTweetsFromInput();
  if (!tweets.length) return;
  classifyAndShowResult(tweets);
});

function classifyAndShowResult(tweets) {
  const results = classifyTweets(tweets);
  // Save all to history, but show only the first result
  saveToHistory(results);
  lastResult = results[0];
  selectedHistoryIndex = null;
  showSection(resultPage);
}

if (clearBtn) clearBtn.addEventListener('click', () => {
  tweetInput.value = '';
  if (csvUpload) csvUpload.value = '';
});

if (csvUpload) csvUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) readCSVFile(file);
});

// --- Result Page Rendering ---
function renderResult() {
  // Find which result to show
  let r = lastResult;
  const history = getHistory();
  if (selectedHistoryIndex !== null && history[selectedHistoryIndex]) {
    r = history[selectedHistoryIndex];
  }
  if (!r) return;
  // Update alert
  const urgentAlert = resultPage.querySelector('.alert-danger');
  if (urgentAlert) urgentAlert.style.display = (r.category === 'Rescue Request') ? '' : 'none';
  // Update tweet
  const tweetBox = resultPage.querySelector('.border-danger');
  if (tweetBox) tweetBox.textContent = r.tweet;
  // Update category
  const catBadge = resultPage.querySelector('.badge-red, .badge-yellow, .badge-green, .badge-gray');
  if (catBadge) {
    catBadge.className = 'badge p-2 ' + CATEGORY_MAP[r.category].color;
    catBadge.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i>${r.category} <span class="ms-2 small">${r.confidence}%</span>`;
  }
  // Update confidence bar
  const confBar = resultPage.querySelector('.progress-bar');
  if (confBar) {
    confBar.style.width = r.confidence + '%';
    confBar.textContent = r.confidence + '%';
    confBar.setAttribute('aria-valuenow', r.confidence);
  }
  // Update confidence text
  const confText = resultPage.querySelector('.text-success.mt-1');
  if (confText) {
    confText.textContent = (parseFloat(r.confidence) >= 80) ? '✓ Good confidence - classification is reliable' : 'Classification confidence is moderate';
  }
  // Update date
  const dateBox = resultPage.querySelector('.small.text-secondary');
  if (dateBox) dateBox.innerHTML = `<i class="bi bi-clock"></i> Classified on ${r.date}`;
}

// --- Dashboard Rendering ---
function renderDashboard() {
  // Analytics cards
  const history = getHistory();
  const total = history.length;
  const urgent = history.filter(r => r.category === 'Rescue Request').length;
  const damage = history.filter(r => r.category === 'Damage Report').length;
  const safety = history.filter(r => r.category === 'Safety Update').length;
  const general = history.filter(r => r.category === 'General Information').length;
  const avgConf = total ? (history.reduce((a, r) => a + parseFloat(r.confidence), 0) / total).toFixed(1) : '0.0';
  const urgentPct = total ? ((urgent / total) * 100).toFixed(1) : '0.0';

  // Cards (KPI)
  const cards = dashboardPage.querySelectorAll('.card-body');
  if (cards[0]) { // Total
    cards[0].querySelector('.fw-bold').textContent = total;
    cards[0].querySelector('.text-secondary').textContent = 'Total Classified';
    cards[0].querySelector('.small.text-muted').textContent = 'All time tweets';
  }
  if (cards[1]) { // Urgent
    cards[1].querySelector('.fw-bold').textContent = urgent;
    cards[1].querySelector('.text-secondary').textContent = 'Urgent Requests';
    cards[1].querySelector('.small.text-danger').innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${urgentPct}% urgent`;
  }
  if (cards[2]) { // Avg Confidence
    cards[2].querySelector('.fw-bold').textContent = avgConf + '%';
    cards[2].querySelector('.text-secondary').textContent = 'Avg. Confidence';
    cards[2].querySelector('.small.text-muted').textContent = 'Model accuracy';
  }
  if (cards[3]) { // Safety
    cards[3].querySelector('.fw-bold').textContent = safety;
    cards[3].querySelector('.text-secondary').textContent = 'Safety Updates';
    cards[3].querySelector('.small.text-success').textContent = 'Relief & evacuation info';
  }

  // Pie chart (Category Distribution)
  const pieCanvas = document.getElementById('category-chart-dashboard');
  if (pieCanvas) {
    if (pieCanvas.chart) pieCanvas.chart.destroy();
    const stats = {
      'Rescue Request': urgent,
      'Damage Report': damage,
      'Safety Update': safety,
      'General Information': general
    };
    pieCanvas.chart = new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: Object.keys(CATEGORY_MAP),
        datasets: [{
          data: Object.keys(CATEGORY_MAP).map(cat => stats[cat]),
          backgroundColor: ['#e53935', '#fbc02d', '#43a047', '#bdbdbd']
        }]
      },
      options: { plugins: { legend: { display: true, position: 'bottom' } } }
    });
  }

  // Bar chart (Category Counts)
  const barCanvas = document.getElementById('category-bar-dashboard');
  if (barCanvas) {
    if (barCanvas.chart) barCanvas.chart.destroy();
    const stats = {
      'Rescue Request': urgent,
      'Damage Report': damage,
      'Safety Update': safety,
      'General Information': general
    };
    barCanvas.chart = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: Object.keys(CATEGORY_MAP),
        datasets: [{
          data: Object.keys(CATEGORY_MAP).map(cat => stats[cat]),
          backgroundColor: ['#e53935', '#fbc02d', '#43a047', '#bdbdbd']
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, precision: 0 }
        }
      }
    });
  }

  // History list
  const listGroup = dashboardPage.querySelector('.list-group');
  if (listGroup) {
    listGroup.innerHTML = '';
    history.slice().reverse().forEach((r, idx) => {
      const i = history.length - 1 - idx;
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.dataset.idx = i;
      item.innerHTML = `
        <div>
          <div class="fw-bold">${escapeHtml(r.tweet)}</div>
          <div class="small text-muted"><i class="bi bi-clock"></i> ${r.date}</div>
        </div>
        <span class="badge p-2 ${CATEGORY_MAP[r.category].color}"><i class="bi bi-exclamation-circle me-1"></i>${r.category} <span class="ms-2 small">${r.confidence}%</span></span>
        <a href="#result-page" class="small ms-3">View details →</a>
      `;
      listGroup.appendChild(item);
    });
  }
}

// --- Storage and Utility Functions ---
const CATEGORY_MAP = {
  'Rescue Request': { color: 'badge-red', label: '🔴 Rescue Request' },
  'Damage Report': { color: 'badge-yellow', label: '🟡 Damage Report' },
  'Safety Update': { color: 'badge-green', label: '🟢 Safety Update' },
  'General Information': { color: 'badge-gray', label: '⚪ General Info' }
};
const HISTORY_KEY = 'disaster_tweet_history';
function getTweetsFromInput() {
  const text = tweetInput.value.trim();
  if (!text) return [];
  return text.split(/\n+/).map(t => t.trim()).filter(Boolean);
}
function readCSVFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split(/\r?\n/);
    tweetInput.value = lines.join('\n');
  };
  reader.readAsText(file);
}
function classifyTweets(tweets) {
  // Demo: random category and confidence
  return tweets.map(tweet => {
    const cats = Object.keys(CATEGORY_MAP);
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const conf = (80 + Math.random() * 20).toFixed(1);
    return {
      tweet,
      category: cat,
      confidence: conf,
      date: new Date().toLocaleString()
    };
  });
}
function saveToHistory(results) {
  const history = getHistory();
  results.forEach(r => history.push(r));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
function getHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Init ---
showSection(mainPage);

// --- Existing logic below ---
const tweetForm = document.getElementById('tweet-form');
const tweetInput = document.getElementById('tweet-input');
const csvUpload = document.getElementById('csv-upload');
const clearBtn = document.getElementById('clear-btn');
const resultSection = document.getElementById('result-section');
const alertBanner = document.getElementById('alert-banner');
const singleResult = document.getElementById('single-result');

  const h = getHistory();
  // --- Section Navigation Logic ---
  const mainPage = document.getElementById('main-page');
  const resultPage = document.getElementById('result-page');
  const dashboardPage = document.getElementById('dashboard-page');

  let lastResult = null;
  let selectedHistoryIndex = null;

  function showSection(section) {
    mainPage.classList.add('d-none');
    resultPage.classList.add('d-none');
    dashboardPage.classList.add('d-none');
    section.classList.remove('d-none');
    if (section === dashboardPage) renderDashboard();
    if (section === resultPage) renderResult();
  }

  // Navbar links
  document.querySelectorAll('a[href="#main-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(mainPage); }));
  document.querySelectorAll('a[href="#result-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(resultPage); }));
  document.querySelectorAll('a[href="#dashboard-page"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showSection(dashboardPage); }));

  // Button actions for dashboard and result page
  document.addEventListener('click', function(e) {
    // Classify Another Tweet (Result page)
    if (e.target.closest('.btn-dark') && e.target.textContent.includes('Classify Another')) {
      showSection(mainPage);
      tweetInput.value = '';
      if (csvUpload) csvUpload.value = '';
      lastResult = null;
      selectedHistoryIndex = null;
    }
    // View Dashboard (Result page)
    if (e.target.closest('.btn-outline-dark') && e.target.textContent.includes('Dashboard')) {
      showSection(dashboardPage);
    }
    // Go Back (Result page)
    if (e.target.closest('.btn-outline-secondary') && e.target.textContent.includes('Go Back')) {
      showSection(mainPage);
    }
    // View details (Dashboard history)
    if (e.target.closest('a') && e.target.textContent.includes('View details')) {
      const idx = e.target.closest('.list-group-item').dataset.idx;
      selectedHistoryIndex = parseInt(idx, 10);
      showSection(resultPage);
    }
    // Export CSV (Dashboard)
    if (e.target.closest('button') && e.target.textContent.includes('Export CSV')) {
      exportResults(getHistory());
    }
    // Clear All (Dashboard)
    if (e.target.closest('button') && e.target.textContent.includes('Clear All')) {
      if (confirm('Clear all classification history?')) {
        localStorage.removeItem(HISTORY_KEY);
        lastResult = null;
        selectedHistoryIndex = null;
        renderDashboard();
        showSection(mainPage);
      }
    }
    // Export Result (Result page)
    if (e.target.closest('button') && e.target.textContent.includes('Export Result')) {
      let r = lastResult;
      const history = getHistory();
      if (selectedHistoryIndex !== null && history[selectedHistoryIndex]) {
        r = history[selectedHistoryIndex];
      }
      if (r) exportResults([r]);
    }
  });

  // Example Tweets
  document.querySelectorAll('#example-tweets button').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      tweetInput.value = btn.textContent;
      classifyAndShowResult([btn.textContent]);
    });
  });

  // Tab logic for single/batch
  const tabSingle = document.getElementById('tab-single');
  const tabBatch = document.getElementById('tab-batch');
  const singleInputCard = document.getElementById('single-input-card');
  const batchInputCard = document.getElementById('batch-input-card');
  if (tabSingle && tabBatch && singleInputCard && batchInputCard) {
    tabSingle.addEventListener('click', () => {
      tabSingle.classList.add('active');
      tabBatch.classList.remove('active');
      singleInputCard.classList.remove('d-none');
      batchInputCard.classList.add('d-none');
    });
    tabBatch.addEventListener('click', () => {
      tabBatch.classList.add('active');
      tabSingle.classList.remove('active');
      batchInputCard.classList.remove('d-none');
      singleInputCard.classList.add('d-none');
    });
  }

  // --- Classification and History Logic ---
  const tweetForm = document.getElementById('tweet-form');
  const tweetInput = document.getElementById('tweet-input');
  const csvUpload = document.getElementById('csv-upload');
  const clearBtn = document.getElementById('clear-btn');

  if (tweetForm) tweetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tweets = getTweetsFromInput();
    if (!tweets.length) return;
    classifyAndShowResult(tweets);
  });

  function classifyAndShowResult(tweets) {
    const results = classifyTweets(tweets);
    // Save all to history, but show only the first result
    saveToHistory(results);
    lastResult = results[0];
    selectedHistoryIndex = null;
    showSection(resultPage);
  }

  if (clearBtn) clearBtn.addEventListener('click', () => {
    tweetInput.value = '';
    if (csvUpload) csvUpload.value = '';
  });

  if (csvUpload) csvUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readCSVFile(file);
  });

  // --- Result Page Rendering ---
  function renderResult() {
    // Find which result to show
    let r = lastResult;
    const history = getHistory();
    if (selectedHistoryIndex !== null && history[selectedHistoryIndex]) {
      r = history[selectedHistoryIndex];
    }
    if (!r) return;
    // Update alert
    const urgentAlert = resultPage.querySelector('.alert-danger');
    if (urgentAlert) urgentAlert.style.display = (r.category === 'Rescue Request') ? '' : 'none';
    // Update tweet
    const tweetBox = resultPage.querySelector('.border-danger');
    if (tweetBox) tweetBox.textContent = r.tweet;
    // Update category
    const catBadge = resultPage.querySelector('.badge-red, .badge-yellow, .badge-green, .badge-gray');
    if (catBadge) {
      catBadge.className = 'badge p-2 ' + CATEGORY_MAP[r.category].color;
      catBadge.innerHTML = `<i class=\"bi bi-exclamation-circle me-1\"></i>${r.category} <span class=\"ms-2 small\">${r.confidence}%</span>`;
    }
    // Update confidence bar
    const confBar = resultPage.querySelector('.progress-bar');
    if (confBar) {
      confBar.style.width = r.confidence + '%';
      confBar.textContent = r.confidence + '%';
      confBar.setAttribute('aria-valuenow', r.confidence);
    }
    // Update confidence text
    const confText = resultPage.querySelector('.text-success.mt-1');
    if (confText) {
      confText.textContent = (parseFloat(r.confidence) >= 80) ? '✓ Good confidence - classification is reliable' : 'Classification confidence is moderate';
    }
    // Update date
    const dateBox = resultPage.querySelector('.small.text-secondary');
    if (dateBox) dateBox.innerHTML = `<i class=\"bi bi-clock\"></i> Classified on ${r.date}`;
  }

  // --- Dashboard Rendering ---
  function renderDashboard() {
    // Analytics cards
    const history = getHistory();
    const total = history.length;
    const urgent = history.filter(r => r.category === 'Rescue Request').length;
    const damage = history.filter(r => r.category === 'Damage Report').length;
    const safety = history.filter(r => r.category === 'Safety Update').length;
    const general = history.filter(r => r.category === 'General Information').length;
    const avgConf = total ? (history.reduce((a, r) => a + parseFloat(r.confidence), 0) / total).toFixed(1) : '0.0';
    const urgentPct = total ? ((urgent / total) * 100).toFixed(1) : '0.0';

    // Cards (KPI)
    const cards = dashboardPage.querySelectorAll('.card-body');
    if (cards[0]) { // Total
      cards[0].querySelector('.fw-bold').textContent = total;
      cards[0].querySelector('.text-secondary').textContent = 'Total Classified';
      cards[0].querySelector('.small.text-muted').textContent = 'All time tweets';
    }
    if (cards[1]) { // Urgent
      cards[1].querySelector('.fw-bold').textContent = urgent;
      cards[1].querySelector('.text-secondary').textContent = 'Urgent Requests';
      cards[1].querySelector('.small.text-danger').innerHTML = `<i class=\"bi bi-exclamation-triangle\"></i> ${urgentPct}% urgent`;
    }
    if (cards[2]) { // Avg Confidence
      cards[2].querySelector('.fw-bold').textContent = avgConf + '%';
      cards[2].querySelector('.text-secondary').textContent = 'Avg. Confidence';
      cards[2].querySelector('.small.text-muted').textContent = 'Model accuracy';
    }
    if (cards[3]) { // Safety
      cards[3].querySelector('.fw-bold').textContent = safety;
      cards[3].querySelector('.text-secondary').textContent = 'Safety Updates';
      cards[3].querySelector('.small.text-success').textContent = 'Relief & evacuation info';
    }

    // Pie chart (Category Distribution)
    const pieCanvas = document.getElementById('category-chart-dashboard');
    if (pieCanvas) {
      if (pieCanvas.chart) pieCanvas.chart.destroy();
      const stats = {
        'Rescue Request': urgent,
        'Damage Report': damage,
        'Safety Update': safety,
        'General Information': general
      };
      pieCanvas.chart = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: Object.keys(CATEGORY_MAP),
          datasets: [{
            data: Object.keys(CATEGORY_MAP).map(cat => stats[cat]),
            backgroundColor: ['#e53935', '#fbc02d', '#43a047', '#bdbdbd']
          }]
        },
        options: { plugins: { legend: { display: true, position: 'bottom' } } }
      });
    }

    // Bar chart (Category Counts)
    const barCanvas = document.getElementById('category-bar-dashboard');
    if (barCanvas) {
      if (barCanvas.chart) barCanvas.chart.destroy();
      const stats = {
        'Rescue Request': urgent,
        'Damage Report': damage,
        'Safety Update': safety,
        'General Information': general
      };
      barCanvas.chart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(CATEGORY_MAP),
          datasets: [{
            data: Object.keys(CATEGORY_MAP).map(cat => stats[cat]),
            backgroundColor: ['#e53935', '#fbc02d', '#43a047', '#bdbdbd']
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, precision: 0 }
          }
        }
      });
    }

    // History list
    const listGroup = dashboardPage.querySelector('.list-group');
    if (listGroup) {
      listGroup.innerHTML = '';
      history.slice().reverse().forEach((r, idx) => {
        const i = history.length - 1 - idx;
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.dataset.idx = i;
        item.innerHTML = `
          <div>
            <div class=\"fw-bold\">${escapeHtml(r.tweet)}</div>
            <div class=\"small text-muted\"><i class=\"bi bi-clock\"></i> ${r.date}</div>
          </div>
          <span class=\"badge p-2 ${CATEGORY_MAP[r.category].color}\"><i class=\"bi bi-exclamation-circle me-1\"></i>${r.category} <span class=\"ms-2 small\">${r.confidence}%</span></span>
          <a href=\"#result-page\" class=\"small ms-3\">View details →</a>
        `;
        listGroup.appendChild(item);
      });
    }
  }

  // --- Storage and Utility Functions ---
  const CATEGORY_MAP = {
    'Rescue Request': { color: 'badge-red', label: '🔴 Rescue Request' },
    'Damage Report': { color: 'badge-yellow', label: '🟡 Damage Report' },
    'Safety Update': { color: 'badge-green', label: '🟢 Safety Update' },
    'General Information': { color: 'badge-gray', label: '⚪ General Info' }
  };
  const HISTORY_KEY = 'disaster_tweet_history';
  function getTweetsFromInput() {
    const text = tweetInput.value.trim();
    if (!text) return [];
    return text.split(/\n+/).map(t => t.trim()).filter(Boolean);
  }
  function readCSVFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const lines = e.target.result.split(/\r?\n/);
      tweetInput.value = lines.join('\n');
    };
    reader.readAsText(file);
  }
  function classifyTweets(tweets) {
    // Demo: random category and confidence
    return tweets.map(tweet => {
      const cats = Object.keys(CATEGORY_MAP);
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const conf = (80 + Math.random() * 20).toFixed(1);
      return {
        tweet,
        category: cat,
        confidence: conf,
        date: new Date().toLocaleString()
      };
    });
  }
  function saveToHistory(results) {
    const history = getHistory();
    results.forEach(r => history.push(r));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
  function getHistory() {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  }
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Init ---
  showSection(mainPage);
});
  return h.length ? h[h.length - 1] : null;
}

function updateDashboard() {
  if (!historyTable) return;
  // Update table
  const history = getHistory();
  historyTable.innerHTML = '';
  history.slice().reverse().forEach(r => {
    const row = historyTable.insertRow();
    row.insertCell().textContent = r.tweet;
    row.insertCell().innerHTML = `<span class="badge ${CATEGORY_MAP[r.category].color}">${CATEGORY_MAP[r.category].label}</span>`;
    row.insertCell().textContent = r.confidence + '%';
    row.insertCell().textContent = r.date;
  });
  // Update stats
  const stats = {};
  Object.keys(CATEGORY_MAP).forEach(cat => stats[cat] = 0);
  history.forEach(r => stats[r.category]++);
  statsSummary.innerHTML = `
    <div><b>Total Tweets:</b> ${history.length}</div>
    <ul>
      ${Object.entries(stats).map(([cat, n]) => `<li><span class="badge ${CATEGORY_MAP[cat].color}">${CATEGORY_MAP[cat].label}</span> ${n}</li>`).join('')}
    </ul>
  `;
  // Update chart
  updateChart(stats);
}

let chartInstance = null;
function updateChart(stats) {
  if (!categoryChartCanvas) return;
  const data = {
    labels: Object.keys(CATEGORY_MAP),
    datasets: [{
      data: Object.keys(CATEGORY_MAP).map(cat => stats[cat]),
      backgroundColor: [
        '#e53935', '#fbc02d', '#43a047', '#bdbdbd'
      ]
    }]
  };
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(categoryChartCanvas, {
    type: 'pie',
    data,
    options: {
      plugins: {
        legend: { display: true, position: 'bottom' }
      }
    }
  });
}

function exportResults(results) {
  if (!results.length) return;
  const csv = [
    'Tweet,Category,Confidence,Date',
    ...results.map(r => `"${r.tweet.replace(/"/g,'""')}",${r.category},${r.confidence},${r.date}`)
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tweet_classification_results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Init ---
showSection(mainPage);
updateDashboard();
