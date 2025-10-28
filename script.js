// Optimized script.js - Refactored with modular architecture
// Analytics, Storage, and Utils are loaded from separate modules

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
let previousView = null; // Track which view user came from

// Storage key helper function
function storageKey(base) {
    const uid = window.currentUserId || 'anon';
    return `${base}::${uid}`;
}

// Constants
const POP_QUIZ_DELAY_MS = 15 * 60 * 1000; // 15 minutes (minimum delay for pop quiz appearance)
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
        
        // Enhanced visual feedback for pop quiz swipe
        if (deltaX > 0) {
            // Swiping right (towards pop quiz)
            const progress = Math.min(deltaX / this.threshold, 1);
            const opacity = progress * 0.3;
            const scale = 1 - (progress * 0.05);
            
            this.element.style.transform = `translateX(${deltaX}px) scale(${scale})`;
            this.element.style.background = `linear-gradient(90deg, rgba(0, 200, 81, ${opacity}) 0%, transparent 50%)`;
            this.element.style.borderLeft = progress > 0.5 ? '3px solid #00C851' : '';
            
            // Add pop quiz icon hint when close to threshold
            if (progress > 0.7 && !this.element.querySelector('.swipe-hint')) {
                const hint = document.createElement('div');
                hint.className = 'swipe-hint';
                hint.innerHTML = '📚 팝퀴즈';
                hint.style.cssText = `
                    position: absolute;
                    right: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #00C851;
                    font-size: 0.8rem;
                    font-weight: 600;
                    opacity: ${progress - 0.7};
                    pointer-events: none;
                `;
                this.element.appendChild(hint);
            }
        } else if (deltaX < 0) {
            // Swiping left (round increment)
            const progress = Math.min(Math.abs(deltaX) / this.threshold, 1);
            const opacity = progress * 0.3;
            const scale = 1 - (progress * 0.05);
            
            this.element.style.transform = `translateX(${deltaX}px) scale(${scale})`;
            this.element.style.background = `linear-gradient(270deg, rgba(255, 85, 0, ${opacity}) 0%, transparent 50%)`;
            this.element.style.borderRight = progress > 0.5 ? '3px solid #FF5500' : '';
        } else {
            this.element.style.transform = `translateX(${deltaX}px)`;
        }
    }
    
    handleEnd(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.classList.remove('swiping');
        const deltaX = this.currentX - this.startX;
        
        // Clean up visual effects
        const hint = this.element.querySelector('.swipe-hint');
        if (hint) hint.remove();
        
        let swipeAction = null;
        if (deltaX < -this.threshold) {
            swipeAction = 'left';
            this.onLeft();
        } else if (deltaX > this.threshold) {
            swipeAction = 'right';
            this.onRight();
        }
        
        // Track swipe action if it occurred
        if (swipeAction && analytics) {
            const questionId = this.element.dataset.id || 'unknown';
            analytics.track('Swipe Action', {
                direction: swipeAction,
                question_id: questionId,
                swipe_distance: Math.abs(deltaX),
                action: swipeAction === 'left' ? 'round_increment' : 'pop_quiz'
            });
        }
        
        // Reset all visual effects
        this.element.style.transform = 'translateX(0)';
        this.element.style.background = '';
        this.element.style.borderLeft = '';
        this.element.style.borderRight = '';
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
const deleteFromReview = document.getElementById('deleteFromReview');
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
const successBackBtn = document.getElementById('successBackBtn');
const successCloseBtn = document.getElementById('successCloseBtn');
const success5mBtn = document.getElementById('success5mBtn');
const success1hBtn = document.getElementById('success1hBtn');
const success1dBtn = document.getElementById('success1dBtn');

// Fail modal controls
const failModal = document.getElementById('failModal');
const failRetryBtn = document.getElementById('failRetryBtn');

// Work Process Images functionality
const workProcessCameraBtn = document.getElementById('workProcessCameraBtn');
const workProcessAddMoreBtn = document.getElementById('workProcessAddMoreBtn');
const workProcessFileInput = document.getElementById('workProcessFileInput');
const workProcessCameraInterface = document.getElementById('workProcessCameraInterface');
const workProcessImagesContainer = document.getElementById('workProcessImagesContainer');
const workProcessImagesList = document.getElementById('workProcessImagesList');
const workProcessImageCount = document.getElementById('workProcessImageCount');
const workProcessImageModal = document.getElementById('workProcessImageModal');
const workProcessModalImage = document.getElementById('workProcessModalImage');
const workProcessImageClose = document.getElementById('workProcessImageClose');

// Scholarship CTA functionality
const scholarshipCtaBtn = document.getElementById('scholarshipCtaBtn');
const scholarshipProgress = document.getElementById('scholarshipProgress');

// Track scholarship button usage
let scholarshipClickedAt = 0; // Achievement count when button was last clicked

// Store work process images per question
let workProcessImages = new Map(); // questionId -> array of image data

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
            try { 
                await pullServerDataReplaceLocal(); 
                // Sync any local achievements that might not be on server
                await syncAchievementsToServer();
            } catch(_) {}
        }
        showNRoundView();
    })();

    // Refresh from server when window gains focus (throttled)
    let lastFocusTime = 0;
    window.addEventListener('focus', async () => {
        const now = Date.now();
        if (now - lastFocusTime < 5000) return; // Throttle to max once per 5 seconds
        lastFocusTime = now;
        
        if (window.currentAuthProvider === 'pin') {
            try { 
                await pullServerDataReplaceLocal(); 
                // Sync any local achievements that might not be on server after focus
                await syncAchievementsToServer();
            } catch(_) {}
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
    if (backFromSolution) backFromSolution.addEventListener('click', () => {
        // Return to the previous view based on where user came from
        if (previousView === 'achievement') {
            showAchievementView();
        } else {
            showNRoundView(); // Default fallback (includes 'nround' case)
        }
        // Reset previous view
        previousView = null;
    });
    if (deleteFromSolution) deleteFromSolution.addEventListener('click', handleDeleteCurrentSolution);
    
    if (deleteFromReview) {
        deleteFromReview.addEventListener('click', () => {
            cleanupCurrentImage();
            showNRoundView();
            showToast('이미지가 삭제되었습니다');
        });
    }

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
            const solutionAnswerInput = document.getElementById('solutionAnswerInput');
            const answerValue = document.getElementById('answerValue');
            const answerReveal = document.getElementById('answerReveal');
            
            if (solutionAnswerInput && answerValue) {
                const inputValue = solutionAnswerInput.value.trim();
                if (inputValue) {
                    // Set answer value
                    answerValue.textContent = inputValue;
                    
                    // Hide input elements
                    solutionAnswerInput.style.display = 'none';
                    solutionAnswerSubmit.style.display = 'none';
                    
                    const warningText = solutionAnswerInput.closest('.solution-notes').querySelector('p');
                    if (warningText) {
                        warningText.style.display = 'none';
                    }
                    
                    const inputContainer = solutionAnswerInput.parentElement;
                    if (inputContainer) {
                        inputContainer.style.display = 'none';
                    }
                    
                    // Show answer value and reveal button
                    answerValue.classList.remove('hidden');
                    answerValue.style.display = 'none'; // Start hidden, user clicks to reveal
                    if (answerReveal) {
                        answerReveal.style.display = 'inline-block';
                        answerReveal.textContent = '보기';
                    }
                    
                    // Save the answer
                    await persistSolutionAnswer();
                    showToast('답안이 저장되었습니다!');
                }
            }
        });
    }

    if (wrongBtn) {
        wrongBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Track wrong button click
            if (analytics) {
                analytics.track('Wrong Button Clicked', {
                    image_hash: currentImageHash || 'unknown',
                    timestamp: new Date().toISOString(),
                    user_id: window.currentUserId || 'anonymous',
                    action: 'categorize_wrong',
                    button_type: 'wrong',
                    context: 'image_review'
                });
            }
            
            categorizeQuestion('wrong', false);
        });
    }
    if (ambiguousBtn) {
        ambiguousBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Track ambiguous button click
            if (analytics) {
                analytics.track('Ambiguous Button Clicked', {
                    image_hash: currentImageHash || 'unknown',
                    timestamp: new Date().toISOString(),
                    user_id: window.currentUserId || 'anonymous',
                    action: 'categorize_ambiguous',
                    button_type: 'ambiguous',
                    context: 'image_review'
                });
            }
            
            categorizeQuestion('ambiguous', false);
        });
    }

    if (quizSubmit) quizSubmit.addEventListener('click', handleQuizSubmit);
    if (successLaterBtn) successLaterBtn.addEventListener('click', handleSuccessLater);
    if (successUnderstoodBtn) successUnderstoodBtn.addEventListener('click', handleSuccessUnderstood);
    if (successBackBtn) successBackBtn.addEventListener('click', handleSuccessBack);
    if (successCloseBtn) successCloseBtn.addEventListener('click', () => {
        closeSuccessModal();
        closeQuizModal();
        displayPopQuiz();
    });
    if (success5mBtn) success5mBtn.addEventListener('click', () => rescheduleFromSuccess(5 * 60 * 1000));
    if (success1hBtn) success1hBtn.addEventListener('click', () => rescheduleFromSuccess(60 * 60 * 1000));
    if (success1dBtn) success1dBtn.addEventListener('click', () => rescheduleFromSuccess(24 * 60 * 60 * 1000));
    if (failRetryBtn) failRetryBtn.addEventListener('click', () => rescheduleCurrentQuizWithRandomDelay());

    // Profile dropdown
    const logoutBtn = document.getElementById('logoutBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileLogoutBtn = document.getElementById('profileLogoutBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (profileDropdown) {
                const isVisible = !profileDropdown.classList.contains('hidden');
                
                if (isVisible) {
                    // Hide dropdown
                    profileDropdown.classList.add('hidden');
                    profileDropdown.style.display = 'none';
                    console.log('🔒 Profile dropdown hidden');
                } else {
                    // Show dropdown
                    profileDropdown.classList.remove('hidden');
                    profileDropdown.style.display = 'block';
                    console.log('🔓 Profile dropdown shown');
                }
            }
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (profileDropdown && logoutBtn) {
            const isClickInside = profileDropdown.contains(e.target) || logoutBtn.contains(e.target);
            if (!isClickInside && !profileDropdown.classList.contains('hidden')) {
                profileDropdown.classList.add('hidden');
                profileDropdown.style.display = 'none';
            }
        }
    });

    if (profileLogoutBtn) {
        profileLogoutBtn.addEventListener('click', async () => {
            if (profileDropdown) {
                profileDropdown.classList.add('hidden');
                profileDropdown.style.display = 'none';
            }
            await doLogout();
        });
    }

    // Tutorial modal event listeners
    const tutorialClose = document.getElementById('tutorialClose');
    const tutorialStart = document.getElementById('tutorialStart');
    const tutorialModal = document.getElementById('tutorialModal');
    
    if (tutorialClose) {
        tutorialClose.addEventListener('click', () => {
            hideTutorialModal();
        });
    }
    
    if (tutorialStart) {
        tutorialStart.addEventListener('click', () => {
            hideTutorialModal();
        });
    }
    
    // Close tutorial modal when clicking outside
    if (tutorialModal) {
        tutorialModal.addEventListener('click', (e) => {
            if (e.target === tutorialModal) {
                hideTutorialModal();
            }
        });
    }

    // Sort handler
    const nSortSelect = document.getElementById('nSortSelect');
    if (nSortSelect) {
        nSortSelect.addEventListener('change', displayNRoundQuestions);
    }

    // Work Process Images functionality
    if (workProcessCameraBtn) {
        workProcessCameraBtn.addEventListener('click', () => {
            workProcessFileInput.click();
        });
    }
    
    if (workProcessAddMoreBtn) {
        workProcessAddMoreBtn.addEventListener('click', () => {
            workProcessFileInput.click();
        });
    }
    
    if (workProcessFileInput) {
        workProcessFileInput.addEventListener('change', handleWorkProcessImageUpload);
    }
    
    if (workProcessImageClose) {
        workProcessImageClose.addEventListener('click', closeWorkProcessImageModal);
    }
    
    if (workProcessImageModal) {
        workProcessImageModal.addEventListener('click', (e) => {
            if (e.target === workProcessImageModal) {
                closeWorkProcessImageModal();
            }
        });
    }
    
    // Scholarship CTA button
    if (scholarshipCtaBtn) {
        scholarshipCtaBtn.addEventListener('click', () => {
            if (!scholarshipCtaBtn.disabled) {
                // Track that button was clicked at current achievement count
                scholarshipClickedAt = achievements.length;
                saveScholarshipState();
                
                // Redirect to scholarship form
                window.open('https://forms.gle/ox4kDqXxHDxxY3Sy9', '_blank');
                
                // Update button state immediately
                updateScholarshipButton();
                
                // Show confirmation toast
                showToast('🎓 장학금 신청 페이지로 이동했습니다!', 'success');
            }
        });
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
            window.currentNickname = user.nickname || user.name || null;
            
            // Identify user in Mixpanel with nickname as distinct_id
            if (window.currentNickname) {
                identifyUserInMixpanel(window.currentNickname, {
                    nickname: window.currentNickname,
                    user_id: user.id,
                    public_id: user.publicId,
                    provider: user.provider
                });
            }
            
            const seed = user.publicId || user.id || 'user';
            const url = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
            if (headerAvatar) headerAvatar.src = url;
            if (profileAvatar) profileAvatar.src = url;
            if (profilePublicId) profilePublicId.textContent = user.publicId || '-';
            if (profileNickname) profileNickname.textContent = user.nickname || user.name || '-';
        } else {
            window.currentUserId = null;
            window.currentAuthProvider = null;
            window.currentNickname = null;
        }
    } catch (_) {}
}

