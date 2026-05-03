const tweetInput = document.getElementById('tweetInput');
const classifyBtn = document.getElementById('classifyBtn');
const classifyBatchBtn = document.getElementById('classifyBatchBtn');
const singleModeBtn = document.getElementById('singleModeBtn');
const batchModeBtn = document.getElementById('batchModeBtn');
const singleView = document.getElementById('singleView');
const batchView = document.getElementById('batchView');
const batchFileInput = document.getElementById('batchFileInput');
const batchDropzone = document.getElementById('batchDropzone');
const selectBatchFileBtn = document.getElementById('selectBatchFileBtn');
const batchStatus = document.getElementById('batchStatus');
const DEFAULT_TWEET = 'Family of five trapped on rooftop near Riverbank Colony. Water level is rising rapidly and children are stranded. Please send immediate rescue boats.';
const navToggle = document.getElementById('navToggle');
const topNavLinks = document.querySelector('.top-nav .nav-links');
const logoutBtn = document.getElementById('logoutBtn');
const userGreeting = document.getElementById('userGreeting');

async function getCurrentSessionUser() {
  if (window.location.protocol === 'file:') {
    return null;
  }

  try {
    const response = await fetch('/api/me', {
      credentials: 'include'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload.logged_in ? payload.user : null;
  } catch (error) {
    return null;
  }
}

async function initAuthGuard() {
  const authRequired = document.body?.dataset?.authRequired === 'true';
  const user = await getCurrentSessionUser();

  if (authRequired && !user && window.location.protocol !== 'file:') {
    window.location.href = 'auth.html';
    return;
  }

  if (userGreeting && user) {
    userGreeting.textContent = `Signed in as ${user.full_name}`;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        // Ignore logout request failures and still redirect to auth screen.
      }

      window.location.href = 'auth.html';
    });
  }
}

initAuthGuard();

function syncMobileNavState() {
  if (!navToggle || !topNavLinks) {
    return;
  }

  const isMobile = window.matchMedia('(max-width: 620px)').matches;
  if (!isMobile) {
    topNavLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
}

if (navToggle && topNavLinks) {
  navToggle.addEventListener('click', () => {
    const willOpen = !topNavLinks.classList.contains('open');
    topNavLinks.classList.toggle('open', willOpen);
    navToggle.setAttribute('aria-expanded', String(willOpen));
  });

  topNavLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      topNavLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  window.addEventListener('resize', syncMobileNavState);
  syncMobileNavState();
}

function setMode(mode) {
  if (!singleView || !batchView || !singleModeBtn || !batchModeBtn) {
    return;
  }

  if (mode === 'batch') {
    singleView.classList.add('hidden');
    batchView.classList.remove('hidden');
    singleModeBtn.classList.remove('btn-primary');
    singleModeBtn.classList.add('btn-secondary');
    batchModeBtn.classList.remove('btn-secondary');
    batchModeBtn.classList.add('btn-primary');
    batchView.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    batchView.classList.add('hidden');
    singleView.classList.remove('hidden');
    batchModeBtn.classList.remove('btn-primary');
    batchModeBtn.classList.add('btn-secondary');
    singleModeBtn.classList.remove('btn-secondary');
    singleModeBtn.classList.add('btn-primary');
    tweetInput?.focus();
  }
}

function processBatchFile(file) {
  if (!file) {
    if (batchStatus) {
      batchStatus.textContent = 'No file selected.';
    }
    return;
  }

  const validType = /\.(txt|csv)$/i.test(file.name);
  if (!validType) {
    if (batchStatus) {
      batchStatus.textContent = 'Please upload a .txt or .csv file only.';
    }
    if (batchFileInput) {
      batchFileInput.value = '';
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const rawText = typeof reader.result === 'string' ? reader.result : '';
    let tweets = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (tweets.length > 0 && tweets[0].toLowerCase() === 'tweet') {
      tweets = tweets.slice(1);
    }

    localStorage.setItem('batchTweets', JSON.stringify(tweets));

    if (tweetInput && tweets.length > 0) {
      tweetInput.value = tweets[0];
    }

    if (batchStatus) {
      if (tweets.length === 0) {
        batchStatus.textContent = 'Uploaded file is empty. Add one tweet per line and try again.';
      } else {
        const preview = tweets.slice(0, 2).join(' | ');
        batchStatus.textContent = `Loaded ${tweets.length} tweet(s) from ${file.name}. Preview: ${preview}`;
      }
    }
  };

  reader.onerror = () => {
    if (batchStatus) {
      batchStatus.textContent = 'Unable to read the selected file. Please try another file.';
    }
  };

  reader.readAsText(file);
}

if (tweetInput) {
  const exampleButtons = document.querySelectorAll('.example-item');
  exampleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      tweetInput.value = button.textContent.trim();
      tweetInput.focus();
    });
  });
}

