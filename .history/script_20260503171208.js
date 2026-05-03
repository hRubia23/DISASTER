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
const liveFeed = document.getElementById('liveFeed');
const feedSeenIds = new Set();
let currentUserRole = 'viewer';
let currentUserName = '';

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

  if (user) {
    currentUserRole = user.role || 'viewer';
    currentUserName = user.full_name || '';
    document.body.dataset.role = currentUserRole;
    const adminOnly = document.querySelectorAll('[data-role="admin"]');
    adminOnly.forEach((el) => {
      if (user.role !== 'admin') {
        el.classList.add('hidden');
      }
    });

    if (user.role !== 'admin') {
      batchView?.classList.add('hidden');
      singleView?.classList.remove('hidden');
      batchModeBtn?.classList.add('hidden');
      singleModeBtn?.classList.remove('hidden');
    }

    if (window.location.pathname.endsWith('dashboard.html') && user.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }

    if (window.location.pathname.endsWith('result.html') && user.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }
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

  if (liveFeed) {
    feedSeenIds.clear();
    liveFeed.innerHTML = '<p class="feed-empty">No classified tweets yet. Submit one to see it here.</p>';
    loadLiveFeed();
  }

  initPostView();
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
  if (!singleView || !batchView) {
    return;
  }

  if (mode === 'batch' && currentUserRole !== 'admin') {
    return;
  }

  if (mode === 'batch') {
    singleView.classList.add('hidden');
    batchView.classList.remove('hidden');
    if (singleModeBtn) {
      singleModeBtn.classList.remove('btn-primary');
      singleModeBtn.classList.add('btn-secondary');
    }
    if (batchModeBtn) {
      batchModeBtn.classList.remove('btn-secondary');
      batchModeBtn.classList.add('btn-primary');
    }
    batchView.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    batchView.classList.add('hidden');
    singleView.classList.remove('hidden');
    if (batchModeBtn) {
      batchModeBtn.classList.remove('btn-primary');
      batchModeBtn.classList.add('btn-secondary');
    }
    if (singleModeBtn) {
      singleModeBtn.classList.remove('btn-secondary');
      singleModeBtn.classList.add('btn-primary');
    }
    tweetInput?.focus();
  }
}

function formatRelativeTime(isoString) {
  if (!isoString) {
    return 'just now';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'just now';
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDisplayName(record) {
  return record.full_name || currentUserName || 'Disaster Triage';
}

function buildFeedItem(record) {
  const payload = buildCategoryPayload(record.category, record.confidence);
  const isAdmin = currentUserRole === 'admin';

  const item = document.createElement('article');
  item.className = `feed-item${isAdmin ? '' : ' user-view'}`;

  const head = document.createElement('div');
  head.className = 'feed-item-head';

  const title = document.createElement('div');
  title.className = 'feed-item-title';

  const avatar = document.createElement('div');
  avatar.className = 'feed-avatar';
  avatar.textContent = '!';

  const titleText = document.createElement('div');
  titleText.innerHTML = `<div class="feed-title">${getDisplayName(record)}</div><div class="feed-time">${formatRelativeTime(record.created_at || record.timestamp)}</div>`;

  title.appendChild(avatar);
  title.appendChild(titleText);

  head.appendChild(title);
  if (isAdmin) {
    const chip = document.createElement('span');
    chip.className = `badge ${payload.categoryBadgeClass}`;
    chip.textContent = `${payload.categoryEmoji} ${payload.category}`;
    head.appendChild(chip);
  }

  const text = document.createElement('p');
  text.className = 'feed-text';
  text.textContent = record.tweet;

  const actions = document.createElement('div');
  actions.className = 'feed-actions';

  if (isAdmin) {
    const confidence = document.createElement('span');
    confidence.className = 'feed-confidence';
    confidence.textContent = `Confidence: ${payload.confidence}%`;

    const viewLink = document.createElement('a');
    viewLink.className = 'view-link';
    if (record.classification_id || record.id) {
      const id = record.classification_id || record.id;
      viewLink.href = `result.html?id=${encodeURIComponent(id)}&tweet=${encodeURIComponent(record.tweet)}`;
    } else {
      viewLink.href = `result.html?tweet=${encodeURIComponent(record.tweet)}`;
    }
    viewLink.textContent = 'View details';

    actions.appendChild(confidence);
    actions.appendChild(viewLink);
  }

  if (!isAdmin) {
    actions.classList.add('feed-action-bar');
    const likeCount = Number(record.like_count || 0);
    const replyCount = Number(record.reply_count || 0);
    const repostCount = Number(record.repost_count || 0);
    const likeBtn = buildFeedActionButton('Like', likeCount, Boolean(record.liked_by_me));
    const replyBtn = buildFeedActionButton('Reply', replyCount, false);
    const repostBtn = buildFeedActionButton('Repost', repostCount, Boolean(record.reposted_by_me));
    const shareBtn = buildFeedActionButton('Share', 0, false, true);

    likeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleToggleAction(record, 'like', likeBtn);
    });

    repostBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleToggleAction(record, 'repost', repostBtn);
    });

    replyBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleReplyAction(record, replyBtn);
    });

    shareBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleShareAction(record);
    });

    actions.appendChild(replyBtn);
    actions.appendChild(repostBtn);
    actions.appendChild(likeBtn);
    actions.appendChild(shareBtn);
  }

  if (!isAdmin) {
    item.classList.add('user-post');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    const openPost = () => {
      const id = record.classification_id || record.id;
      const createdAt = record.created_at || record.timestamp;
      const url = id
        ? `post.html?id=${encodeURIComponent(id)}&tweet=${encodeURIComponent(record.tweet)}${createdAt ? `&time=${encodeURIComponent(createdAt)}` : ''}`
        : `post.html?tweet=${encodeURIComponent(record.tweet)}${createdAt ? `&time=${encodeURIComponent(createdAt)}` : ''}`;
      window.location.href = url;
    };
    item.addEventListener('click', openPost);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPost();
      }
    });
  }

  item.appendChild(head);
  item.appendChild(text);
  item.appendChild(actions);

  return item;
}

