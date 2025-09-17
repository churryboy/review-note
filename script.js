

// Optimized script.js - Fixed Version
// State management
let questions = [];
let popQuizItems = [];
let achievements = [];
let currentImageBlob = null;
let currentImageUrl = null;
let currentImageHash = null;
let answerByHash = {};

// Current user context
window.currentUserId = window.currentUserId || null;
function storageKey(base) {
    const uid = window.currentUserId || 'anon';
    return `${base}::${uid}`;
}

// Constants
const POP_QUIZ_DELAY_MS = 5 * 1000; // 5 seconds
const POP_QUIZ_REAPPEAR_MS = 24 * 60 * 60 * 1000; // 1 day

// Memory leak prevention
const objectURLs = new Set();
function createObjectURL(blob) {
    const url = URL.createObjectURL(blob);
    objectURLs.add(url);
    return url;
}
function revokeAllObjectURLs() {
    objectURLs.forEach(url => URL.revokeObjectURL(url));
    objectURLs.clear();
}
window.addEventListener('beforeunload', revokeAllObjectURLs);

// Request queue for server synchronization
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }
    
    async add(requestFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn: requestFn, resolve, reject });
            this.process();
        });
    }
    
    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            const { fn, resolve, reject } = this.queue.shift();
            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        
        this.processing = false;
    }
}
const serverQueue = new RequestQueue();

// Unified swipe handler
class SwipeHandler {
    constructor(element, options = {}) {
        this.element = element;
        this.threshold = options.threshold || 110;
        this.onLeft = options.onLeft || (() => {});
        this.onRight = options.onRight || (() => {});
        this.startX = 0;
        this.currentX = 0;
        this.isDragging = false;
        this.init();
    }
    
    init() {
        this.element.addEventListener('touchstart', e => this.handleStart(e), { passive: true });
        this.element.addEventListener('touchmove', e => this.handleMove(e), { passive: true });
        this.element.addEventListener('touchend', e => this.handleEnd(e));
        this.element.addEventListener('mousedown', e => this.handleStart(e));
        this.element.addEventListener('mousemove', e => this.handleMove(e));
        this.element.addEventListener('mouseup', e => this.handleEnd(e));
    }
    
    handleStart(e) {
        this.isDragging = true;
        this.element.classList.add('swiping');
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        this.startX = clientX;
        this.currentX = clientX;
    }
    
    handleMove(e) {
        if (!this.isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        this.currentX = clientX;
        const deltaX = this.currentX - this.startX;
        this.element.style.transform = `translateX(${deltaX}px)`;
    }
    
    handleEnd(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.classList.remove('swiping');
        const deltaX = this.currentX - this.startX;
        
        if (deltaX < -this.threshold) {
            this.onLeft();
        } else if (deltaX > this.threshold) {
            this.onRight();
        }
        this.element.style.transform = 'translateX(0)';
    }
    
    destroy() {
        ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup'].forEach(evt => {
            this.element.removeEventListener(evt, () => {});
        });
    }
}

// DOM elements
const roundNView = document.getElementById('roundNView');
const settingsView = document.getElementById('settingsView');
const imageReviewView = document.getElementById('imageReviewView');
const solutionView = document.getElementById('solutionView');
const achievementView = document.getElementById('achievementView');
const floatingCameraBtn = document.getElementById('floatingCameraBtn');
const cameraInput = document.getElementById('cameraInput');
const roundNList = document.getElementById('roundNList');
const roundNEmpty = document.getElementById('roundNEmpty');
const navNRound = document.getElementById('navNRound');
const navSettings = document.getElementById('navSettings');
const navAchievement = document.getElementById('navAchievement');
const backToCameraFromReview = document.getElementById('backToCameraFromReview');
const backFromSolution = document.getElementById('backFromSolution');
const deleteFromSolution = document.getElementById('deleteFromSolution');
const reviewImage = document.getElementById('reviewImage');
const imageCard = document.getElementById('imageCard');
const wrongBtn = document.getElementById('wrongBtn');
const ambiguousBtn = document.getElementById('ambiguousBtn');
const quizBadge = document.getElementById('quizBadge');
const popQuizContainer = document.getElementById('popQuizContainer');
const popQuizEmpty = document.getElementById('popQuizEmpty');
const solutionAnswerInput = document.getElementById('solutionAnswerInput');

// Quiz modal elements
const quizModal = document.getElementById('quizModal');
const quizImage = document.getElementById('quizImage');
const quizAnswer = document.getElementById('quizAnswer');
const quizSubmit = document.getElementById('quizSubmit');
const quizResult = document.getElementById('quizResult');

// Success modal controls
const successModal = document.getElementById('successModal');
const successLaterBtn = document.getElementById('successLaterBtn');
const successUnderstoodBtn = document.getElementById('successUnderstoodBtn');
const success5mBtn = document.getElementById('success5mBtn');
const success1hBtn = document.getElementById('success1hBtn');
const success1dBtn = document.getElementById('success1dBtn');

// Fail modal controls
const failModal = document.getElementById('failModal');
const fail5mBtn = document.getElementById('fail5mBtn');
const fail1hBtn = document.getElementById('fail1hBtn');
const fail1dBtn = document.getElementById('fail1dBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    (async () => {
        await ensureSession();
        await refreshAuthUi();
        routeAuthOrApp();
        initAuthPage();
        reloadUserState();
        if (window.currentAuthProvider === 'pin') {
            try { await pullServerDataReplaceLocal(); } catch(_) {}
            try { await fetch('/api/answers/migrate-canonical', { method: 'POST', credentials: 'include' }); } catch(_) {}
        }
        showNRoundView();
    })();

    // Refresh from server when window gains focus
    window.addEventListener('focus', async () => {
        if (window.currentAuthProvider === 'pin') {
            try { await pullServerDataReplaceLocal(); } catch(_) {}
            if (roundNView && roundNView.style.display !== 'none') displayNRoundQuestions();
            if (settingsView && settingsView.style.display !== 'none') displayPopQuiz();
            if (achievementView && achievementView.style.display !== 'none') displayAchievements();
        }
    });
});