// Helper function to identify user in Mixpanel with retry logic
function identifyUserInMixpanel(nickname, properties = {}) {
    const attemptIdentify = (retries = 0) => {
        const maxRetries = 20;
        
        if (typeof window.mixpanel !== 'undefined' && 
            window.mixpanel && 
            typeof window.mixpanel.identify === 'function') {
            try {
                console.log('📊 Identifying user in Mixpanel:', nickname);
                window.mixpanel.identify(nickname);
                window.mixpanel.people.set({
                    '$name': nickname,
                    'nickname': nickname,
                    '$last_seen': new Date(),
                    ...properties
                });
                console.log('✅ Mixpanel identified successfully with nickname:', nickname);
                return true;
            } catch (error) {
                console.error('❌ Mixpanel identify failed:', error);
            }
        } else if (retries < maxRetries) {
            // Retry after a delay if Mixpanel is not ready yet
            console.log(`⏳ Mixpanel not ready, retrying (${retries + 1}/${maxRetries})...`);
            setTimeout(() => attemptIdentify(retries + 1), 200);
        } else {
            console.warn('⚠️ Mixpanel identification failed after max retries');
        }
        return false;
    };
    
    attemptIdentify();
}

function routeAuthOrApp() {
    const authView = document.getElementById('authView');
    // Only show auth if NO provider, or provider is explicitly not 'pin'
    // 'anon' provider should also show auth screen
    const showAuth = !window.currentAuthProvider || window.currentAuthProvider === 'anon' || window.currentAuthProvider !== 'pin';
    
    console.log('🔀 Routing:', showAuth ? 'Auth Screen' : 'Main App', { 
        authProvider: window.currentAuthProvider,
        userId: window.currentUserId 
    });
    
    if (authView) {
        if (showAuth) {
            authView.classList.remove('hidden');
            authView.style.display = 'flex';
        } else {
            authView.classList.add('hidden');
            authView.style.display = 'none';
        }
    }
    
    if (roundNView) {
        if (showAuth) {
            roundNView.classList.add('hidden');
            roundNView.style.display = 'none';
        } else {
            roundNView.classList.remove('hidden');
            roundNView.style.display = 'block';
        }
    }
    
    if (settingsView) {
        settingsView.classList.add('hidden');
        settingsView.style.display = 'none';
    }
    if (achievementView) {
        achievementView.classList.add('hidden');
        achievementView.style.display = 'none';
    }
    if (imageReviewView) {
        imageReviewView.classList.add('hidden');
        imageReviewView.style.display = 'none';
    }
    if (solutionView) {
        solutionView.classList.add('hidden');
        solutionView.style.display = 'none';
    }
}