function buildFeedActionButton(label, count, isActive, hideCount = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `feed-action-btn${isActive ? ' is-active' : ''}`;
  btn.dataset.label = label;
  btn.dataset.count = String(count || 0);
  const suffix = hideCount ? '' : ` ${count || 0}`;
  btn.textContent = `${label}${suffix}`;
  return btn;
}

function updateFeedActionButton(btn, count, isActive) {
  const label = btn.dataset.label || btn.textContent.split(' ')[0] || '';
  const nextCount = Number.isFinite(count) ? count : Number(btn.dataset.count || 0);
  btn.dataset.count = String(nextCount);
  btn.textContent = `${label} ${nextCount}`;
  btn.classList.toggle('is-active', Boolean(isActive));
}

async function handleToggleAction(record, action, btn) {
  const id = record.classification_id || record.id;
  if (!id || window.location.protocol === 'file:') {
    return;
  }

  try {
    const response = await fetch(`/api/classifications/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (action === 'like') {
      updateFeedActionButton(btn, payload.like_count, payload.liked);
    } else if (action === 'repost') {
      updateFeedActionButton(btn, payload.repost_count, payload.reposted);
    }
  } catch (error) {
    // Ignore toggle errors.
  }
}

async function handleReplyAction(record, btn) {
  const id = record.classification_id || record.id;
  if (!id || window.location.protocol === 'file:') {
    return;
  }

  const reply = window.prompt('Write a reply');
  if (!reply) {
    return;
  }

  try {
    const response = await fetch(`/api/classifications/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ reply })
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    updateFeedActionButton(btn, payload.reply_count, false);
  } catch (error) {
    // Ignore reply errors.
  }
}

async function handleShareAction(record) {
  const id = record.classification_id || record.id;
  const shareUrl = id ? `${window.location.origin}/post.html?id=${encodeURIComponent(id)}` : window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Disaster post', url: shareUrl });
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
  } catch (error) {
    // Ignore share errors.
  }
}

function updatePostActionCount(countEl, count, isActive, btnEl) {
  if (countEl) {
    countEl.textContent = String(count ?? 0);
  }
  if (btnEl) {
    btnEl.classList.toggle('is-active', Boolean(isActive));
  }
}