// Set up event listeners
function setupEventListeners() {
    if (floatingCameraBtn) {
        floatingCameraBtn.addEventListener('click', () => {
            if (cameraInput) cameraInput.click();
        });
    }
    
    if (cameraInput) {
        cameraInput.addEventListener('change', handleImageCapture);
    }

    if (navNRound) navNRound.addEventListener('click', showNRoundView);
    if (navSettings) navSettings.addEventListener('click', showSettingsView);
    if (navAchievement) navAchievement.addEventListener('click', showAchievementView);
    if (backToCameraFromReview) backToCameraFromReview.addEventListener('click', showNRoundView);
    if (backFromSolution) backFromSolution.addEventListener('click', showNRoundView);
    if (deleteFromSolution) deleteFromSolution.addEventListener('click', handleDeleteCurrentSolution);

    if (solutionAnswerInput) {
        const handleAnswerSave = async () => {
            await persistSolutionAnswer();
            showToast('답안이 저장되었습니다!');
        };
        solutionAnswerInput.addEventListener('change', handleAnswerSave);
        solutionAnswerInput.addEventListener('blur', handleAnswerSave);
        solutionAnswerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAnswerSave();
            }
        });
    }

    const solutionAnswerSubmit = document.getElementById('solutionAnswerSubmit');
    if (solutionAnswerSubmit) {
        solutionAnswerSubmit.addEventListener('click', async () => {
            await persistSolutionAnswer();
            showToast('답안이 저장되었습니다!');
            showNRoundView();
        });
    }

    if (wrongBtn) {
        wrongBtn.addEventListener('click', (e) => {
            e.preventDefault();
            categorizeQuestion('wrong');
        });
    }
    if (ambiguousBtn) {
        ambiguousBtn.addEventListener('click', (e) => {
            e.preventDefault();
            categorizeQuestion('ambiguous');
        });
    }

    if (quizSubmit) quizSubmit.addEventListener('click', handleQuizSubmit);
    if (successLaterBtn) successLaterBtn.addEventListener('click', handleSuccessLater);
    if (successUnderstoodBtn) successUnderstoodBtn.addEventListener('click', handleSuccessUnderstood);
    if (success5mBtn) success5mBtn.addEventListener('click', () => rescheduleFromSuccess(5 * 60 * 1000));
    if (success1hBtn) success1hBtn.addEventListener('click', () => rescheduleFromSuccess(60 * 60 * 1000));
    if (success1dBtn) success1dBtn.addEventListener('click', () => rescheduleFromSuccess(24 * 60 * 60 * 1000));
    if (fail5mBtn) fail5mBtn.addEventListener('click', () => rescheduleCurrentQuiz(5 * 60 * 1000));
    if (fail1hBtn) fail1hBtn.addEventListener('click', () => rescheduleCurrentQuiz(60 * 60 * 1000));
    if (fail1dBtn) fail1dBtn.addEventListener('click', () => rescheduleCurrentQuiz(24 * 60 * 60 * 1000));

    // Profile dropdown
    const logoutBtn = document.getElementById('logoutBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileLogoutBtn = document.getElementById('profileLogoutBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (profileDropdown) {
                const visible = profileDropdown.style.display !== 'none';
                profileDropdown.style.display = visible ? 'none' : 'block';
            }
        });
    }

    if (profileLogoutBtn) {
        profileLogoutBtn.addEventListener('click', async () => {
            if (profileDropdown) profileDropdown.style.display = 'none';
            await doLogout();
        });
    }

    // Sort handler
    const nSortSelect = document.getElementById('nSortSelect');
    if (nSortSelect) {
        nSortSelect.addEventListener('change', displayNRoundQuestions);
    }
}

// Auth functions
async function ensureSession() {
    try {
        const me = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).catch(() => ({ user: null }));
        if (me && me.user) return;
        await fetch('/api/auth/anon', { method: 'POST', credentials: 'include' });
        await refreshAuthUi();
    } catch (_) {}
}

async function refreshAuthUi() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const j = await res.json();
        const user = j && j.user;
        const headerAvatar = document.getElementById('headerAvatar');
        const profileAvatar = document.getElementById('profileAvatar');
        const profilePublicId = document.getElementById('profilePublicId');
        const profileNickname = document.getElementById('profileNickname');
        
        if (user) {
            window.currentUserId = user.id || null;
            window.currentAuthProvider = user.provider || 'anon';
            window.currentPublicId = user.publicId || null;
            
            const seed = user.publicId || user.id || 'user';
            const url = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
            if (headerAvatar) headerAvatar.src = url;
            if (profileAvatar) profileAvatar.src = url;
            if (profilePublicId) profilePublicId.textContent = user.publicId || '-';
            if (profileNickname) profileNickname.textContent = user.nickname || user.name || '-';
        } else {
            window.currentUserId = null;
            window.currentAuthProvider = null;
        }
    } catch (_) {}
}

function routeAuthOrApp() {
    const authView = document.getElementById('authView');
    const showAuth = !window.currentAuthProvider || window.currentAuthProvider !== 'pin';
    if (authView) authView.style.display = showAuth ? 'flex' : 'none';
    if (roundNView) roundNView.style.display = showAuth ? 'none' : 'block';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'none';
}