if (singleModeBtn) {
  singleModeBtn.addEventListener('click', () => {
    setMode('single');
  });
}

if (batchModeBtn) {
  batchModeBtn.addEventListener('click', () => {
    setMode('batch');
  });
}

if (selectBatchFileBtn && batchFileInput) {
  selectBatchFileBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    batchFileInput.click();
  });
}

if (batchDropzone && batchFileInput) {
  batchDropzone.addEventListener('click', () => {
    batchFileInput.click();
  });

  batchDropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      batchFileInput.click();
    }
  });

  batchDropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    batchDropzone.classList.add('drag-over');
  });

  batchDropzone.addEventListener('dragleave', () => {
    batchDropzone.classList.remove('drag-over');
  });

  batchDropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    batchDropzone.classList.remove('drag-over');
    const dropped = event.dataTransfer?.files?.[0];
    processBatchFile(dropped || null);
  });
}

if (batchFileInput) {
  batchFileInput.addEventListener('change', () => {
    const file = batchFileInput.files?.[0];
    processBatchFile(file || null);
  });
}

async function classifyTweetWithServer(text) {
  if (window.location.protocol === 'file:') {
    return classifyTweet(text);
  }

  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error('classification failed');
    }

    const payload = await response.json();
    if (!payload || !payload.category) {
      throw new Error('invalid response');
    }

    return payload;
  } catch (error) {
    // Fallback to local heuristic (keeps demo working even if model missing).
    return classifyTweet(text);
  }
}

async function handleClassifyAction() {
  const isBatchMode = batchView && !batchView.classList.contains('hidden');
  const batchTweets = JSON.parse(localStorage.getItem('batchTweets') || '[]')
    .map((line) => String(line).trim())
    .filter((line) => line.length > 0);

  if (isBatchMode && batchTweets.length > 0) {
    try {
      const response = await fetch('/api/classify/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ tweets: batchTweets })
      });

      if (!response.ok) {
        throw new Error('batch failed');
      }

      const payload = await response.json();
      const first = payload?.results?.[0];
      if (tweetInput && batchTweets.length > 0) {
        tweetInput.value = batchTweets[0];
      }
      if (first) {
        window.location.href = `result.html?id=${encodeURIComponent(first.classification_id)}&tweet=${encodeURIComponent(first.tweet)}`;
        return;
      }
    } catch (error) {
      // Fall back to local heuristic + localStorage.
      const existing = JSON.parse(localStorage.getItem('classifications') || '[]');
      const now = Date.now();
      const records = await Promise.all(batchTweets.map(async (tweet, index) => {
        const classification = await classifyTweetWithServer(tweet);
        return {
          tweet,
          category: classification.category,
          confidence: classification.confidence,
          timestamp: new Date(now + index).toISOString(),
          emoji: classification.categoryEmoji
        };
      }));
      localStorage.setItem('classifications', JSON.stringify([...records, ...existing]));
      window.location.href = `result.html?tweet=${encodeURIComponent(batchTweets[0])}`;
      return;
    }
  }

  const tweet = (tweetInput?.value || '').trim() || DEFAULT_TWEET;
  const classification = await classifyTweetWithServer(tweet);

  if (classification && classification.classification_id) {
    window.location.href = `result.html?id=${encodeURIComponent(classification.classification_id)}&tweet=${encodeURIComponent(tweet)}`;
    return;
  }

  const record = {
    tweet,
    category: classification.category,
    confidence: classification.confidence,
    timestamp: new Date().toISOString(),
    emoji: classification.categoryEmoji
  };

  const classifications = JSON.parse(localStorage.getItem('classifications') || '[]');
  classifications.unshift(record);
  localStorage.setItem('classifications', JSON.stringify(classifications));

  window.location.href = `result.html?tweet=${encodeURIComponent(tweet)}`;
}

if (classifyBtn) {
  classifyBtn.addEventListener('click', () => {
    handleClassifyAction();
  });
}

if (classifyBatchBtn) {
  classifyBatchBtn.addEventListener('click', () => {
    handleClassifyAction();
  });
}