async function handlePostToggleAction(record, action, countEl, btnEl) {
  const id = record.classification_id || record.id;
  if (!id || window.location.protocol === 'file:') {
    return;
  }

  try {
    const response = await fetch(`/api/classifications/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (action === 'like') {
      updatePostActionCount(countEl, payload.like_count, payload.liked, btnEl);
    } else if (action === 'repost') {
      updatePostActionCount(countEl, payload.repost_count, payload.reposted, btnEl);
    }
  } catch (error) {
    // Ignore toggle errors.
  }
}

async function handlePostReplyAction(record, countEl) {
  const id = record.classification_id || record.id;
  if (!id || window.location.protocol === 'file:') {
    return;
  }

  const reply = window.prompt('Write a reply');
  if (!reply) {
    return;
  }

  try {
    const response = await fetch(`/api/classifications/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ reply })
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    updatePostActionCount(countEl, payload.reply_count, false, null);
  } catch (error) {
    // Ignore reply errors.
  }
}

function getFeedKey(record) {
  return String(record.classification_id || record.id || `${record.created_at || record.timestamp || ''}:${record.tweet}`);
}

function prependFeedItems(records) {
  if (!liveFeed || !records || records.length === 0) {
    return;
  }
  const empty = liveFeed.querySelector('.feed-empty');
  if (empty) {
    empty.remove();
  }
  records.forEach((record) => {
    const key = getFeedKey(record);
    if (feedSeenIds.has(key)) {
      return;
    }
    feedSeenIds.add(key);
    const node = buildFeedItem(record);
    liveFeed.prepend(node);
  });
  liveFeed.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadLiveFeed() {
  if (!liveFeed) {
    return;
  }
  if (window.location.protocol === 'file:') {
    const saved = JSON.parse(localStorage.getItem('classifications') || '[]');
    if (saved.length > 0) {
      prependFeedItems(saved.slice(0, 10));
    }
    return;
  }

  try {
    const scopeParam = currentUserRole === 'admin' ? 'all' : 'mine';
    const response = await fetch(`/api/history?limit=12&scope=${scopeParam}`, { credentials: 'include' });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const items = payload.items || [];
    if (items.length > 0) {
      prependFeedItems(items.reverse());
    }
  } catch (error) {
    // Ignore feed errors.
  }
}

async function initPostView() {
  const postBody = document.getElementById('postBody');
  const postText = document.getElementById('postText');
  const postTime = document.getElementById('postTime');
  const postAuthor = document.getElementById('postAuthor');
  const backBtn = document.getElementById('backBtn');

  if (!postBody || !postText) {
    return;
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  const tweetParam = params.get('tweet');
  const timeParam = params.get('time');
  const idParam = params.get('id');

  if (tweetParam) {
    postText.textContent = decodeURIComponent(tweetParam);
  }

  if (postAuthor) {
    postAuthor.textContent = currentUserName || 'Disaster Triage';
  }

  if (timeParam && postTime) {
    postTime.textContent = formatRelativeTime(timeParam);
  }

  if (!tweetParam && idParam && window.location.protocol !== 'file:') {
    try {
      const response = await fetch(`/api/classifications/${encodeURIComponent(idParam)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.tweet) {
          postText.textContent = payload.tweet;
        }
        if (payload?.full_name && postAuthor) {
          postAuthor.textContent = payload.full_name;
        }
        if (payload?.created_at && postTime) {
          postTime.textContent = formatRelativeTime(payload.created_at);
        }
        return;
      }
    } catch (error) {
      // Ignore fetch errors and fall back to empty state.
    }
  }

  if (!tweetParam && !idParam) {
    postText.textContent = 'No post data available.';
  }
}

if (liveFeed && window.location.protocol !== 'file:') {
  setInterval(loadLiveFeed, 15000);
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
      const results = payload?.results || [];
      if (tweetInput && batchTweets.length > 0) {
        tweetInput.value = batchTweets[0];
      }
      if (results.length > 0) {
        prependFeedItems(results.map((item) => ({
          tweet: item.tweet,
          category: item.category,
          confidence: item.confidence,
          classification_id: item.classification_id,
          created_at: new Date().toISOString()
        })).reverse());
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
      prependFeedItems(records.reverse());
      return;
    }
  }

  const tweet = (tweetInput?.value || '').trim() || DEFAULT_TWEET;
  const classification = await classifyTweetWithServer(tweet);

  if (classification && classification.classification_id) {
    prependFeedItems([
      {
        tweet,
        category: classification.category,
        confidence: classification.confidence,
        classification_id: classification.classification_id,
        created_at: new Date().toISOString()
      }
    ]);
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
  prependFeedItems([record]);
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
  const normalizedConfidence = Math.max(0, Math.min(99, normalizeConfidence(confidence)));
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

function normalizeConfidence(value) {
  const num = Number(value) || 0;
  if (num <= 1) {
    return Math.round(num * 1000) / 10;
  }
  return Math.round(num * 10) / 10;
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
let pieChartInstance = null;
let barChartInstance = null;

function buildHistoryItem(item) {
  const date = new Date(item.created_at || item.timestamp || Date.now());
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString();

  let chipClass = 'chip-urgent';
  if (item.category === 'Damage Report') {
    chipClass = 'chip-warning';
  } else if (item.category === 'Safety Update') {
    chipClass = 'chip-info';
  } else if (item.category === 'General Information') {
    chipClass = 'chip-neutral';
  }

  let badgeClass = 'badge-red';
  if (item.category === 'Damage Report') {
    badgeClass = 'badge-yellow';
  } else if (item.category === 'Safety Update') {
    badgeClass = 'badge-green';
  } else if (item.category === 'General Information') {
    badgeClass = 'badge-gray';
  }

  const chipText = item.category === 'Rescue Request' ? 'URGENT' : item.category.toUpperCase();
  const shortTweet = item.tweet.length > 100 ? `${item.tweet.substring(0, 100)}...` : item.tweet;

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
  badge.textContent = `${item.emoji || '⚪'} ${item.category}`;

  const confidence = document.createElement('strong');
  confidence.textContent = `${normalizeConfidence(item.confidence)}%`;

  const viewLink = document.createElement('a');
  viewLink.className = 'view-link';
  if (item.id) {
    viewLink.href = `result.html?id=${encodeURIComponent(item.id)}&tweet=${encodeURIComponent(item.tweet)}`;
  } else {
    viewLink.href = `result.html?tweet=${encodeURIComponent(item.tweet)}`;
  }
  viewLink.textContent = 'View details';

  meta.appendChild(badge);
  meta.appendChild(confidence);
  meta.appendChild(viewLink);

  historyItem.appendChild(top);
  historyItem.appendChild(tweetText);
  historyItem.appendChild(meta);

  return historyItem;
}

function renderCharts(categoryCount) {
  if (!pieCanvas || !barCanvas || !window.Chart) {
    return;
  }

  const total = Object.values(categoryCount).reduce((sum, count) => sum + count, 0);
  const rescuePercent = total > 0 ? Math.round((categoryCount['Rescue Request'] / total) * 100) : 0;
  const damagePercent = total > 0 ? Math.round((categoryCount['Damage Report'] / total) * 100) : 0;
  const safetyPercent = total > 0 ? Math.round((categoryCount['Safety Update'] / total) * 100) : 0;
  const generalPercent = total > 0 ? Math.round((categoryCount['General Information'] / total) * 100) : 0;

  const pieData = [rescuePercent, damagePercent, safetyPercent, generalPercent];
  const barData = [
    categoryCount['Rescue Request'],
    categoryCount['Damage Report'],
    categoryCount['Safety Update'],
    categoryCount['General Information']
  ];

  if (!pieChartInstance) {
    pieChartInstance = new Chart(pieCanvas.getContext('2d'), {
      type: 'pie',
      data: {
        labels: ['Rescue', 'Damage', 'Safety', 'General'],
        datasets: [{
          data: pieData,
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
  } else {
    pieChartInstance.data.datasets[0].data = pieData;
    pieChartInstance.update();
  }

  if (!barChartInstance) {
    barChartInstance = new Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Rescue', 'Damage', 'Safety', 'General'],
        datasets: [{
          label: 'Tweets',
          data: barData,
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
  } else {
    barChartInstance.data.datasets[0].data = barData;
    barChartInstance.update();
  }
}

async function loadDashboard() {
  const totalCountEl = document.getElementById('totalCount');
  const rescueCountEl = document.getElementById('rescueCount');
  const avgConfidenceEl = document.getElementById('avgConfidence');
  const safetyCountEl = document.getElementById('safetyCount');
  const historyListEl = document.getElementById('historyList');

  if (!totalCountEl || !historyListEl) {
    return;
  }

  let items = [];
  let statsPayload = null;

  if (window.location.protocol !== 'file:') {
    try {
      const [statsResponse, historyResponse] = await Promise.all([
        fetch('/api/stats', { credentials: 'include' }),
        fetch('/api/history?limit=200', { credentials: 'include' })
      ]);
      if (statsResponse.ok && historyResponse.ok) {
        statsPayload = await statsResponse.json();
        const historyPayload = await historyResponse.json();
        items = historyPayload.items || [];
      }
    } catch (error) {
      // Ignore and fall back to local storage.
    }
  }

  if (!statsPayload) {
    const classifications = JSON.parse(localStorage.getItem('classifications') || '[]');
    items = classifications;
    let totalConfidence = 0;
    const byCategory = {
      'Rescue Request': 0,
      'Damage Report': 0,
      'Safety Update': 0,
      'General Information': 0
    };
    classifications.forEach(c => {
      if (byCategory.hasOwnProperty(c.category)) {
        byCategory[c.category]++;
      }
      totalConfidence += c.confidence || 0;
    });
    const total = classifications.length;
    const avgConfidence = total > 0 ? Math.round((totalConfidence / total) * 10) / 10 : 0;
    statsPayload = {
      total,
      avg_confidence: avgConfidence,
      by_category: byCategory
    };
  }

  if (items.length === 0) {
    historyListEl.innerHTML = '<p style="text-align: center; color: #9aa3af; padding: 20px;">No classifications yet. Start by classifying a tweet!</p>';
    renderCharts({
      'Rescue Request': 0,
      'Damage Report': 0,
      'Safety Update': 0,
      'General Information': 0
    });
    return;
  }

  const categoryCount = {
    'Rescue Request': 0,
    'Damage Report': 0,
    'Safety Update': 0,
    'General Information': 0
  };
  Object.entries(statsPayload.by_category || {}).forEach(([key, value]) => {
    if (categoryCount.hasOwnProperty(key)) {
      categoryCount[key] = value;
    }
  });

  totalCountEl.textContent = statsPayload.total || 0;
  rescueCountEl.textContent = categoryCount['Rescue Request'] || 0;
  avgConfidenceEl.textContent = `${statsPayload.avg_confidence || 0}%`;
  safetyCountEl.textContent = categoryCount['Safety Update'] || 0;

  historyListEl.innerHTML = '';
  items.forEach((item) => {
    historyListEl.appendChild(buildHistoryItem(item));
  });

  renderCharts(categoryCount);
}

if (document.getElementById('historyList')) {
  loadDashboard();
}

const clearAllBtn = document.getElementById('clearAllBtn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all classifications? This cannot be undone.')) {
      return;
    }
    if (window.location.protocol === 'file:') {
      localStorage.removeItem('classifications');
      window.location.reload();
      return;
    }
    await fetch('/api/history/clear', { method: 'POST', credentials: 'include' });
    window.location.reload();
  });
}

function toCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', async () => {
    if (window.location.protocol === 'file:') {
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
      return;
    }

    window.location.href = '/api/export/csv';
  });
}

const exportPdfBtn = document.getElementById('exportPdfBtn');
if (exportPdfBtn) {
  exportPdfBtn.addEventListener('click', () => {
    if (window.location.protocol === 'file:') {
      alert('PDF export is only available when running the server.');
      return;
    }
    window.location.href = '/api/export/pdf';
  });
}

const flagBtn = document.getElementById('flagBtn');
if (flagBtn) {
  flagBtn.addEventListener('click', async () => {
    const id = flagBtn.dataset.classificationId;
    if (!id) {
      alert('Classification record not found.');
      return;
    }
    const reason = prompt('Reason for flagging (optional):', 'Needs review') || 'Needs review';
    await fetch('/api/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ classification_id: Number(id), reason })
    });
    alert('Flag recorded.');
  });
}