function initAuthPage() {
    const authView = document.getElementById('authView');
    const btn = document.getElementById('authActionBtn');
    const nn = document.getElementById('authNickname');
    const err = document.getElementById('authError');

    if (!authView || !btn || !nn) return;

    async function submitAuth() {
        const nickname = (nn.value || '').trim();
        
        if (!nickname) {
            if (err) { 
                err.textContent = '닉네임을 입력해 주세요.'; 
                err.style.display = 'block'; 
            }
            return;
        }
        
        // Create a simple PIN based on nickname for compatibility
        const pin = '1234'; // Default PIN for all users
        
        try {
            // Try to register first, then login if user already exists
            let res = await fetch('/api/auth/register-pin', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                credentials: 'include', 
                body: JSON.stringify({ nickname, pin }) 
            });
            
            // If registration fails (user exists), try login
            if (!res.ok && res.status === 400) {
                res = await fetch('/api/auth/login-pin', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    credentials: 'include', 
                    body: JSON.stringify({ nickname, pin }) 
                });
            }
            
            if (!res.ok) {
                if (err) {
                    err.textContent = '닉네임을 확인해 주세요.';
                    err.style.display = 'block';
                }
                return;
            }
            
            if (err) err.style.display = 'none';
            await refreshAuthUi();
            routeAuthOrApp();
            reloadUserState();
            if (window.currentAuthProvider === 'pin') {
                try { await pullServerDataReplaceLocal(); } catch (_) {}
            }
            showNRoundView();
        } catch (e) {
            if (err) { 
                err.textContent = '요청에 실패했습니다.'; 
                err.style.display = 'block'; 
            }
        }
    }

    btn.addEventListener('click', submitAuth);
}

async function doLogout() {
    try { 
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); 
    } catch (_) {}
    window.currentUserId = null;
    window.currentAuthProvider = null;
    await refreshAuthUi();
    reloadUserState();
    routeAuthOrApp();
}

// State management
function reloadUserState() {
    questions = [];
    popQuizItems = [];
    achievements = [];
    loadQuestions();
    loadPopQuizItems();
    loadAchievements();
    loadAnswerByHash();
    updatePopQuizBadge();
    if (roundNView && roundNView.style.display !== 'none') displayNRoundQuestions();
    if (achievementView && achievementView.style.display !== 'none') displayAchievements();
}

// View navigation
function showNRoundView() {
    if (roundNView) roundNView.style.display = 'block';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'none';

    if (navNRound) navNRound.classList.add('active');
    if (navSettings) navSettings.classList.remove('active');
    if (navAchievement) navAchievement.classList.remove('active');

    displayNRoundQuestions();
}

function showSettingsView() {
    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'block';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'none';

    if (navNRound) navNRound.classList.remove('active');
    if (navSettings) navSettings.classList.add('active');
    if (navAchievement) navAchievement.classList.remove('active');

    displayPopQuiz();
}

function showAchievementView() {
    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'block';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'none';

    if (navNRound) navNRound.classList.remove('active');
    if (navSettings) navSettings.classList.remove('active');
    if (navAchievement) navAchievement.classList.add('active');

    displayAchievements();
}

function showImageReviewView() {
    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'flex';
    if (solutionView) solutionView.style.display = 'none';
}

// Image handling
async function handleImageCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentImageBlob = file;
    currentImageUrl = createObjectURL(file);
    currentImageHash = null;

    try {
        const fr = new FileReader();
        fr.onload = async (e) => {
            const dataUrl = e.target.result;
            currentImageHash = await computeSHA256HexFromDataUrl(dataUrl);
        };
        fr.readAsDataURL(file);
    } catch (_) {}

    reviewImage.src = currentImageUrl;
    const reviewAnswerInput = document.getElementById('reviewAnswerInput');
    if (reviewAnswerInput) reviewAnswerInput.value = '';

    showImageReviewView();
    cameraInput.value = '';
}

async function categorizeQuestion(category) {
    // Check answer requirement for ambiguous category
    if (category === 'ambiguous') {
        const reviewAnswerInput = document.getElementById('reviewAnswerInput');
        const hasAnswer = reviewAnswerInput && reviewAnswerInput.value && reviewAnswerInput.value.trim();
        if (!hasAnswer) {
            const modal = document.getElementById('answerReqModal');
            const input = document.getElementById('answerReqInput');
            const submit = document.getElementById('answerReqSubmit');
            const closeBtn = document.getElementById('answerReqClose');
            if (modal && input && submit) {
                modal.style.display = 'flex';
                input.value = '';
                input.focus();
                const cleanup = () => {
                    modal.style.display = 'none';
                    submit.onclick = null;
                    if (closeBtn) closeBtn.onclick = null;
                };
                if (closeBtn) closeBtn.onclick = cleanup;
                submit.onclick = async () => {
                    const answer = input.value.trim();
                    if (!answer) { input.focus(); return; }
                    if (reviewAnswerInput) reviewAnswerInput.value = answer;
                    cleanup();
                    categorizeQuestion(category);
                };
                return;
            }
        }
    }

    if (!currentImageBlob) {
        showToast('이미지가 없습니다.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        let dataUrl = e.target.result;
        
        // Compress and upload to server
        try { 
            dataUrl = await compressDataUrl(dataUrl, 800, 0.75);
            
            const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
            const formData = new FormData();
            const blob = await dataUrlToBlob(dataUrl);
            formData.append('image', blob, 'image.jpg');
            const up = await fetch(base + '/api/upload-image-form', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            if (up.ok) {
                const j = await up.json();
                if (j && j.url) {
                    dataUrl = j.url; // Store URL instead of base64
                }
            }
        } catch (err) {
            // Fallback: compress more aggressively
            try { dataUrl = await compressDataUrl(dataUrl, 480, 0.5); } catch (_) {}
        }

        let imageHash = null;
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            imageHash = currentImageHash || await computeSHA256HexFromDataUrl(dataUrl);
        } else {
            imageHash = await canonicalHashFromUrl(dataUrl);
        }
        
        const reviewAnswerInput = document.getElementById('reviewAnswerInput');
        const initialAnswer = reviewAnswerInput ? (reviewAnswerInput.value || '') : '';
        
        const newQuestion = {
            id: Date.now(),
            questionNumber: '문제 ' + (questions.length + 1),
            publisher: '출처모름',
            questionText: '이미지 문제',
            imageUrl: dataUrl,
            imageHash: imageHash || null,
            category: category,
            round: 0,
            timestamp: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            userAnswer: initialAnswer
        };

        questions.unshift(newQuestion);
        if (newQuestion.imageHash) {
            await saveAnswerForHash(newQuestion.imageHash, initialAnswer);
        }
        
        saveQuestions();
        
        // Persist to server
        if (window.currentAuthProvider === 'pin') {
            try {
                const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                const resp = await fetch(base + '/api/questions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ 
                        imageHash: imageHash, 
                        imageUrl: dataUrl, 
                        questionNumber: newQuestion.questionNumber, 
                        category, 
                        round: 0 
                    })
                });
                if (resp.ok) {
                    const j = await resp.json();
                    if (j && j.item && j.item.id) {
                        newQuestion.dbId = j.item.id;
                    }
                }
            } catch (_) {}
        }
        
        cleanupCurrentImage();
        showNRoundView();
        showToast((category === 'ambiguous') ? '애매한 문제로 저장되었습니다' : '틀린 문제로 저장되었습니다');
    };

    reader.readAsDataURL(currentImageBlob);
}