function classifyTweet(text) {
  const lowerText = text.toLowerCase();
  
  const rescueKeywords = ['trapped', 'rescue', 'help', 'stuck', 'stranded', 'need help', 'emergency', 'urgent', 'dying', 'drowning', 'flood'];
  const damageKeywords = ['damage', 'destroyed', 'collapsed', 'broken', 'infrastructure', 'building', 'bridge', 'road', 'destroyed'];
  const safetyKeywords = ['evacuation', 'shelter', 'relief', 'camp', 'safety', 'safe zone', 'emergency services', 'hospital'];
  const generalKeywords = ['weather', 'rain', 'wind', 'alert', 'warning', 'update', 'report'];
  
  let scores = {
    rescue: 0,
    damage: 0,
    safety: 0,
    general: 0
  };
  
  rescueKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) scores.rescue += 25;
  });
  
  damageKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) scores.damage += 25;
  });
  
  safetyKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) scores.safety += 25;
  });
  
  generalKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) scores.general += 15;
  });
  
  const maxScore = Math.max(...Object.values(scores));
  const baseConfidence = 70 + (maxScore / 100) * 20;
  const confidence = Math.min(baseConfidence, 95);
  
  let category = 'General Information';
  let categoryEmoji = '⚪';
  let categoryBadgeClass = 'badge-gray';
  let bannerTitle = 'INFORMATION RECEIVED';
  let bannerMessage = 'This is general information that may be useful for reference.';
  let bannerClass = 'banner-gray';
  let description = 'Non-urgent news and updates.';
  
  if (scores.rescue >= scores.damage && scores.rescue >= scores.safety && scores.rescue >= scores.general && scores.rescue > 0) {
    category = 'Rescue Request';
    categoryEmoji = '🔴';
    categoryBadgeClass = 'badge-red';
    bannerTitle = 'URGENT RESCUE REQUEST DETECTED';
    bannerMessage = 'This tweet requires immediate attention from emergency responders.';
    bannerClass = 'banner-red';
    description = 'Someone needs immediate help.';
  } else if (scores.damage >= scores.safety && scores.damage >= scores.general && scores.damage > 0) {
    category = 'Damage Report';
    categoryEmoji = '🟡';
    categoryBadgeClass = 'badge-yellow';
    bannerTitle = 'DAMAGE REPORT DETECTED';
    bannerMessage = 'Infrastructure or property damage has been reported.';
    bannerClass = 'banner-yellow';
    description = 'Infrastructure/property damage info.';
  } else if (scores.safety >= scores.general && scores.safety > 0) {
    category = 'Safety Update';
    categoryEmoji = '🟢';
    categoryBadgeClass = 'badge-green';
    bannerTitle = 'SAFETY UPDATE RECEIVED';
    bannerMessage = 'Evacuation notices and relief distribution information.';
    bannerClass = 'banner-green';
    description = 'Evacuation notices, relief distribution.';
  }
  
  return {
    category,
    categoryEmoji,
    confidence: Math.round(confidence * 10) / 10,
    categoryBadgeClass,
    bannerTitle,
    bannerMessage,
    bannerClass,
    description
  };
}

function buildCategoryPayload(category, confidence) {
  const normalizedConfidence = Math.max(0, Math.min(99, Number(confidence) || 0));
  if (category === 'Rescue Request') {
    return {
      category,
      categoryEmoji: '🔴',
      categoryBadgeClass: 'badge-red',
      bannerTitle: 'URGENT RESCUE REQUEST DETECTED',
      bannerMessage: 'This tweet requires immediate attention from emergency responders.',
      bannerClass: 'banner-red',
      description: 'Someone needs immediate help.',
      confidence: normalizedConfidence
    };
  }
  if (category === 'Damage Report') {
    return {
      category,
      categoryEmoji: '🟡',
      categoryBadgeClass: 'badge-yellow',
      bannerTitle: 'DAMAGE REPORT DETECTED',
      bannerMessage: 'Infrastructure or property damage has been reported.',
      bannerClass: 'banner-yellow',
      description: 'Infrastructure/property damage info.',
      confidence: normalizedConfidence
    };
  }
  if (category === 'Safety Update') {
    return {
      category,
      categoryEmoji: '🟢',
      categoryBadgeClass: 'badge-green',
      bannerTitle: 'SAFETY UPDATE RECEIVED',
      bannerMessage: 'Evacuation notices and relief distribution information.',
      bannerClass: 'banner-green',
      description: 'Evacuation notices, relief distribution.',
      confidence: normalizedConfidence
    };
  }
  return {
    category: 'General Information',
    categoryEmoji: '⚪',
    categoryBadgeClass: 'badge-gray',
    bannerTitle: 'INFORMATION RECEIVED',
    bannerMessage: 'This is general information that may be useful for reference.',
    bannerClass: 'banner-gray',
    description: 'Non-urgent news and updates.',
    confidence: normalizedConfidence
  };
}