function initAuthPage() {
    const authView = document.getElementById('authView');
    const btn = document.getElementById('authActionBtn');
    const nn = document.getElementById('authNickname');
    const err = document.getElementById('authError');

    if (!authView || !btn || !nn) return;

    async function submitAuth() {
        let nickname = (nn.value || '').trim();
        
        console.log('🔐 Attempting auth with nickname:', nickname);
        
        if (!nickname) {
            if (err) { 
                err.textContent = '닉네임을 입력해 주세요.'; 
                err.style.display = 'block'; 
            }
            return;
        }
        
        try {
            console.log('📝 Attempting registration (nickname only)...');
            
            // Generate a strong random numeric PIN automatically (10 digits minimum)
            const autoPin = Math.floor(1000000000 + Math.random() * 9000000000).toString(); // 10-digit number
            console.log('🔑 Generated auto PIN length:', autoPin.length);
            
            let res = await fetch('/api/auth/register-pin', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                credentials: 'include', 
                body: JSON.stringify({ nickname, pin: autoPin }) 
            });
            
            console.log('📝 Registration response:', res.status, res.statusText);
            
            // If registration succeeds, we're done!
            if (res.ok) {
                console.log('✅ Registration successful!');
            }
            // If nickname exists, just create a unique one automatically
            else if (res.status === 400 || res.status === 409) {
                console.log('🔄 Nickname exists, creating unique version...');
                const uniqueNickname = `${nickname}_${Date.now().toString().slice(-6)}`;
                console.log('🆕 Attempting registration with:', uniqueNickname);
                
                res = await fetch('/api/auth/register-pin', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    credentials: 'include', 
                    body: JSON.stringify({ nickname: uniqueNickname, pin: autoPin }) 
                });
                
                console.log('🆕 Unique registration response:', res.status, res.statusText);
                
                if (res.ok) {
                    nickname = uniqueNickname;
                    if (err) {
                        err.textContent = `닉네임이 사용중이어서 "${uniqueNickname}"로 등록되었습니다.`;
                        err.style.display = 'block';
                        err.style.color = '#00C851'; // Green color for success message
                        setTimeout(() => {
                            if (err) err.style.display = 'none';
                        }, 3000);
                    }
                }
            }
            
            if (!res.ok) {
                console.error('❌ Auth failed:', res.status);
                const errorData = await res.json().catch(() => ({}));
                console.error('❌ Error details:', errorData);
                
                if (err) {
                    err.style.color = '#ff1744'; // Red color for error
                    err.textContent = errorData.error || '로그인에 실패했습니다. 다른 닉네임을 시도해보세요.';
                    err.style.display = 'block';
                }
                return;
            }
            
            console.log('✅ Auth successful with nickname:', nickname);
            if (err) err.style.display = 'none';
            await refreshAuthUi();
            routeAuthOrApp();
            reloadUserState();
            if (window.currentAuthProvider === 'pin') {
                try { await pullServerDataReplaceLocal(); } catch (_) {}
            }
            showNRoundView();
        } catch (e) {
            console.error('❌ Auth exception:', e);
            if (err) { 
                err.textContent = '요청에 실패했습니다.'; 
                err.style.display = 'block'; 
            }
        }
    }

    btn.addEventListener('click', submitAuth);
}

async function doLogout() {
    console.log('🚪 Logging out...');
    
    try { 
        const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        console.log('✅ Logout API response:', response.status);
    } catch (error) {
        console.error('❌ Logout API error:', error);
    }
    
    // Clear all window variables
    window.currentUserId = null;
    window.currentAuthProvider = null;
    window.currentPublicId = null;
    window.currentNickname = null;
    
    // Clear localStorage
    localStorage.removeItem('reviewNoteQuestions');
    localStorage.removeItem('reviewNotePopQuizItems');
    localStorage.removeItem('reviewNoteAchievements');
    localStorage.removeItem('reviewNoteAnswerByHash');
    localStorage.removeItem(storageKey('hasSeenTutorial'));
    
    console.log('🔄 Refreshing auth UI...');
    await refreshAuthUi();
    
    console.log('🔄 Reloading user state...');
    reloadUserState();
    
    console.log('🔄 Routing to auth screen...');
    routeAuthOrApp();
    
    // Force page reload to ensure clean state
    console.log('🔄 Reloading page for clean state...');
    setTimeout(() => {
        window.location.reload();
    }, 500);
    
    console.log('✅ Logout complete');
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
    loadWorkProcessImages(); // Load work process images
    loadScholarshipState(); // Load scholarship button state
    updatePopQuizBadge();
    updateScholarshipButton(); // Update scholarship button on load
    if (roundNView && roundNView.style.display !== 'none') displayNRoundQuestions();
    if (achievementView && achievementView.style.display !== 'none') displayAchievements();
}

// View navigation
function showNRoundView() {
    if (roundNView) {
        roundNView.classList.remove('hidden');
        roundNView.style.display = 'block';
    }
    if (settingsView) {
        settingsView.style.display = 'none';
        settingsView.classList.add('hidden');
    }
    if (achievementView) {
        achievementView.style.display = 'none';
        achievementView.classList.add('hidden');
    }
    if (imageReviewView) {
        imageReviewView.style.display = 'none';
        imageReviewView.classList.add('hidden');
    }
    if (solutionView) {
        solutionView.style.display = 'none';
        solutionView.classList.add('hidden');
    }

    if (navNRound) navNRound.classList.add('active');
    if (navSettings) navSettings.classList.remove('active');
    if (navAchievement) navAchievement.classList.remove('active');

    displayNRoundQuestions();
}

function showSettingsView() {
    if (roundNView) {
        roundNView.style.display = 'none';
        roundNView.classList.add('hidden');
    }
    if (settingsView) {
        settingsView.classList.remove('hidden');
        settingsView.style.display = 'block';
    }
    if (achievementView) {
        achievementView.style.display = 'none';
        achievementView.classList.add('hidden');
    }
    if (imageReviewView) {
        imageReviewView.style.display = 'none';
        imageReviewView.classList.add('hidden');
    }
    if (solutionView) {
        solutionView.style.display = 'none';
        solutionView.classList.add('hidden');
    }

    if (navNRound) navNRound.classList.remove('active');
    if (navSettings) navSettings.classList.add('active');
    if (navAchievement) navAchievement.classList.remove('active');

    displayPopQuiz();
}

function showAchievementView() {
    if (roundNView) {
        roundNView.style.display = 'none';
        roundNView.classList.add('hidden');
    }
    if (settingsView) {
        settingsView.style.display = 'none';
        settingsView.classList.add('hidden');
    }
    if (achievementView) {
        achievementView.classList.remove('hidden');
        achievementView.style.display = 'block';
    }
    if (imageReviewView) {
        imageReviewView.style.display = 'none';
        imageReviewView.classList.add('hidden');
    }
    if (solutionView) {
        solutionView.style.display = 'none';
        solutionView.classList.add('hidden');
    }

    if (navNRound) navNRound.classList.remove('active');
    if (navSettings) navSettings.classList.remove('active');
    if (navAchievement) navAchievement.classList.add('active');

    displayAchievements();
}

function showImageReviewView() {
    if (roundNView) {
        roundNView.style.display = 'none';
        roundNView.classList.add('hidden');
    }
    if (settingsView) {
        settingsView.style.display = 'none';
        settingsView.classList.add('hidden');
    }
    if (achievementView) {
        achievementView.style.display = 'none';
        achievementView.classList.add('hidden');
    }
    if (imageReviewView) {
        imageReviewView.classList.remove('hidden');
        imageReviewView.style.display = 'flex';
    }
    if (solutionView) {
        solutionView.style.display = 'none';
        solutionView.classList.add('hidden');
    }
}

// FIXED: Image handling with proper async/await
async function handleImageCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentImageBlob = file;
    currentImageUrl = createObjectURL(file);
    
    // FIXED: Properly await hash generation
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = (e) => resolve(e.target.result);
            fr.onerror = reject;
            fr.readAsDataURL(file);
        });
        
        currentImageHash = await computeSHA256HexFromDataUrl(dataUrl);
        console.log('DEBUG: Hash computed on capture:', currentImageHash);
        
        // Track Image Upload event
        if (analytics) {
            analytics.track('Image Upload', {
                image_hash: currentImageHash,
                file_size: file.size,
                file_type: file.type,
                file_name: file.name || 'unknown'
            });
        }
        
    } catch (error) {
        console.warn('Hash generation failed:', error);
        currentImageHash = null;
    }

    reviewImage.src = currentImageUrl;
    const reviewAnswerInput = document.getElementById('reviewAnswerInput');
    if (reviewAnswerInput) reviewAnswerInput.value = '';

    showImageReviewView();
    cameraInput.value = '';
}

// FIXED: Improved categorizeQuestion with better hash handling
async function categorizeQuestion(category, checkAnswerReq = true) {
    // Check answer requirement for ambiguous category
    if (category === 'ambiguous' && checkAnswerReq) {
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
                    categorizeQuestion(category, false);
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
        let finalImageHash = currentImageHash; // Use pre-computed hash
        
        console.log('DEBUG: Image processing', {
            currentImageHash,
            dataUrlType: typeof dataUrl,
            startsWithData: dataUrl.startsWith('data:'),
            finalImageHash,
        });
        
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
                    dataUrl = j.url;
                    // Use server-provided hash if available, otherwise keep original
                    if (j.hash) {
                        finalImageHash = j.hash;
                        console.log('DEBUG: Server provided hash:', j.hash);
                    }
                }
            }
        } catch (err) {
            try { dataUrl = await compressDataUrl(dataUrl, 480, 0.5); } catch (_) {}
        }

        // Ensure we have a hash - compute if needed
        if (!finalImageHash) {
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                finalImageHash = await computeSHA256HexFromDataUrl(dataUrl);
            } else {
                finalImageHash = await canonicalHashFromUrl(dataUrl);
            }
            console.log('DEBUG: Computed final hash:', finalImageHash);
        }
        
        const reviewAnswerInput = document.getElementById('reviewAnswerInput');
        const initialAnswer = reviewAnswerInput ? (reviewAnswerInput.value || '') : '';
        
        console.log('DEBUG: Initial answer:', initialAnswer.trim());
        
        const newQuestion = {
            id: Date.now(),
            questionNumber: '문제 ' + (questions.length + 1),
            publisher: '출처모름',
            questionText: '이미지 문제',
            imageUrl: dataUrl,
            imageHash: finalImageHash,
            category: category,
            round: 0,
            timestamp: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            userAnswer: initialAnswer
        };

        // FIXED: Save answer to hash storage BEFORE adding to questions array
        if (finalImageHash && initialAnswer.trim()) {
            await saveAnswerForHash(finalImageHash, initialAnswer);
            console.log('DEBUG: Saved answer to hash storage:', finalImageHash, initialAnswer.trim());
        }

        questions.unshift(newQuestion);
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
                        imageHash: finalImageHash, 
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
        
        // Show tutorial modal if this is the first card
        checkAndShowTutorial();
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