function cleanupCurrentImage() {
    if (currentImageUrl && objectURLs.has(currentImageUrl)) {
        URL.revokeObjectURL(currentImageUrl);
        objectURLs.delete(currentImageUrl);
    }
    currentImageBlob = null;
    currentImageUrl = null;
    currentImageHash = null;
}

// Display functions
function displayNRoundQuestions() {
    let roundNQuestions = questions.filter(q => (q.round ?? -1) >= 0);

    // Apply sorting
    const sortSelect = document.getElementById('nSortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'created_recent';
    roundNQuestions = sortNRoundQuestions(roundNQuestions, sortValue);

    // Exclude items in pop quiz or achievements
    const excludedIds = new Set([
        ...(popQuizItems || []).map(p => String(p.dbId || p.questionId || '')),
        ...(achievements || []).map(a => String(a.dbId || a.questionId || '')),
    ].filter(Boolean));
    roundNQuestions = roundNQuestions.filter(q => !excludedIds.has(String(q.dbId || q.id)));

    if (roundNQuestions.length === 0) {
        if (roundNList) roundNList.style.display = 'none';
        if (roundNEmpty) roundNEmpty.style.display = 'block';
        return;
    }

    if (roundNList) roundNList.style.display = 'block';
    if (roundNEmpty) roundNEmpty.style.display = 'none';

    if (!roundNList) return;

    roundNList.innerHTML = roundNQuestions.map(question => `
        <div class="question-item" data-id="${question.id}">
            <div class="question-with-image">
                <div class="question-image">
                    <img src="${question.imageUrl}" alt="문제 이미지" />
                </div>
                <div class="question-content">
                    <div class="question-header">
                        <span class="question-number">${question.questionNumber}</span>
                        <div class="question-meta">
                            <div class="source-category">
                                <span class="question-round">${question.round}회독</span>
                            </div>
                        </div>
                    </div>
                    <div class="question-timestamp">
                        ${new Date(question.lastAccessed || question.timestamp).toLocaleDateString('ko-KR', { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        })}
                    </div>
                    <div class="question-tags">
                        ${question.category ? `<span class="question-category ${question.category}">${question.category === 'ambiguous' ? '애매했던 문제' : '틀렸던 문제'}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    applyRoundBadgeStyles(roundNList);

    // Add click and swipe handlers
    document.querySelectorAll('#roundNList .question-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!item.classList.contains('swiping')) {
                const questionId = String(item.dataset.id);
                showSolutionView(questionId);
            }
        });
        
        setupNRoundSwipe(item);
    });
}