const tweetPreview = document.getElementById('tweetPreview');
if (tweetPreview) {
  const params = new URLSearchParams(window.location.search);
  const tweet = params.get('tweet');
  const classificationId = params.get('id');

  if (tweet) {
    tweetPreview.textContent = tweet;
  }

  const updateResultUI = (classification) => {
    if (!classification) {
      return;
    }

    const alertBanner = document.getElementById('alertBanner');
    if (alertBanner) {
      alertBanner.className = `urgent-banner ${classification.bannerClass}`;
    }

    const bannerTitle = document.getElementById('bannerTitle');
    if (bannerTitle) {
      bannerTitle.textContent = classification.bannerTitle;
    }

    const bannerMessage = document.getElementById('bannerMessage');
    if (bannerMessage) {
      bannerMessage.textContent = classification.bannerMessage;
    }

    const detectedSection = document.querySelector('.detected');
    if (detectedSection) {
      const badge = detectedSection.querySelector('.badge-red, .badge-yellow, .badge-green, .badge-gray');
      if (badge) {
        badge.textContent = `${classification.categoryEmoji} ${classification.category}`;
        badge.className = `badge ${classification.categoryBadgeClass}`;
      }

      const confidenceEl = detectedSection.querySelector('strong');
      if (confidenceEl) {
        confidenceEl.textContent = `Confidence: ${classification.confidence}%`;
      }
    }

    const descriptionEl = document.querySelector('.detected + p.subtle');
    if (descriptionEl) {
      descriptionEl.textContent = classification.description;
    }

    const progressBar = document.querySelector('.progress > span');
    if (progressBar) {
      progressBar.style.width = `${classification.confidence}%`;
    }
  };

  const resultTimestamp = document.getElementById('resultTimestamp');
  if (resultTimestamp) {
    const now = new Date();
    resultTimestamp.textContent = `Classified at: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  }

  if (classificationId && window.location.protocol !== 'file:') {
    fetch(`/api/classifications/${classificationId}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((record) => {
        if (!record) {
          return null;
        }
        const payload = buildCategoryPayload(record.category, record.confidence);
        updateResultUI(payload);
        const flagBtn = document.getElementById('flagBtn');
        if (flagBtn) {
          flagBtn.dataset.classificationId = String(record.id);
        }
        return record;
      })
      .catch(() => {
        if (tweet) {
          classifyTweetWithServer(tweet).then(updateResultUI);
        }
      });
  } else if (tweet) {
    classifyTweetWithServer(tweet).then(updateResultUI);
  }
}

const pieCanvas = document.getElementById('pieChart');
const barCanvas = document.getElementById('barChart');