// Tutorial Modal Logic
function checkAndShowTutorial() {
    // Check if user has seen the tutorial before (user-specific)
    const hasSeenTutorial = localStorage.getItem(storageKey('hasSeenTutorial'));
    
    // Only show if this is their first card AND they haven't seen the tutorial
    if (!hasSeenTutorial && questions.length === 1) {
        console.log('📚 First card created! Showing tutorial modal...');
        // Small delay to allow the view to settle after showing the card
        setTimeout(() => {
            showTutorialModal();
        }, 500);
    }
}

function showTutorialModal() {
    const tutorialModal = document.getElementById('tutorialModal');
    if (tutorialModal) {
        tutorialModal.classList.remove('hidden');
        tutorialModal.style.display = 'flex';
        
        // Mark tutorial as seen (user-specific)
        localStorage.setItem(storageKey('hasSeenTutorial'), 'true');
        console.log('✅ Tutorial modal shown');
    }
}

function hideTutorialModal() {
    const tutorialModal = document.getElementById('tutorialModal');
    if (tutorialModal) {
        tutorialModal.classList.add('hidden');
        tutorialModal.style.display = 'none';
        console.log('❌ Tutorial modal hidden');
    }
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

// FIXED: Only return answer if explicitly set for THIS question
async function getAnswerForQuestion(question) {
    console.log('DEBUG: Getting answer for question', {
        questionId: question.id,
        userAnswer: question.userAnswer
    });

    // ONLY check userAnswer - this is the answer explicitly entered for THIS question
    // DO NOT use answerByHash as it causes cross-contamination between questions
    if (question.userAnswer && question.userAnswer.trim()) {
        return question.userAnswer.trim();
    }
    
    // No answer found - return empty string so input field is shown
    return '';
}

// FIXED: Only check if THIS question has an answer
async function hasAnswerForQuestion(question) {
    // ONLY check userAnswer - don't use answerByHash cross-contamination
    return question.userAnswer && question.userAnswer.trim().length > 0;
}

// FIXED: Move question to pop quiz with answer
async function moveQuestionToPopQuiz(question) {
    // Get the answer before moving
    const answer = await getAnswerForQuestion(question);
    const hash = question.imageHash || await ensureQuestionImageHash(question);
    
    // Generate random delay between 15 minutes and 3 hours
    const minDelay = 15 * 60 * 1000; // 15 minutes
    const maxDelay = 3 * 60 * 60 * 1000; // 3 hours
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;    
    const entry = {
        imageUrl: question.imageUrl,
        imageHash: hash,
        questionId: String(question.dbId || question.id),
        originalClientId: String(question.id), // Preserve original client ID for work process images
        questionNumber: question.questionNumber,
        category: question.category,
        lastAccessed: question.lastAccessed || question.timestamp,
        reappearAt: new Date(Date.now() + randomDelay).toISOString(),
        round: question.round || 0,
        userAnswer: answer // Store answer in popQuizItem
    };
    
    popQuizItems.push(entry);
    savePopQuizItems();
    
    // Enhanced microinteraction feedback
    const questionCard = document.querySelector(`[data-id="${question.id}"]`);
    
    // 1. Animate the card before removal
    if (questionCard) {
        questionCard.style.transform = 'translateX(100%) scale(0.9)';
        questionCard.style.opacity = '0.7';
        questionCard.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    }
    
    // 2. Update badge with pronounced animation
    updatePopQuizBadge();
    
    // 3. Animate the pop quiz badge
    if (quizBadge && quizBadge.style.display !== 'none') {
        quizBadge.classList.add('pop-quiz-added');
        setTimeout(() => {
            quizBadge.classList.remove('pop-quiz-added');
        }, 600);
    }
    
    // 3.5. Highlight the navigation area
    const navSettings = document.getElementById('navSettings');
    if (navSettings) {
        navSettings.classList.add('pop-quiz-highlight');
        setTimeout(() => {
            navSettings.classList.remove('pop-quiz-highlight');
        }, 800);
    }
    
    // 4. Show enhanced toast with pop quiz branding
    showToast('📚 팝퀴즈에 추가되었습니다!', 'success');
    
    // 5. Remove from questions after animation
    setTimeout(() => {
        const idx = questions.findIndex(q => String(q.id) === String(question.id));
        if (idx !== -1) {
            // Clean up work process images
            cleanupWorkProcessImages(String(question.id));
            
            questions.splice(idx, 1);
            saveQuestions();
            displayNRoundQuestions();
        }
    }, 300);
}

// FIXED: Swipe handler
function setupNRoundSwipe(item) {
    new SwipeHandler(item, {
        threshold: 110,
        onLeft: async () => {
            const qid = item.dataset.id;
            const q = questions.find(q => String(q.id) === String(qid));
            if (q) {
                const oldRound = q.round || 0;
                q.round = (q.round || 0) + 1;
                saveQuestions();
                
                // Track Round Count event
                if (analytics) {
                    analytics.track('Round Count', {
                        question_id: qid,
                        previous_round: oldRound,
                        new_round: q.round,
                        question_number: q.questionNumber || 'unknown',
                        category: q.category || 'unknown'
                    });
                }
                
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
            console.log('🔄 Right swipe detected for question:', qid, q);
            
            if (q) {
                // Check for answer properly
                const hasAnswer = await hasAnswerForQuestion(q);
                console.log('📝 Has answer?', hasAnswer);
                
                if (!hasAnswer) {
                    // Show answer required modal
                    const modal = document.getElementById('answerReqModal');
                    const input = document.getElementById('answerReqInput');
                    const submit = document.getElementById('answerReqSubmit');
                    const closeBtn = document.getElementById('answerReqClose');
                    
                    if (modal && input && submit) {
                        modal.style.display = 'flex';
                        modal.classList.remove('hidden');
                        input.value = '';
                        input.focus();
                        
                        const cleanup = () => {
                            modal.style.display = 'none';
                            modal.classList.add('hidden');
                            submit.onclick = null;
                            if (closeBtn) closeBtn.onclick = null;
                        };
                        
                        if (closeBtn) closeBtn.onclick = cleanup;
                        
                        submit.onclick = async () => {
                            const answer = input.value.trim();
                            if (!answer) { 
                                input.focus(); 
                                return; 
                            }
                            
                            // Save answer to question and hash storage
                            q.userAnswer = answer;
                            const hash = q.imageHash || await ensureQuestionImageHash(q);
                            if (hash) {
                                await saveAnswerForHash(hash, answer);
                            }
                            saveQuestions();
                            
                            // Move to pop quiz with answer
                            await moveQuestionToPopQuiz(q);
                            cleanup();
                        };
                    }
                    return;
                }
                
                // Has answer, move to pop quiz
                console.log('✅ Moving to pop quiz...');
                await moveQuestionToPopQuiz(q);
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

    // Attach click handlers with visual feedback
    popQuizContainer.querySelectorAll('.pop-quiz-card').forEach(card => {
        const index = parseInt(card.getAttribute('data-index'));
        
        // Add cursor pointer style
        card.style.cursor = 'pointer';
        
        // Add click event
        card.addEventListener('click', () => {
            console.log('📚 Pop quiz card clicked, opening modal for index:', index);
            openQuizModal(index);
        });
        
        // Add hover effect
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'scale(1.02)';
            card.style.transition = 'transform 0.2s ease';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'scale(1)';
        });
    });
}

function displayAchievements() {
    const list = document.getElementById('achievementList');
    const empty = document.getElementById('achievementEmpty');
    const status = document.getElementById('achievementStatus');
    if (!list || !empty) return;

    // Update reward level display
    updateRewardLevelDisplay();

    // Show scholarship CTA button if there are achievements
    if (status && achievements && achievements.length > 0) {
        status.style.display = 'block';
        // The scholarship button is already in the HTML, just make sure it's visible
        updateScholarshipButton();
    } else if (status) {
        status.style.display = 'none';
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
    
    // Add click handlers for achievement items
    list.querySelectorAll('.success-item').forEach(item => {
        const achievementId = item.getAttribute('data-id');
        const achievement = achievements.find(a => String(a.id) === String(achievementId));
        if (achievement) {
            item.addEventListener('click', () => {
                // Navigate to solution view for achievement item
                showAchievementSolutionView(achievement);
            });
        }
    });
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

// FIXED: Solution view with better answer loading
function showSolutionView(questionId) {
    previousView = 'nround'; // Track that we came from N-Round view
    
    const question = questions.find(q => String(q.id) === String(questionId));
    if (!question) return;

    question.lastAccessed = new Date().toISOString();
    saveQuestions();

    document.getElementById('solutionQuestionNumber').textContent = question.questionNumber;
    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = question.category === 'ambiguous' ? '애매했던 문제' : '틀렸던 문제';
    solutionCategory.className = `solution-category ${question.category}`;
    
    // Remove any view indicators for regular questions
    const solutionHeader = document.querySelector('.solution-header');
    if (solutionHeader) {
        const existingIndicator = solutionHeader.querySelector('.view-indicator');
        if (existingIndicator) existingIndicator.remove();
    }
    
    document.getElementById('solutionImage').src = question.imageUrl;

    solutionView.dataset.currentId = String(question.id);
    solutionView.dataset.isAchievement = 'false';

    if (solutionAnswerInput) {
        // Load answer comprehensively
        (async () => {
            const answer = await getAnswerForQuestion(question);
            
            console.log('Loading answer for question:', answer);
            
            solutionAnswerInput.value = answer || '';
            
            const valEl = document.getElementById('answerValue');
            const revealBtn = document.getElementById('answerReveal');
            const solutionAnswerSubmit = document.getElementById('solutionAnswerSubmit');
            const warningText = solutionAnswerInput.closest('.solution-notes').querySelector('p');
            const inputContainer = solutionAnswerInput.parentElement;
            
            if (valEl) {
                valEl.textContent = answer || '정답을 알려주세요';
                
                // Show/hide input elements based on whether answer exists
                const hasAnswer = answer && answer.trim().length > 0;
                
                if (hasAnswer) {
                    // Hide input elements
                    solutionAnswerInput.style.display = 'none';
                    if (solutionAnswerSubmit) solutionAnswerSubmit.style.display = 'none';
                    if (warningText) warningText.style.display = 'none';
                    if (inputContainer) inputContainer.style.display = 'none';
                    
                    // Show answer value (hidden by default)
                    valEl.classList.remove('hidden');
                    valEl.style.display = 'none'; // Start hidden, user clicks "보기" to reveal
                    if (revealBtn) {
                        revealBtn.style.display = 'inline-block';
                        revealBtn.textContent = '보기';
                    }
                } else {
                    // Show input elements
                    solutionAnswerInput.style.display = 'block';
                    if (solutionAnswerSubmit) solutionAnswerSubmit.style.display = 'block';
                    if (warningText) warningText.style.display = 'block';
                    if (inputContainer) inputContainer.style.display = 'flex';
                    
                    // Hide answer value and reveal button
                    valEl.classList.add('hidden');
                    if (revealBtn) revealBtn.style.display = 'none';
                }
            }
        })();
    }

    setupAnswerReveal();
    solutionView.scrollTop = 0;

    // Load work process images for this question
    loadWorkProcessImagesForQuestion(questionId);

    // Properly hide all other views and show solution view
    if (roundNView) {
        roundNView.classList.add('hidden');
        roundNView.style.display = 'none';
    }
    if (settingsView) {
        settingsView.classList.add('hidden');
        settingsView.style.display = 'none';
    }
    if (achievementView) {
        achievementView.classList.add('hidden');
        achievementView.style.display = 'none';
    }
    if (imageReviewView) {
        imageReviewView.classList.add('hidden');
        imageReviewView.style.display = 'none';
    }
    if (solutionView) {
        solutionView.classList.remove('hidden');
        solutionView.style.display = 'block';
    }
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

// FIXED: Enhanced persistSolutionAnswer with immediate sync
async function persistSolutionAnswer() {
    const questionId = parseInt(solutionView.dataset.currentId);
    if (!questionId) return;
    
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    const answer = (solutionAnswerInput && solutionAnswerInput.value) || '';
    
    // Save to question object immediately
    question.userAnswer = answer;
    
    // Ensure hash exists
    const hash = question.imageHash || await ensureQuestionImageHash(question);
    
    // Generate random delay between 15 minutes and 3 hours
    const minDelay = 15 * 60 * 1000; // 15 minutes
    const maxDelay = 3 * 60 * 60 * 1000; // 3 hours
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;    
    // Save to hash storage immediately
    if (hash && answer.trim()) {
        answerByHash[hash] = answer.trim();
        saveAnswerByHash();
        
        // Also save to server asynchronously
        try {
            await saveAnswerForHash(hash, answer.trim());
        } catch (_) {}
    }
    
    // Save questions last
    saveQuestions();
}

async function handleDeleteCurrentSolution() {
    const questionId = solutionView.dataset.currentId;
    const questionIndex = questions.findIndex(q => String(q.id) === String(questionId));

    if (questionIndex !== -1) {
        // Clean up work process images
        cleanupWorkProcessImages(questionId);
        
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
    if (!quizItem) {
        console.error('❌ Quiz item not found for index:', index);
        return;
    }
    
    console.log('✅ Opening quiz modal for item:', quizItem);
    
    if (!quizModal) {
        console.error('❌ quizModal element not found');
        return;
    }
    
    // Remove hidden class and show modal
    quizModal.classList.remove('hidden');
    quizModal.style.display = 'flex';
    
    if (quizImage) quizImage.src = quizItem.imageUrl;
    quizModal.dataset.index = String(index);
    if (quizAnswer) {
        quizAnswer.value = '';
        quizAnswer.focus();
    }
    
    console.log('✅ Quiz modal opened successfully');
}

function closeQuizModal() {
    if (!quizModal) return;
    quizModal.classList.add('hidden');
    quizModal.style.display = 'none';
    if (quizResult) quizResult.style.display = 'none';
    if (quizAnswer) quizAnswer.value = '';
    delete quizModal.dataset.index;
}

// FIXED: Quiz submit to properly check answers
async function handleQuizSubmit() {
    const indexStr = quizModal.dataset.index;
    if (!indexStr) return;
    const index = parseInt(indexStr);
    const quizItem = popQuizItems[index];
    if (!quizItem) return;

    const userAnswer = (quizAnswer.value || '').trim();
    
    // Get correct answer from multiple sources
    let correctAnswer = '';
    
    // 1. Check popQuizItem's stored answer
    if (quizItem.userAnswer) {
        correctAnswer = quizItem.userAnswer.trim();
    }
    // 2. Check answerByHash
    else if (quizItem.imageHash && answerByHash[quizItem.imageHash]) {
        correctAnswer = answerByHash[quizItem.imageHash].trim();
    }
    // 3. Try to fetch from server/storage
    else if (quizItem.imageHash) {
        correctAnswer = await getAnswerForHash(quizItem.imageHash);
    }

    const isCorrect = normalizeAnswer(userAnswer).length > 0 &&
                      normalizeAnswer(correctAnswer).length > 0 &&
                      (normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer));

    const oldQuizCount = quizItem.quizCount || 0;
    quizItem.quizCount = (quizItem.quizCount || 0) + 1;
    savePopQuizItems();
    
    // Track Quiz Count event
    if (analytics) {
        analytics.track('Quiz Count', {
            question_id: quizItem.questionId || quizItem.originalClientId || 'unknown',
            previous_quiz_count: oldQuizCount,
            new_quiz_count: quizItem.quizCount,
            question_number: quizItem.questionNumber || 'unknown',
            category: quizItem.category || 'unknown'
        });
    }

    // Track Pop Quiz Result events
    if (analytics) {
        if (isCorrect) {
            analytics.track('Pop Quiz Correct', {
                question_id: quizItem.questionId || quizItem.originalClientId || 'unknown',
                question_number: quizItem.questionNumber || 'unknown',
                category: quizItem.category || 'unknown',
                quiz_count: quizItem.quizCount,
                user_answer: userAnswer,
                correct_answer: correctAnswer
            });
        } else {
            analytics.track('Pop Quiz Wrong', {
                question_id: quizItem.questionId || quizItem.originalClientId || 'unknown',
                question_number: quizItem.questionNumber || 'unknown',
                category: quizItem.category || 'unknown',
                quiz_count: quizItem.quizCount,
                user_answer: userAnswer,
                correct_answer: correctAnswer
            });
        }
    }

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
    if (successModal) {
        // Reset to main actions view
        const main = document.getElementById('successMainActions');
        const opts = document.getElementById('successDelayOptions');
        if (main) main.style.display = 'flex';
        if (opts) opts.style.display = 'none';
        
        successModal.classList.remove('hidden');
        successModal.style.display = 'flex';
    }
}

function closeSuccessModal() {
    if (successModal) {
        // Reset to main actions view when closing
        const main = document.getElementById('successMainActions');
        const opts = document.getElementById('successDelayOptions');
        if (main) main.style.display = 'flex';
        if (opts) opts.style.display = 'none';
        
        successModal.classList.add('hidden');
        successModal.style.display = 'none';
    }
}

function openFailModal() {
    if (failModal) {
        failModal.classList.remove('hidden');
        failModal.style.display = 'flex';
    }
}

function closeFailModal() {
    if (failModal) {
        failModal.classList.add('hidden');
        failModal.style.display = 'none';
    }
}

function handleSuccessLater() {
    // Instead of showing delay options, directly reschedule with default delay and navigate
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number' && popQuizItems[idx]) {
        // Default delay: 1 day
        popQuizItems[idx].reappearAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
    }
    
    // Close modals and navigate to pop quiz view
    closeSuccessModal();
    closeQuizModal();
    showSettingsView();
    displayPopQuiz();
}

function handleSuccessBack() {
    const main = document.getElementById('successMainActions');
    const opts = document.getElementById('successDelayOptions');
    if (main) main.style.display = 'flex';
    if (opts) opts.style.display = 'none';
}

function handleSuccessUnderstood() {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number') {
        const removed = popQuizItems.splice(idx, 1)[0];
        if (removed) {
            removed.lastAccessed = new Date().toISOString();
            // Create achievement with proper ID and preserve original question ID
            const achievement = {
                ...removed,
                id: removed.questionId, // Use original question ID as achievement ID
                originalQuestionId: removed.questionId, // Preserve for work process images
                originalClientId: removed.originalClientId, // Preserve original client ID for work process images
                achievedAt: new Date().toISOString()
            };
            achievements.unshift(achievement);
            saveAchievements();
            
            // CRITICAL: Send achievement to server to ensure persistence
            if (window.currentAuthProvider === 'pin') {
                serverQueue.add(async () => {
                    try {
                        const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                        await fetch(base + '/api/achievements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ questionId: achievement.questionId })
                        });
                        console.log(`Achievement ${achievement.questionId} sent to server`);
                    } catch (e) {
                        console.warn('Failed to save achievement to server:', e.message);
                    }
                });
            }
            
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
    
    // Refresh pop quiz display to remove the card immediately
    if (settingsView && settingsView.style.display !== 'none') {
        displayPopQuiz();
    }
}

function rescheduleFromSuccess(delayMs) {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number' && popQuizItems[idx]) {
        popQuizItems[idx].reappearAt = new Date(Date.now() + delayMs).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeSuccessModal();
        closeQuizModal();
        
        // Navigate to pop quiz view
        showSettingsView();
        displayPopQuiz();
    } else {
        closeSuccessModal();
        closeQuizModal();
    }
}

function rescheduleCurrentQuiz(delayMs) {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    if (typeof idx === 'number' && popQuizItems[idx]) {
        popQuizItems[idx].reappearAt = new Date(Date.now() + delayMs).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeFailModal();
        closeQuizModal();
        if (settingsView.style.display !== 'none') displayPopQuiz();
    } else {
        closeFailModal();
    }
}

// Reschedule current quiz with random delay (5 minutes to 24 hours)
function rescheduleCurrentQuizWithRandomDelay() {
    // Generate random delay between 5 minutes (300,000ms) and 24 hours (86,400,000ms)
    const minDelay = 2 * 60 * 60 * 1000; // 2 hours
    const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    rescheduleCurrentQuiz(randomDelay);
}

// Storage functions
function saveQuestions() {
    localStorage.setItem(storageKey('reviewNoteQuestions'), JSON.stringify(questions));

    // Note: Individual questions are synced when created via /api/questions
    // No bulk sync endpoint is available
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

// Sync local achievements to server (for achievements created offline)
async function syncAchievementsToServer() {
    if (window.currentAuthProvider !== 'pin' || achievements.length === 0) return;
    
    try {
        const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
        
        // Get server achievements to compare
        const serverRes = await fetch(base + '/api/achievements', { credentials: 'include' });
        let serverAchievements = [];
        if (serverRes.ok) {
            const j = await serverRes.json();
            serverAchievements = (j && j.items) || [];
        }
        
        const serverAchievementIds = new Set(serverAchievements.map(a => a.questionId));
        
        // Send local achievements that don't exist on server
        for (const achievement of achievements) {
            if (!serverAchievementIds.has(achievement.questionId)) {
                serverQueue.add(async () => {
                    try {
                        await fetch(base + '/api/achievements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ questionId: achievement.questionId })
                        });
                        console.log(`Synced local achievement ${achievement.questionId} to server`);
                    } catch (e) {
                        console.warn('Failed to sync achievement to server:', e.message);
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Failed to sync achievements to server:', e.message);
    }
}

// FIXED: Enhanced answer storage with explicit flushes
function saveAnswerByHash() {
    try { 
        localStorage.setItem(storageKey('answerByHash'), JSON.stringify(answerByHash)); 
        // Force a read to ensure it's committed
        localStorage.getItem(storageKey('answerByHash'));
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
    return s.toLowerCase(); // Make case-insensitive
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
    updateScholarshipButton(); // Add scholarship button update
}

// Update scholarship button based on achievement count
function updateScholarshipButton() {
    if (!scholarshipCtaBtn || !scholarshipProgress) return;
    
    const achievementCount = achievements.length;
    const requiredForReactivation = scholarshipClickedAt + 5;
    const isEligible = achievementCount >= Math.max(5, requiredForReactivation);
    
    // Calculate progress based on whether button was clicked before
    let progressText;
    if (scholarshipClickedAt === 0) {
        // First time - need 5 total achievements
        progressText = `(${achievementCount}/5 달성완료)`;
    } else {
        // After clicking - need 5 additional achievements
        const additionalNeeded = Math.max(0, requiredForReactivation - achievementCount);
        const additionalAchieved = Math.max(0, achievementCount - scholarshipClickedAt);
        progressText = `(${additionalAchieved}/5 추가 달성완료)`;
    }
    
    scholarshipProgress.textContent = progressText;
    
    // Update button state
    if (isEligible) {
        scholarshipCtaBtn.disabled = false;
        scholarshipCtaBtn.classList.add('active');
        if (scholarshipClickedAt === 0) {
            scholarshipCtaBtn.title = '5개 문제를 달성했습니다! 클릭하여 장학금을 신청하세요.';
        } else {
            scholarshipCtaBtn.title = '5개 추가 문제를 달성했습니다! 다시 장학금을 신청할 수 있습니다.';
        }
    } else {
        scholarshipCtaBtn.disabled = true;
        scholarshipCtaBtn.classList.remove('active');
        if (scholarshipClickedAt === 0) {
            const needed = 5 - achievementCount;
            scholarshipCtaBtn.title = `${needed}개 더 달성하면 장학금을 신청할 수 있습니다.`;
        } else {
            const additionalNeeded = requiredForReactivation - achievementCount;
            scholarshipCtaBtn.title = `${additionalNeeded}개 더 달성하면 장학금을 다시 신청할 수 있습니다.`;
        }
    }
}

function updatePopQuizStatusPanel() {
    const waitingEl = document.getElementById('popQuizWaitingCountStat');
    const avgEl = document.getElementById('popQuizAvgRoundStat');
    if (!waitingEl || !avgEl) return;

    const now = Date.now();
    const ready = (popQuizItems || []).filter(item => isPopQuizReady(item, now));
    const waiting = (popQuizItems || []).filter(item => !isPopQuizReady(item, now));
    
    // Show count of waiting (queued) pop quizzes, not ready ones
    waitingEl.textContent = `${waiting.length}개`;

    if (ready.length === 0) {
        avgEl.textContent = '0.00회독';
    } else {
    const sumRounds = ready.reduce((sum, item) => sum + (item.round || 0), 0);
    const avg = sumRounds / ready.length;
    avgEl.textContent = `${avg.toFixed(2)}회독`;
    }
}

function updateRewardLevelDisplay() {
    // Check if reward-levels.js is loaded
    if (typeof getProgressToNextLevel === 'undefined') {
        console.warn('Reward levels not loaded yet');
        return;
    }
    
    const achievementCount = achievements.length;
    console.log('🏆 Updating reward level display with', achievementCount, 'achievements');
    const levelData = getProgressToNextLevel(achievementCount);
    console.log('📊 Level data:', levelData);
    
    const badgeEl = document.getElementById('currentLevelBadge');
    const titleEl = document.getElementById('currentLevelTitle');
    const progressFillEl = document.getElementById('levelProgressFill');
    const currentTextEl = document.getElementById('levelCurrentText');
    const nextTextEl = document.getElementById('levelNextText');
    
    if (!badgeEl || !titleEl || !progressFillEl || !currentTextEl || !nextTextEl) return;
    
    // Update badge and title
    badgeEl.textContent = levelData.current.title;
    titleEl.textContent = levelData.current.badge;
    
    // Update progress bar
    progressFillEl.style.width = `${levelData.progress}%`;
    
    // Update level info text
    currentTextEl.textContent = `레벨 ${levelData.current.level}`;
    
    if (levelData.next) {
        nextTextEl.textContent = `다음 레벨까지 ${levelData.remaining}개`;
    } else {
        nextTextEl.textContent = '최고 레벨 달성!';
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
        let serverAnswers = {};
        
        try {
            const [qRes, pqRes, aRes, answersRes] = await Promise.all([
                fetch(base + '/api/questions', { credentials: 'include' }),
                fetch(base + '/api/pop-quiz-queue', { credentials: 'include' }),
                fetch(base + '/api/achievements', { credentials: 'include' }),
                fetch(base + '/api/answers', { credentials: 'include' })
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
            if (answersRes.ok) {
                const j = await answersRes.json();
                serverAnswers = (j && j.answers) || {};
            }
        } catch(_) {}

        // Merge server answers with local answerByHash
        if (Object.keys(serverAnswers).length > 0) {
            Object.assign(answerByHash, serverAnswers);
            saveAnswerByHash();
        }

        // CRITICAL: Process achievements FIRST to filter out achieved questions
        if (aItems.length > 0) {
            achievements = aItems.map(a => ({
                id: a.questionId,
                questionId: a.questionId,
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

        // CRITICAL FIX: Filter out questions that are already achievements
        if (qItems.length > 0 && achievements.length > 0) {
            const achievementQuestionIds = new Set(achievements.map(a => a.questionId || a.id));
            const originalCount = qItems.length;
            qItems = qItems.filter(q => !achievementQuestionIds.has(q.id));
            console.log(`Filtered out ${originalCount - qItems.length} achieved questions from ${originalCount} total questions`);
        }

        if (qItems.length > 0) {
            // Create a map of existing questions to preserve userAnswer and work process images
            const existingQuestions = new Map();
            const existingByHash = new Map();
            questions.forEach(q => {
                if (q.dbId) existingQuestions.set(q.dbId, q);
                if (q.id) existingQuestions.set(q.id, q);
                if (q.imageHash) existingByHash.set(q.imageHash, q);
            });

            // Preserve work process images by mapping old IDs to new IDs
            const newWorkProcessImages = new Map();

            questions = qItems.map(q => {
                const imageHash = (q.image && q.image.hash) || null;
                
                // Try to find existing question by server ID, then by imageHash
                let existingQ = existingQuestions.get(q.id);
                if (!existingQ && imageHash) {
                    existingQ = existingByHash.get(imageHash);
                }
                
                // Preserve userAnswer from existing question
                let userAnswer = '';
                if (existingQ && existingQ.userAnswer) {
                    userAnswer = existingQ.userAnswer;
                } else if (imageHash && answerByHash[imageHash]) {
                    userAnswer = answerByHash[imageHash];
                }

                const newQuestion = {
                    id: q.id || Date.now(),
                    questionNumber: q.questionNumber || '문제',
                    publisher: q.publisher || '출처모름',
                    questionText: '이미지 문제',
                    imageUrl: (q.image && q.image.url) || '',
                    imageHash: imageHash,
                    category: q.category || 'wrong',
                    round: q.round || 0,
                    timestamp: q.timestamp || new Date().toISOString(),
                    lastAccessed: q.lastAccessed || new Date().toISOString(),
                    userAnswer: userAnswer,
                    dbId: q.id
                };

                // Preserve work process images for this question
                if (existingQ) {
                    const oldId = String(existingQ.id);
                    const newId = String(newQuestion.id);
                    console.log(`Mapping work process images: ${oldId} -> ${newId}`);
                    if (workProcessImages.has(oldId)) {
                        const images = workProcessImages.get(oldId);
                        // Store under both old and new IDs to ensure persistence
                        newWorkProcessImages.set(newId, images);
                        newWorkProcessImages.set(oldId, images); // Keep old ID mapping too
                        console.log(`Preserved ${images.length} work process images under both ${oldId} and ${newId}`);
                    }
                }

                return newQuestion;
            });

            // Update work process images with new mappings
            workProcessImages.clear();
            newWorkProcessImages.forEach((images, questionId) => {
                workProcessImages.set(questionId, images);
            });

            saveQuestions();
        }

        if (pqItems.length > 0) {
            // Preserve userAnswer in popQuizItems
            popQuizItems = pqItems.map(p => {
                const imageHash = (p.question && p.question.image && p.question.image.hash) || null;
                let userAnswer = '';
                
                // Find answer from various sources
                if (imageHash && answerByHash[imageHash]) {
                    userAnswer = answerByHash[imageHash];
                }
                
                return {
                    id: p.questionId,
                    questionId: p.questionId,
                    questionNumber: (p.question && p.question.questionNumber) || '문제',
                    imageUrl: (p.question && p.question.image && p.question.image.url) || '',
                    imageHash: imageHash,
                    category: (p.question && p.question.category) || 'wrong',
                    round: (p.question && p.question.round) || 0,
                    lastAccessed: (p.question && p.question.lastAccessed) || new Date().toISOString(),
                    quizCount: (p.question && p.question.quizCount) || 0,
                    popQuizAdded: (p.createdAt) || new Date().toISOString(),
                    reappearAt: p.nextAt || null,
                    userAnswer: userAnswer, // Include userAnswer
                    dbId: p.questionId
                };
            });
            savePopQuizItems();
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
    `

    if (!document.querySelector('style[data-toast]')) {
        style.setAttribute('data-toast', 'true');
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Work Process Images functionality
// Initialize work process functionality
function initWorkProcessImages() {
    // Event listeners are already set up in setupEventListeners()
    // This function can be used for other initialization if needed
}

// Handle image upload
async function handleWorkProcessImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    const questionId = solutionView.dataset.currentId;
    if (!questionId) return;
    
    // Initialize array if not exists, or clear placeholders if they exist
    if (!workProcessImages.has(questionId)) {
        workProcessImages.set(questionId, []);
    } else {
        // If existing images are placeholders, clear them for fresh upload
        const existingImages = workProcessImages.get(questionId);
        if (existingImages.some(img => img.isPlaceholder)) {
            workProcessImages.set(questionId, []);
        }
    }
    
    const currentImages = workProcessImages.get(questionId);
    
    // Process each file
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                // Create image data object
                const imageData = {
                    id: Date.now() + Math.random(),
                    file: file,
                    url: URL.createObjectURL(file),
                    name: file.name,
                    size: file.size,
                    uploadedAt: new Date().toISOString()
                };
                
                currentImages.push(imageData);
            } catch (error) {
                console.error('Error processing image:', error);
                showToast('이미지 처리 중 오류가 발생했습니다.', 'error');
            }
        }
    }
    
    // Update display
    updateWorkProcessImagesDisplay(questionId);
    
    // Save to localStorage for persistence
    saveWorkProcessImages();
    
    // Clear file input
    workProcessFileInput.value = '';
    
    showToast(`${files.length}개 이미지가 추가되었습니다.`);
}

// Update images display
function updateWorkProcessImagesDisplay(questionId) {
    // Check if DOM elements are available
    if (!workProcessCameraInterface || !workProcessImagesContainer || !workProcessImagesList || !workProcessImageCount) {
        console.warn('Work process DOM elements not yet available');
        return;
    }
    
    const images = workProcessImages.get(questionId) || [];
    
    console.log(`Updating work process images display for ${questionId}:`, images.length, 'images');
    
    if (images.length === 0) {
        // Show camera interface, hide images container
        workProcessCameraInterface.style.display = 'flex';
        workProcessImagesContainer.classList.add('hidden');
        workProcessImagesContainer.style.display = 'none';
        return;
    }
    
    // Check if images are placeholders (need re-upload)
    const hasPlaceholders = images.some(img => img.isPlaceholder);
    
    if (hasPlaceholders) {
        // Show camera interface with message about re-uploading
        workProcessCameraInterface.style.display = 'flex';
        workProcessImagesContainer.classList.remove('hidden');
        workProcessImagesContainer.style.display = 'block';
        
        // Update count to show placeholder info
        workProcessImageCount.textContent = `${images.length}개 이미지 (재업로드 필요)`;
        
        // Clear and show placeholder message
        workProcessImagesList.innerHTML = `
            <div style="
                padding: 20px;
                text-align: center;
                color: #666;
                border: 2px dashed #ddd;
                border-radius: 8px;
                margin: 10px 0;
            ">
                <i class="fas fa-upload" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                <div>이전에 업로드한 ${images.length}개의 이미지가 있습니다</div>
                <div style="font-size: 0.9rem; margin-top: 5px;">다시 업로드해 주세요</div>
            </div>
        `;
        return;
    }
    
    // Hide camera interface, show images container
    workProcessCameraInterface.style.display = 'none';
    workProcessImagesContainer.classList.remove('hidden');
    workProcessImagesContainer.style.display = 'block';
    
    // Update count
    workProcessImageCount.textContent = `${images.length}개 이미지`;
    
    // Clear and rebuild images list
    workProcessImagesList.innerHTML = '';
    
    images.forEach((imageData, index) => {
        const container = document.createElement('div');
        container.className = 'work-process-image-container';
        
        const img = document.createElement('img');
        img.src = imageData.url;
        img.className = 'work-process-image';
        img.alt = `풀이 과정 ${index + 1}`;
        img.addEventListener('click', () => openWorkProcessImageModal(imageData.url));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'work-process-image-delete';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeWorkProcessImage(questionId, imageData.id);
        });
        
        container.appendChild(img);
        container.appendChild(deleteBtn);
        workProcessImagesList.appendChild(container);
    });
}

// Remove image
function removeWorkProcessImage(questionId, imageId) {
    const images = workProcessImages.get(questionId) || [];
    const imageIndex = images.findIndex(img => img.id === imageId);
    
    if (imageIndex !== -1) {
        // Revoke object URL to prevent memory leaks (only if not placeholder)
        if (images[imageIndex].url && !images[imageIndex].isPlaceholder) {
            URL.revokeObjectURL(images[imageIndex].url);
        }
        
        // Remove from array
        images.splice(imageIndex, 1);
        
        // Save changes
        saveWorkProcessImages();
        
        // Update display
        updateWorkProcessImagesDisplay(questionId);
        
        showToast('이미지가 삭제되었습니다.');
    }
}

// Open image modal
function openWorkProcessImageModal(imageUrl) {
    if (workProcessModalImage && workProcessImageModal) {
        workProcessModalImage.src = imageUrl;
        workProcessImageModal.style.display = 'flex';
    }
}

// Close image modal
function closeWorkProcessImageModal() {
    if (workProcessImageModal) {
        workProcessImageModal.style.display = 'none';
    }
}

// Load work process images for a question
function loadWorkProcessImagesForQuestion(questionId) {
    // Try to update display immediately
    updateWorkProcessImagesDisplay(questionId);
    
    // If DOM elements weren't available, retry after a short delay
    if (!workProcessCameraInterface || !workProcessImagesContainer) {
        setTimeout(() => {
            updateWorkProcessImagesDisplay(questionId);
        }, 100);
    }
}

// Clean up work process images when question is deleted
function cleanupWorkProcessImages(questionId) {
    const images = workProcessImages.get(questionId) || [];
    images.forEach(imageData => {
        URL.revokeObjectURL(imageData.url);
    });
    workProcessImages.delete(questionId);
}

// Show solution view for achievement items
function showAchievementSolutionView(achievement) {
    previousView = 'achievement'; // Track that we came from achievement view
    
    // Debug: Log achievement data to understand structure
    console.log('Achievement data:', {
        id: achievement.id,
        questionId: achievement.questionId,
        originalQuestionId: achievement.originalQuestionId,
        imageHash: achievement.imageHash,
        userAnswer: achievement.userAnswer,
        workProcessKey: achievement.originalQuestionId || achievement.questionId || achievement.id,
        hasWorkProcessImages: workProcessImages.has(achievement.originalQuestionId || achievement.questionId || achievement.id)
    });
    
    // Set up solution view with achievement data
    document.getElementById('solutionQuestionNumber').textContent = achievement.questionNumber || '문제';
    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = achievement.category === 'ambiguous' ? '애매했던 문제' : '틀렸던 문제';
    solutionCategory.className = `solution-category ${achievement.category || 'wrong'}`;
    
    // Add achievement indicator
    const solutionHeader = document.querySelector('.solution-header');
    if (solutionHeader) {
        // Remove any existing indicators
        const existingIndicator = solutionHeader.querySelector('.view-indicator');
        if (existingIndicator) existingIndicator.remove();
        
        // Add achievement indicator
        const indicator = document.createElement('div');
        indicator.className = 'view-indicator achievement-indicator';
        indicator.innerHTML = '🏆 달성';
        indicator.style.cssText = `
            display: inline-block;
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 600;
            margin-left: 8px;
            vertical-align: middle;
        `;
        solutionHeader.appendChild(indicator);
    }
    
    document.getElementById('solutionImage').src = achievement.imageUrl;
    
    // Set dataset for tracking
    solutionView.dataset.currentId = String(achievement.id);
    solutionView.dataset.isAchievement = 'true';
    
    if (solutionAnswerInput) {
        // Load answer from achievement item with fallback to answerByHash
        let answer = achievement.userAnswer || '';
        
        // Fallback to answerByHash if no userAnswer
        if (!answer && achievement.imageHash && answerByHash[achievement.imageHash]) {
            answer = answerByHash[achievement.imageHash];
        }
        
        console.log('Loading answer for achievement:', answer);
        
        solutionAnswerInput.value = answer;
        
        const valEl = document.getElementById('answerValue');
        const revealBtn = document.getElementById('answerReveal');
        const solutionAnswerSubmit = document.getElementById('solutionAnswerSubmit');
        const warningText = solutionAnswerInput.closest('.solution-notes').querySelector('p');
        const inputContainer = solutionAnswerInput.parentElement;
        
        if (valEl) {
            valEl.textContent = answer || '정답을 알려주세요';
            
            // Show/hide input elements based on whether answer exists
            const hasAnswer = answer && answer.trim().length > 0;
            
            if (hasAnswer) {
                // Hide input elements
                solutionAnswerInput.style.display = 'none';
                if (solutionAnswerSubmit) solutionAnswerSubmit.style.display = 'none';
                if (warningText) warningText.style.display = 'none';
                if (inputContainer) inputContainer.style.display = 'none';
                
                // Show answer value (hidden by default)
                valEl.classList.remove('hidden');
                valEl.style.display = 'none'; // Start hidden, user clicks "보기" to reveal
                if (revealBtn) {
                    revealBtn.style.display = 'inline-block';
                    revealBtn.textContent = '보기';
                }
            } else {
                // Show input elements
                solutionAnswerInput.style.display = 'block';
                if (solutionAnswerSubmit) solutionAnswerSubmit.style.display = 'block';
                if (warningText) warningText.style.display = 'block';
                if (inputContainer) inputContainer.style.display = 'flex';
                
                // Hide answer value and reveal button
                valEl.classList.add('hidden');
                if (revealBtn) revealBtn.style.display = 'none';
            }
        }
    }
    
    setupAnswerReveal();
    solutionView.scrollTop = 0;
    
    // Load work process images for this achievement (try multiple keys)
    const possibleKeys = [
        achievement.originalClientId,
        achievement.originalQuestionId, 
        achievement.questionId, 
        achievement.id
    ].filter(Boolean); // Remove undefined values
    
    console.log('Achievement work process possible keys:', possibleKeys);
    console.log('Available work process images keys:', Array.from(workProcessImages.keys()));
    
    let workProcessKey = null;
    for (const key of possibleKeys) {
        if (workProcessImages.has(key)) {
            workProcessKey = key;
            console.log('Found work process images under key:', key);
            break;
        }
    }
    
    if (workProcessKey) {
        loadWorkProcessImagesForQuestion(workProcessKey);
    } else {
        console.log('No work process images found for any key');
    }
    
    // Hide all other views and show solution view
    if (roundNView) {
        roundNView.classList.add('hidden');
        roundNView.style.display = 'none';
    }
    if (settingsView) {
        settingsView.classList.add('hidden');
        settingsView.style.display = 'none';
    }
    if (achievementView) {
        achievementView.classList.add('hidden');
        achievementView.style.display = 'none';
    }
    if (imageReviewView) {
        imageReviewView.classList.add('hidden');
        imageReviewView.style.display = 'none';
    }
    if (solutionView) {
        solutionView.classList.remove('hidden');
        solutionView.style.display = 'block';
    }
}

// Save work process images to localStorage
function saveWorkProcessImages() {
    try {
        const data = {};
        workProcessImages.forEach((images, questionId) => {
            // Convert images to serializable format (without blob URLs)
            data[questionId] = images.map(img => ({
                id: img.id,
                name: img.name,
                size: img.size,
                uploadedAt: img.uploadedAt,
                // Note: file and url are not saved as they're temporary
            }));
        });
        localStorage.setItem(storageKey('workProcessImages'), JSON.stringify(data));
    } catch (error) {
        console.warn('Failed to save work process images:', error);
    }
}

// Load work process images from localStorage
function loadWorkProcessImages() {
    try {
        const data = localStorage.getItem(storageKey('workProcessImages'));
        if (data) {
            const parsed = JSON.parse(data);
            // Note: This only loads metadata, actual images need to be re-uploaded
            // We'll use this to show that images were previously uploaded
            Object.entries(parsed).forEach(([questionId, images]) => {
                if (images && images.length > 0) {
                    // Store placeholder data to indicate images were uploaded
                    workProcessImages.set(questionId, images.map(img => ({
                        ...img,
                        isPlaceholder: true // Mark as placeholder
                    })));
                }
            });
        }
    } catch (error) {
        console.warn('Failed to load work process images:', error);
        workProcessImages = new Map();
    }
}

// Scholarship state persistence
function saveScholarshipState() {
    localStorage.setItem(storageKey('scholarshipClickedAt'), String(scholarshipClickedAt));
}

function loadScholarshipState() {
    const saved = localStorage.getItem(storageKey('scholarshipClickedAt'));
    if (saved) {
        scholarshipClickedAt = parseInt(saved) || 0;
    }
}