function sortNRoundQuestions(items, mode) {
    const arr = [...items];
    if (mode === 'created_recent') {
        arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (mode === 'created_oldest') {
        arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (mode === 'round_desc') {
        arr.sort((a, b) => (b.round ?? 0) - (a.round ?? 0));
    } else if (mode === 'round_asc') {
        arr.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
    } else if (mode === 'recent') {
        arr.sort((a, b) => new Date(b.lastAccessed || b.timestamp) - new Date(a.lastAccessed || a.timestamp));
    } else if (mode === 'oldest') {
        arr.sort((a, b) => new Date(a.lastAccessed || a.timestamp) - new Date(b.lastAccessed || b.timestamp));
    }
    return arr;
}

function applyRoundBadgeStyles(container) {
    if (!container) return;
    const badges = container.querySelectorAll('.question-round');
    badges.forEach(badge => {
        const text = (badge.textContent || '').trim();
        const match = text.match(/(\d+)/);
        const round = match ? Math.min(parseInt(match[1], 10) || 0, 10) : 0;
        const t = Math.max(0, Math.min(round / 10, 1));
        const hueStart = 220;
        const hueEnd = 0;
        const hue = Math.round(hueStart + (hueEnd - hueStart) * t);
        const color1 = `hsl(${hue}, 85%, 55%)`;
        const color2 = `hsl(${hue}, 85%, 45%)`;
        badge.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;
    });
}

function setupNRoundSwipe(item) {
    new SwipeHandler(item, {
        threshold: 110,
        onLeft: async () => {
            const qid = item.dataset.id;
            const q = questions.find(q => String(q.id) === String(qid));
            if (q) {
                q.round = (q.round || 0) + 1;
                saveQuestions();
                const badge = item.querySelector('.question-round');
                if (badge) {
                    badge.textContent = `${q.round}회독`;
                    badge.classList.add('bump');
                    setTimeout(() => badge.classList.remove('bump'), 300);
                }
                applyRoundBadgeStyles(item.parentElement || roundNList);
            }
        },
        onRight: async () => {
            const qid = item.dataset.id;
            const q = questions.find(q => String(q.id) === String(qid));
            if (q) {
                const hasAnswer = await hasAnswerForQuestion(q);
                if (!hasAnswer) {
                    const modal = document.getElementById('answerReqModal');
                    const input = document.getElementById('answerReqInput');
                    const submit = document.getElementById('answerReqSubmit');
                    const closeBtn = document.getElementById('answerReqClose');
                    if (modal && input && submit) {
                        modal.style.display = 'flex';
                        input.value = '';
                        input.focus();
                        const cleanup = () => {
                            modal.style.display = 'none';
                            submit.onclick = null;
                            if (closeBtn) closeBtn.onclick = null;
                        };
                        if (closeBtn) closeBtn.onclick = cleanup;
                        submit.onclick = async () => {
                            const v = input.value.trim();
                            if (!v) { input.focus(); return; }
                            const h2 = q.imageHash || (await ensureQuestionImageHash(q));
                            if (h2) { await saveAnswerForHash(h2, v); }
                            
                            const entry = {
                                imageUrl: q.imageUrl,
                                questionId: String(q.dbId || q.id),
                                questionNumber: q.questionNumber,
                                category: q.category,
                                lastAccessed: q.lastAccessed || q.timestamp,
                                reappearAt: new Date(Date.now() + POP_QUIZ_DELAY_MS).toISOString(),
                                round: q.round || 0
                            };
                            popQuizItems.push(entry);
                            savePopQuizItems();
                            updatePopQuizBadge();
                            
                            const idx = questions.findIndex(qq => String(qq.id) === String(qid));
                            if (idx !== -1) {
                                questions.splice(idx, 1);
                                saveQuestions();
                                displayNRoundQuestions();
                            }
                            cleanup();
                        };
                    }
                    return;
                }
                
                const entry = {
                    imageUrl: q.imageUrl,
                    questionId: String(q.dbId || q.id),
                    questionNumber: q.questionNumber,
                    category: q.category,
                    lastAccessed: q.lastAccessed || q.timestamp,
                    reappearAt: new Date(Date.now() + POP_QUIZ_DELAY_MS).toISOString(),
                    round: q.round || 0
                };
                popQuizItems.push(entry);
                savePopQuizItems();
                updatePopQuizBadge();
                
                const idx = questions.findIndex(qq => String(qq.id) === String(qid));
                if (idx !== -1) {
                    questions.splice(idx, 1);
                    saveQuestions();
                    displayNRoundQuestions();
                }
            }
        }
    });
}

function displayPopQuiz() {
    const now = Date.now();
    const readyItems = popQuizItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => isPopQuizReady(item, now));

    updatePopQuizStatusPanel();

    if (readyItems.length === 0) {
        if (popQuizContainer) popQuizContainer.style.display = 'none';
        if (popQuizEmpty) popQuizEmpty.style.display = 'block';
        return;
    }

    if (popQuizContainer) popQuizContainer.style.display = 'block';
    if (popQuizEmpty) popQuizEmpty.style.display = 'none';
    if (!popQuizContainer) return;

    popQuizContainer.innerHTML = readyItems.map(({ item, idx }) => `
        <div class="pop-quiz-card" data-id="${item.id}" data-index="${idx}">
            <div class="question-with-image">
                <div class="question-image">
                    <img src="${item.imageUrl}" alt="팝퀴즈 이미지" />
                </div>
                <div class="question-content">
                    <div class="question-header">
                        <span class="question-number">${item.questionNumber || '문제'}</span>
                        <div class="question-meta">
                            <div class="source-category">
                                <span class="question-round">${item.round || 0}회독</span>
                                <span class="quiz-count">퀴즈 ${(item.quizCount || 0)}회</span>
                            </div>
                        </div>
                    </div>
                    <div class="question-timestamp">
                        ${new Date(item.lastAccessed || Date.now()).toLocaleDateString('ko-KR', { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        })}
                    </div>
                    <div class="source-category">
                        <span class="question-category ${item.category || ''}">${(item.category === 'ambiguous') ? '애매했던 문제' : '틀렸던 문제'}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    popQuizContainer.querySelectorAll('.pop-quiz-card').forEach(card => {
        const index = parseInt(card.getAttribute('data-index'));
        card.addEventListener('click', () => openQuizModal(index));
    });
}

function displayAchievements() {
    const list = document.getElementById('achievementList');
    const empty = document.getElementById('achievementEmpty');
    const status = document.getElementById('achievementStatus');
    if (!list || !empty) return;

    if (status) {
        const info = getAchievementRankInfo((achievements || []).length);
        status.style.display = 'block';
        const percent = Math.round(info.progressRatio * 100);
        const progressFill = info.rank >= info.maxRank ? 100 : percent;
        
        const badges = Array.from({ length: info.maxRank }, (_, i) => {
            const idx = i + 1;
            const active = idx <= info.rank ? 'active' : '';
            return `<div class="rank-badge ${active}">${idx <= info.rank ? '⭐' : '☆'}</div>`;
        }).join('');
        
        const nextText = info.rank >= info.maxRank ? '최고 등급 도달' : `${info.remaining}개 남음`;
        status.innerHTML = `
            <div class="rank-panel fun">
                <div class="rank-tier-title">
                    <span class="rank-emoji">${info.title.e}</span>${info.title.t}
                </div>
                <div class="rank-badges">${badges}</div>
                <div class="rank-stats">
                    <span>${info.nextTitle ? info.nextTitle.t : '다음 등급'}까지: <strong>${nextText}</strong></span>
                </div>
                <div class="rank-progress">
                    <div class="rank-progress-bar" style="width:${progressFill}%"></div>
                </div>
            </div>`;
    }

    if (!achievements || achievements.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        list.innerHTML = '';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';
    list.innerHTML = achievements.map(q => `
        <div class="success-item" data-id="${q.id}">
            <div class="question-with-image">
                <div class="question-image">
                    <img src="${q.imageUrl}" alt="문제 이미지" />
                </div>
                <div class="question-content">
                    <div class="question-header">
                        <span class="question-number">${q.questionNumber}</span>
                        <div class="question-meta">
                            <div class="source-category">
                                <span class="question-round">${q.round}회독</span>
                                <span class="quiz-count">퀴즈 ${(q.quizCount || 0)}회</span>
                            </div>
                        </div>
                    </div>
                    <div class="question-timestamp">
                        ${new Date(q.achievedAt || q.lastAccessed || q.timestamp).toLocaleDateString('ko-KR', { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        })}
                    </div>
                    <div class="source-category">
                        <span class="question-category ${q.category || ''}">${(q.category === 'ambiguous') ? '애매했던 문제' : '틀렸던 문제'}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function getAchievementRankInfo(achieveCount) {
    const increments = [3, 5, 9, 16];
    const totals = [];
    let sum = 0;
    for (let i = 0; i < increments.length; i++) {
        sum += increments[i];
        totals.push(sum);
    }

    let rank = 1;
    let prevTotal = 0;
    let stepIndex = 0;
    for (; stepIndex < totals.length; stepIndex++) {
        if (achieveCount >= totals[stepIndex]) {
            rank += 1;
            prevTotal = totals[stepIndex];
        } else {
            break;
        }
    }

    const maxRank = 5;
    if (rank > maxRank) rank = maxRank;
    const nextStepSize = stepIndex < increments.length ? increments[stepIndex] : 0;
    const inStepProgress = Math.max(0, achieveCount - prevTotal);
    const remaining = Math.max(0, nextStepSize - inStepProgress);
    const progressRatio = nextStepSize > 0 ? Math.min(1, inStepProgress / nextStepSize) : 1;

    const titles = [
        { t: '오답노트 어린이', e: '🌱' },
        { t: '오답노트 도전자', e: '💪' },
        { t: '오답노트 숙련자', e: '🚀' },
        { t: '오답노트 마스터', e: '🏆' },
        { t: '오답노트 레전드', e: '🌟' },
    ];
    const title = titles[Math.min(rank - 1, titles.length - 1)];
    const nextTitle = titles[Math.min(rank, titles.length - 1)];

    return { rank, maxRank, achieveCount, nextStepSize, inStepProgress, remaining, progressRatio, title, nextTitle };
}

// Solution view
function showSolutionView(questionId) {
    const question = questions.find(q => String(q.id) === String(questionId));
    if (!question) return;

    question.lastAccessed = new Date().toISOString();
    saveQuestions();

    document.getElementById('solutionQuestionNumber').textContent = question.questionNumber;
    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = question.category === 'ambiguous' ? '애매했던 문제' : '틀렸던 문제';
    solutionCategory.className = `solution-category ${question.category}`;
    document.getElementById('solutionImage').src = question.imageUrl;

    solutionView.dataset.currentId = String(question.id);

    if (solutionAnswerInput) {
        solutionAnswerInput.value = question.userAnswer || '';
        ensureQuestionImageHash(question).then(async (hash) => {
            if (!hash) return;
            const answer = await getAnswerForHash(hash);
            if (answer) solutionAnswerInput.value = answer;
            
            const valEl = document.getElementById('answerValue');
            if (valEl) {
                const v = (answer || '').trim();
                valEl.textContent = v ? v : '정답을 알려주세요';
            }
        });
    }

    setupAnswerReveal();
    solutionView.scrollTop = 0;

    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'block';
}

function setupAnswerReveal() {
    const valEl = document.getElementById('answerValue');
    const revealBtn = document.getElementById('answerReveal');
    if (revealBtn && valEl) {
        revealBtn.onclick = () => {
            const isHidden = valEl.style.display === 'none';
            valEl.style.display = isHidden ? 'inline' : 'none';
            revealBtn.textContent = isHidden ? '숨기기' : '보기';
        };
    }
}

async function persistSolutionAnswer() {
    const questionId = parseInt(solutionView.dataset.currentId);
    if (!questionId) return;
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    const answer = (solutionAnswerInput && solutionAnswerInput.value) || '';
    question.userAnswer = answer;
    const hash = await ensureQuestionImageHash(question);
    if (hash) {
        question.imageHash = hash;
        await saveAnswerForHash(hash, answer);
    }
    saveQuestions();
}

async function handleDeleteCurrentSolution() {
    const questionId = solutionView.dataset.currentId;
    const questionIndex = questions.findIndex(q => String(q.id) === String(questionId));

    if (questionIndex !== -1) {
        questions.splice(questionIndex, 1);
        saveQuestions();
        
        if (window.currentAuthProvider === 'pin') {
            try {
                const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                await fetch(`${base}/api/questions/${questionId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
            } catch (_) {}
        }
        
        showToast('문제가 삭제되었습니다!');
        showNRoundView();
    }
}

// Quiz handling
function openQuizModal(index) {
    const quizItem = popQuizItems[index];
    if (!quizItem) return;
    quizModal.style.display = 'flex';
    quizImage.src = quizItem.imageUrl;
    quizModal.dataset.index = String(index);
}

function closeQuizModal() {
    if (!quizModal) return;
    quizModal.style.display = 'none';
    if (quizResult) quizResult.style.display = 'none';
    if (quizAnswer) quizAnswer.value = '';
    delete quizModal.dataset.index;
}

async function handleQuizSubmit() {
    const indexStr = quizModal.dataset.index;
    if (!indexStr) return;
    const index = parseInt(indexStr);
    const quizItem = popQuizItems[index];
    if (!quizItem) return;

    const userAnswer = (quizAnswer.value || '').trim();
    const hash = await ensureQuestionImageHash(quizItem);
    if (hash) quizItem.imageHash = hash;
    const correctAnswer = await getAnswerForHash(hash);

    const isCorrect = normalizeAnswer(userAnswer).length > 0 &&
                      normalizeAnswer(correctAnswer).length > 0 &&
                      (normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer));

    quizItem.quizCount = (quizItem.quizCount || 0) + 1;
    savePopQuizItems();

    if (settingsView && settingsView.style.display !== 'none') {
        displayPopQuiz();
    }

    quizResult.style.display = 'block';
    quizResult.textContent = isCorrect
        ? '✅ 정답입니다! 이제 이 문제를 완벽히 이해하신 것 같네요!'
        : '❌ 틀렸습니다. 다음에 또 시도해보아요!';
    quizResult.className = `quiz-result ${isCorrect ? 'correct' : 'wrong'}`;

    if (isCorrect) {
        openSuccessModal();
    } else {
        openFailModal();
    }
}

function openSuccessModal() {
    if (successModal) successModal.style.display = 'flex';
}

function closeSuccessModal() {
    if (successModal) successModal.style.display = 'none';
}

function openFailModal() {
    if (failModal) failModal.style.display = 'flex';
}

function closeFailModal() {
    if (failModal) failModal.style.display = 'none';
}

function handleSuccessLater() {
    const main = document.getElementById('successMainActions');
    const opts = document.getElementById('successDelayOptions');
    if (main) main.style.display = 'none';
    if (opts) opts.style.display = 'flex';
}

function handleSuccessUnderstood() {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number') {
        const removed = popQuizItems.splice(idx, 1)[0];
        if (removed) {
            removed.lastAccessed = new Date().toISOString();
            achievements.unshift({ ...removed, achievedAt: new Date().toISOString() });
            saveAchievements();
            savePopQuizItems();
            updatePopQuizBadge();
            
            if (navAchievement) {
                navAchievement.classList.add('achieve-pulse');
                const removePulse = () => {
                    navAchievement.classList.remove('achieve-pulse');
                    navAchievement.removeEventListener('animationend', removePulse);
                };
                navAchievement.addEventListener('animationend', removePulse);
            }
        }
    }
    closeSuccessModal();
    closeQuizModal();
}

function rescheduleFromSuccess(delayMs) {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number' && popQuizItems[idx]) {
        popQuizItems[idx].reappearAt = new Date(Date.now() + delayMs).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeSuccessModal();
        closeQuizModal();
        if (settingsView.style.display !== 'none') displayPopQuiz();
    } else {
        closeSuccessModal();
    }
}

function rescheduleCurrentQuiz(delayMs) {
    const indexStr = quizModal.dataset.index;
    const index = indexStr ? parseInt(indexStr) : undefined;
    if (typeof index === 'number' && popQuizItems[index]) {
        popQuizItems[index].reappearAt = new Date(Date.now() + delayMs).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeFailModal();
        closeQuizModal();
        if (settingsView.style.display !== 'none') displayPopQuiz();
    } else {
        closeFailModal();
    }
}

// Storage functions
function saveQuestions() {
    localStorage.setItem(storageKey('reviewNoteQuestions'), JSON.stringify(questions));

    if (window.currentAuthProvider === 'pin') {
        serverQueue.add(async () => {
            try {
                const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                await fetch(base + '/api/sync/questions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ questions })
                });
            } catch (e) {
                console.warn('Server sync failed:', e);
            }
        });
    }
}

function loadQuestions() {
    const saved = localStorage.getItem(storageKey('reviewNoteQuestions'));
    if (saved) {
        try {
            questions = JSON.parse(saved);
        } catch (error) {
            questions = [];
        }
    }
}

function savePopQuizItems() {
    localStorage.setItem(storageKey('reviewNotePopQuiz'), JSON.stringify(popQuizItems));
}

function loadPopQuizItems() {
    const saved = localStorage.getItem(storageKey('reviewNotePopQuiz'));
    if (saved) {
        try {
            popQuizItems = JSON.parse(saved);
        } catch (error) {
            popQuizItems = [];
        }
    }
}

function saveAchievements() {
    localStorage.setItem(storageKey('reviewNoteAchievements'), JSON.stringify(achievements));
}

function loadAchievements() {
    const saved = localStorage.getItem(storageKey('reviewNoteAchievements'));
    if (saved) {
        try {
            achievements = JSON.parse(saved) || [];
        } catch (_) {
            achievements = [];
        }
    }
}

function saveAnswerByHash() {
    try { 
        localStorage.setItem(storageKey('answerByHash'), JSON.stringify(answerByHash)); 
    } catch (_) {}
}

function loadAnswerByHash() {
    try {
        const v = localStorage.getItem(storageKey('answerByHash'));
        answerByHash = v ? (JSON.parse(v) || {}) : {};
    } catch (_) {
        answerByHash = {};
    }
}

// Answer management
async function saveAnswerForHash(imageHash, answer) {
    if (!imageHash) return;
    const val = (answer || '').trim();
    answerByHash[imageHash] = val;
    saveAnswerByHash();

    try {
        const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
        await fetch(base + '/api/answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ imageHash, answer: val })
        });
    } catch (_) {}
}

async function getAnswerForHash(imageHash) {
    if (!imageHash) return '';
    const local = (answerByHash && typeof answerByHash[imageHash] === 'string') ? answerByHash[imageHash] : '';
    if (local) return local;

    try {
        const r = await fetch(`/api/answers/${imageHash}`, { credentials: 'include' });
        if (r.ok) {
            const j = await r.json();
            if (typeof j.answer === 'string') return j.answer.trim();
        }
    } catch (_) {}
    return '';
}

// Utility functions
function normalizeAnswer(v) {
    if (!v) return '';
    let s = String(v).trim();
    s = s.replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
    s = s.replace(/\s+/g, ' ');
    return s;
}

function isPopQuizReady(item, nowTs) {
    const now = nowTs || Date.now();
    if (item.reappearAt) {
        return now >= new Date(item.reappearAt).getTime();
    }
    const added = item.popQuizAdded ? new Date(item.popQuizAdded).getTime() : 0;
    return added > 0 && (now - added) >= POP_QUIZ_DELAY_MS;
}

function updatePopQuizBadge() {
    const now = Date.now();
    const readyCount = popQuizItems.filter(item => isPopQuizReady(item, now)).length;

    if (readyCount > 0) {
        quizBadge.textContent = String(readyCount);
        quizBadge.style.display = 'flex';
    } else {
        quizBadge.style.display = 'none';
    }
    updatePopQuizStatusPanel();
}

function updatePopQuizStatusPanel() {
    const waitingEl = document.getElementById('popQuizWaitingCountStat');
    const avgEl = document.getElementById('popQuizAvgRoundStat');
    if (!waitingEl || !avgEl) return;

    const now = Date.now();
    const ready = (popQuizItems || []).filter(item => isPopQuizReady(item, now));
    waitingEl.textContent = `${ready.length}개`;

    if (ready.length === 0) {
        avgEl.textContent = '0.00회독';
        return;
    }
    const sumRounds = ready.reduce((sum, item) => sum + (item.round || 0), 0);
    const avg = sumRounds / ready.length;
    avgEl.textContent = `${avg.toFixed(2)}회독`;
}

async function hasAnswerForQuestion(question) {
    try {
        const hash = question.imageHash || (await ensureQuestionImageHash(question));
        const serverOrLocal = await getAnswerForHash(hash);
        if (serverOrLocal && serverOrLocal.length > 0) return true;
        return false;
    } catch (_) {
        return false;
    }
}

// Hash functions
async function computeSHA256HexFromDataUrl(dataUrl) {
    try {
        const match = dataUrl.match(/^data:.*?;base64,(.*)$/);
        if (!match) return null;
        const bytes = base64ToUint8Array(match[1]);
        if (window.crypto && window.crypto.subtle) {
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
            return simpleHash(match[1]);
        }
    } catch (e) {
        return simpleHash(dataUrl.slice(0, 2048));
    }
}

async function computeSHA256HexFromString(text) {
    try {
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            const data = new TextEncoder().encode(String(text));
            const digest = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (_) {}
    return simpleHash(String(text || ''));
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
}

async function canonicalHashFromUrl(url) {
    if (!url) return null;
    try {
        const u = new URL(url, location.origin);
        return await computeSHA256HexFromString(u.pathname);
    } catch (_) {
        return await computeSHA256HexFromString(String(url));
    }
}

async function ensureQuestionImageHash(question) {
    if (question.imageHash) return question.imageHash;
    const url = question.imageUrl;
    if (!url) return null;
    let hash = null;
    if (typeof url === 'string' && url.startsWith('data:')) {
        hash = await computeSHA256HexFromDataUrl(url);
    } else {
        try {
            const u = new URL(url, location.origin);
            const pathOnly = u.pathname;
            hash = await computeSHA256HexFromString(pathOnly);
        } catch (_) {
            hash = await computeSHA256HexFromString(url);
        }
    }
    if (hash) {
        question.imageHash = hash;
        try { saveQuestions(); } catch (_) {}
    }
    return hash;
}

// Image compression
async function compressDataUrl(dataUrl, maxSize = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let { width, height } = img;
            if (width > height && width > maxSize) {
                height = (maxSize / width) * height;
                width = maxSize;
            } else if (height > maxSize) {
                width = (maxSize / height) * width;
                height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                } else {
                    reject(new Error('Compression failed'));
                }
            }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

function dataUrlToBlob(dataUrl) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(resolve, 'image/jpeg', 0.8);
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// Server sync
async function pullServerDataReplaceLocal() {
    try {
        const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
        
        let qItems = [];
        let pqItems = [];
        let aItems = [];
        
        try {
            const [qRes, pqRes, aRes] = await Promise.all([
                fetch(base + '/api/questions', { credentials: 'include' }),
                fetch(base + '/api/pop-quiz-queue', { credentials: 'include' }),
                fetch(base + '/api/achievements', { credentials: 'include' })
            ]);
            
            if (qRes.ok) {
                const j = await qRes.json();
                qItems = (j && j.items) || [];
            }
            if (pqRes.ok) {
                const j = await pqRes.json();
                pqItems = (j && j.items) || [];
            }
            if (aRes.ok) {
                const j = await aRes.json();
                aItems = (j && j.items) || [];
            }
        } catch(_) {}

        if (qItems.length > 0) {
            questions = qItems.map(q => ({
                id: q.id || Date.now(),
                questionNumber: q.questionNumber || '문제',
                publisher: q.publisher || '출처모름',
                questionText: '이미지 문제',
                imageUrl: (q.image && q.image.url) || '',
                imageHash: (q.image && q.image.hash) || null,
                category: q.category || 'wrong',
                round: q.round || 0,
                timestamp: q.timestamp || new Date().toISOString(),
                lastAccessed: q.lastAccessed || new Date().toISOString(),
                userAnswer: '',
                dbId: q.id
            }));
            saveQuestions();
        }

        if (pqItems.length > 0) {
            popQuizItems = pqItems.map(p => ({
                id: p.questionId,
                questionNumber: (p.question && p.question.questionNumber) || '문제',
                imageUrl: (p.question && p.question.image && p.question.image.url) || '',
                imageHash: (p.question && p.question.image && p.question.image.hash) || null,
                category: (p.question && p.question.category) || 'wrong',
                round: (p.question && p.question.round) || 0,
                lastAccessed: (p.question && p.question.lastAccessed) || new Date().toISOString(),
                quizCount: (p.question && p.question.quizCount) || 0,
                popQuizAdded: (p.createdAt) || new Date().toISOString(),
                reappearAt: p.nextAt || null,
                dbId: p.questionId
            }));
            savePopQuizItems();
        }

        if (aItems.length > 0) {
            achievements = aItems.map(a => ({
                id: a.questionId,
                questionNumber: (a.question && a.question.questionNumber) || '문제',
                imageUrl: (a.question && a.question.image && a.question.image.url) || '',
                imageHash: (a.question && a.question.image && a.question.image.hash) || null,
                category: (a.question && a.question.category) || 'wrong',
                round: (a.question && a.question.round) || 0,
                lastAccessed: (a.question && a.question.lastAccessed) || new Date().toISOString(),
                quizCount: (a.question && a.question.quizCount) || 0,
                achievedAt: a.achievedAt || new Date().toISOString(),
                dbId: a.questionId
            }));
            saveAchievements();
        }
        
        updatePopQuizBadge();
    } catch(_) {}
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .toast {
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 3000;
            animation: slideDown 0.3s ease;
        }
        
        @keyframes slideDown {
            from {
                transform: translate(-50%, -20px);
                opacity: 0;
            }
            to {
                transform: translate(-50%, 0);
                opacity: 1;
            }
        }
    `;

    if (!document.querySelector('style[data-toast]')) {
        style.setAttribute('data-toast', 'true');
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}