if (pieCanvas && barCanvas && window.Chart) {
  const classifications = JSON.parse(localStorage.getItem('classifications') || '[]');
  
  let categoryCount = {
    'Rescue Request': 0,
    'Damage Report': 0,
    'Safety Update': 0,
    'General Information': 0
  };
  
  classifications.forEach(c => {
    if (categoryCount.hasOwnProperty(c.category)) {
      categoryCount[c.category]++;
    }
  });
  
  const total = Object.values(categoryCount).reduce((sum, count) => sum + count, 0);
  const rescuePercent = total > 0 ? Math.round((categoryCount['Rescue Request'] / total) * 100) : 0;
  const damagePercent = total > 0 ? Math.round((categoryCount['Damage Report'] / total) * 100) : 0;
  const safetyPercent = total > 0 ? Math.round((categoryCount['Safety Update'] / total) * 100) : 0;
  const generalPercent = total > 0 ? Math.round((categoryCount['General Information'] / total) * 100) : 0;
  
  const pieCtx = pieCanvas.getContext('2d');
  const barCtx = barCanvas.getContext('2d');

  new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels: ['Rescue', 'Damage', 'Safety', 'General'],
      datasets: [{
        data: [rescuePercent, damagePercent, safetyPercent, generalPercent],
        backgroundColor: ['#d1292d', '#f5c84c', '#1f9d62', '#9aa3af'],
        borderColor: ['#ffffff'],
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label}: ${context.parsed}%`;
            }
          }
        }
      }
    }
  });

  new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Rescue', 'Damage', 'Safety', 'General'],
      datasets: [{
        label: 'Tweets',
        data: [
          categoryCount['Rescue Request'],
          categoryCount['Damage Report'],
          categoryCount['Safety Update'],
          categoryCount['General Information']
        ],
        backgroundColor: ['#d1292d', '#f5c84c', '#1f9d62', '#9aa3af'],
        borderRadius: 8
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            stepSize: 1
          },
          grid: {
            color: '#e6ecf2'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

function loadDashboard() {
  const totalCountEl = document.getElementById('totalCount');
  const rescueCountEl = document.getElementById('rescueCount');
  const avgConfidenceEl = document.getElementById('avgConfidence');
  const safetyCountEl = document.getElementById('safetyCount');
  const historyListEl = document.getElementById('historyList');
  
  if (!totalCountEl || !historyListEl) {
    return;
  }
  
  const classifications = JSON.parse(localStorage.getItem('classifications') || '[]');
  
  if (classifications.length === 0) {
    historyListEl.innerHTML = '<p style="text-align: center; color: #9aa3af; padding: 20px;">No classifications yet. Start by classifying a tweet!</p>';
    return;
  }
  
  let categoryCount = {
    'Rescue Request': 0,
    'Damage Report': 0,
    'Safety Update': 0,
    'General Information': 0
  };
  
  let totalConfidence = 0;
  
  classifications.forEach(c => {
    if (categoryCount.hasOwnProperty(c.category)) {
      categoryCount[c.category]++;
    }
    totalConfidence += c.confidence || 0;
  });
  
  const total = classifications.length;
  const avgConfidence = total > 0 ? Math.round((totalConfidence / total) * 10) / 10 : 0;
  
  if (totalCountEl) totalCountEl.textContent = total;
  if (rescueCountEl) rescueCountEl.textContent = categoryCount['Rescue Request'];
  if (avgConfidenceEl) avgConfidenceEl.textContent = `${avgConfidence}%`;
  if (safetyCountEl) safetyCountEl.textContent = categoryCount['Safety Update'];
  
  historyListEl.innerHTML = '';
  
  classifications.forEach(c => {
    const date = new Date(c.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    
    let chipClass = 'chip-urgent';
    if (c.category === 'Damage Report') {
      chipClass = 'chip-warning';
    } else if (c.category === 'Safety Update') {
      chipClass = 'chip-info';
    } else if (c.category === 'General Information') {
      chipClass = 'chip-neutral';
    }
    
    let badgeClass = 'badge-red';
    if (c.category === 'Damage Report') {
      badgeClass = 'badge-yellow';
    } else if (c.category === 'Safety Update') {
      badgeClass = 'badge-green';
    } else if (c.category === 'General Information') {
      badgeClass = 'badge-gray';
    }
    
    const chipText = c.category === 'Rescue Request' ? 'URGENT' : c.category.toUpperCase();
    
    const shortTweet = c.tweet.length > 100 ? c.tweet.substring(0, 100) + '...' : c.tweet;
    
    const historyItem = document.createElement('article');
    historyItem.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-top';

    const chip = document.createElement('span');
    chip.className = chipClass;
    chip.textContent = chipText;

    const dateMeta = document.createElement('span');
    dateMeta.className = 'meta';
    dateMeta.textContent = `${dateStr}, ${timeStr}`;

    top.appendChild(chip);
    top.appendChild(dateMeta);

    const tweetText = document.createElement('div');
    tweetText.textContent = shortTweet;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const badge = document.createElement('span');
    badge.className = `badge ${badgeClass}`;
    badge.textContent = `${c.emoji || '⚪'} ${c.category}`;

    const confidence = document.createElement('strong');
    confidence.textContent = `${c.confidence}%`;

    const viewLink = document.createElement('a');
    viewLink.className = 'view-link';
    viewLink.href = `result.html?tweet=${encodeURIComponent(c.tweet)}`;
    viewLink.textContent = 'View details';

    meta.appendChild(badge);
    meta.appendChild(confidence);
    meta.appendChild(viewLink);

    historyItem.appendChild(top);
    historyItem.appendChild(tweetText);
    historyItem.appendChild(meta);

    historyListEl.appendChild(historyItem);
  });
}

if (document.getElementById('historyList')) {
  loadDashboard();
}

const clearAllBtn = document.getElementById('clearAllBtn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all classifications? This cannot be undone.')) {
      localStorage.removeItem('classifications');
      window.location.reload();
    }
  });
}

function toCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    const classifications = JSON.parse(localStorage.getItem('classifications') || '[]');

    if (classifications.length === 0) {
      alert('No classifications available to export yet.');
      return;
    }

    const header = ['tweet', 'category', 'confidence', 'timestamp', 'emoji'];
    const rows = classifications.map((item) => [
      toCsvValue(item.tweet),
      toCsvValue(item.category),
      toCsvValue(item.confidence),
      toCsvValue(item.timestamp),
      toCsvValue(item.emoji)
    ]);

    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `disaster-tweet-classifications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}
