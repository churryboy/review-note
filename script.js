// State management
let questions = [];
let popQuizItems = [];
let currentImageBlob = null;
let currentImageUrl = null;
let currentImageHash = null;
let achievements = [];

// Current user context
window.currentUserId = window.currentUserId || null;
function storageKey(base) {
    const uid = window.currentUserId || 'anon';
    return `${base}::${uid}`;
}

// Constants
const POP_QUIZ_DELAY_MS = 10 * 1000; // 10 seconds readiness delay
const POP_QUIZ_REAPPEAR_MS = 24 * 60 * 60 * 1000; // 1 day for wrong answers
// Default avatar (inline SVG data URI)
const DEFAULT_AVATAR_DATA = "data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>\
 <defs>\
  <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>\
    <stop offset='0%' stop-color='%23FF8A00'/>\
    <stop offset='100%' stop-color='%23FF5500'/>\
  </linearGradient>\
 </defs>\
 <rect width='96' height='96' rx='48' fill='url(%23g)'/>\
 <circle cx='48' cy='38' r='16' fill='white' opacity='0.9'/>\
 <path d='M16 84c6-16 20-24 32-24s26 8 32 24' fill='white' opacity='0.9'/>\
</svg>";

// DOM elements
// Removed 0회독 view (list) from UI; keep references guarded
const round0View = document.getElementById('round0View');
const roundNView = document.getElementById('roundNView');
const settingsView = document.getElementById('settingsView');
const imageReviewView = document.getElementById('imageReviewView');
const solutionView = document.getElementById('solutionView');
const floatingCameraBtn = document.getElementById('floatingCameraBtn');
const cameraInput = document.getElementById('cameraInput');
const round0List = document.getElementById('round0List');
const roundNList = document.getElementById('roundNList');
const round0Empty = document.getElementById('round0Empty');
const roundNEmpty = document.getElementById('roundNEmpty');
const totalQuestionCount = document.getElementById('totalQuestionCount');
const loadingOverlay = document.getElementById('loadingOverlay');
// Removed nav0Round; default to n회독
const navNRound = document.getElementById('navNRound');
const navSettings = document.getElementById('navSettings');
const navAchievement = document.getElementById('navAchievement');
const achievementView = document.getElementById('achievementView');
const backToCameraFromReview = document.getElementById('backToCameraFromReview');
const backFromSolution = document.getElementById('backFromSolution');
const deleteSolutionQuestion = document.getElementById('deleteSolutionQuestion');
const solutionNotes = document.getElementById('solutionNotes');
const saveSolutionBtn = document.getElementById('saveSolutionBtn');
const quizBadge = document.getElementById('quizBadge');
const popQuizContainer = document.getElementById('popQuizContainer');
const popQuizEmpty = document.getElementById('popQuizEmpty');
const popQuizWaitingCount = document.getElementById('popQuizWaitingCount');
// Removed unused popup elements
// const imagePopupOverlay = document.getElementById('imagePopupOverlay');
// const popupImage = document.getElementById('popupImage');
// const popupClose = document.getElementById('popupClose');

// Image review elements
const reviewImage = document.getElementById('reviewImage');
const imageCard = document.getElementById('imageCard');
const leftIndicator = document.getElementById('leftIndicator');
const rightIndicator = document.getElementById('rightIndicator');
const wrongBtn = document.getElementById('wrongBtn');
const ambiguousBtn = document.getElementById('ambiguousBtn');

// Coaching guide elements
const coachingOverlay = document.getElementById('coachingOverlay');
const coachingSkip = document.getElementById('coachingSkip');
const coachingNext = document.getElementById('coachingNext');
const coachingDone = document.getElementById('coachingDone');

// List coaching guide elements
const listCoachingOverlay = document.getElementById('listCoachingOverlay');
const listCoachingSkip = document.getElementById('listCoachingSkip');
const listCoachingNext = document.getElementById('listCoachingNext');
const listCoachingDone = document.getElementById('listCoachingDone');

// N-round coaching guide elements
const nListCoachingOverlay = document.getElementById('nListCoachingOverlay');
const nListCoachingSkip = document.getElementById('nListCoachingSkip');
const nListCoachingNext = document.getElementById('nListCoachingNext');
const nListCoachingDone = document.getElementById('nListCoachingDone');

// Image detail elements
const detailImage = document.getElementById('detailImage');
const detailQuestionNumber = document.getElementById('detailQuestionNumber');
const detailCategory = document.getElementById('detailCategory');
const detailPublisher = document.getElementById('detailPublisher');
const detailTimestamp = document.getElementById('detailTimestamp');

// Quiz modal elements
const quizModal = document.getElementById('quizModal');
const quizImage = document.getElementById('quizImage');
const quizClose = document.getElementById('quizClose');
const quizAnswer = document.getElementById('quizAnswer');
const quizSubmit = document.getElementById('quizSubmit');
const quizResult = document.getElementById('quizResult');

function closeQuizModal() {
    if (!quizModal) return;
    quizModal.style.display = 'none';
    if (quizResult) quizResult.style.display = 'none';
    if (quizAnswer) quizAnswer.value = '';
    delete quizModal.dataset.index;
}

// New: Profile dropdown elements
const loginBtn = null;
let profileDropdown = null;
let profileAvatar = null;
const profileName = null;
const profileEmail = null;
const logoutBtn = document.getElementById('logoutBtn');
profileDropdown = document.getElementById('profileDropdown');
profileAvatar = document.getElementById('profileAvatar');
const headerAvatar = document.getElementById('headerAvatar');
const profilePublicId = document.getElementById('profilePublicId');
const profileNickname = document.getElementById('profileNickname');
const loginStartBtn = null;

async function refreshAuthUi() {
    try {
        const res = await fetch('/api/auth/me');
        const j = await res.json();
        const user = j && j.user;
        const nickEl = document.getElementById('headerNickname');
        if (user) {
            window.currentUserId = user.id || null;
            window.currentAuthProvider = user.provider || 'anon';
            window.currentPublicId = user.publicId || null;
            if (nickEl) nickEl.textContent = user.publicId ? String(user.publicId) : (user.nickname || user.name || '');
            if (profileAvatar) {
                // random avatar for now
                const seed = user.publicId || user.id || 'user';
                const url = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
                profileAvatar.src = url;
                if (headerAvatar) headerAvatar.src = url;
            }
            if (loginBtn) {
                loginBtn.title = '프로필';
            }
            // no profile visuals
        } else {
            window.currentUserId = null;
            window.currentAuthProvider = null;
            if (nickEl) nickEl.textContent = '';
            if (loginBtn) {
                loginBtn.title = '로그인';
            }
            // no profile visuals
        }
    } catch (_) {
        // silent
    }
}

function toggleProfileDropdown(e) {
    if (!profileDropdown) return;
    const isShown = profileDropdown.style.display !== 'none';
    profileDropdown.style.display = isShown ? 'none' : 'block';
}

function hideProfileDropdownOnOutsideClick(e) {
    if (!profileDropdown) return;
    const within = profileDropdown.contains(e.target) || (loginBtn && loginBtn.contains(e.target));
    if (!within) profileDropdown.style.display = 'none';
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    await refreshAuthUi();
    if (profileDropdown) profileDropdown.style.display = 'none';
}

// New: solution steps button
const viewSolutionStepsBtn = document.getElementById('viewSolutionStepsBtn');
const stepsHeader = document.getElementById('stepsHeader');
const stepsContent = document.getElementById('stepsContent');
const stepsChevron = document.getElementById('stepsChevron');
const renderedSolution = document.getElementById('renderedSolution');

// Chat elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
let chatIsComposing = false;
let chatSendLocked = false;
// New: simple answer input
const solutionAnswerInput = document.getElementById('solutionAnswerInput');
// New: answers mapped by image hash
let answerByHash = {};

// Success modal controls
const successModal = document.getElementById('successModal');
const successClose = document.getElementById('successClose');
const successLaterBtn = document.getElementById('successLaterBtn');
const successUnderstoodBtn = document.getElementById('successUnderstoodBtn');

function openSuccessModal() {
    if (successModal) successModal.style.display = 'flex';
}
function closeSuccessModal() {
    if (successModal) successModal.style.display = 'none';
}

if (successClose) successClose.addEventListener('click', closeSuccessModal);

function handleSuccessLater(index) {
    // Reschedule after 1 day; leave it in popQuizItems with new reappear time
    if (typeof index === 'number' && popQuizItems[index]) {
        popQuizItems[index].reappearAt = new Date(Date.now() + POP_QUIZ_REAPPEAR_MS).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeSuccessModal();
        closeQuizModal();
        if (settingsView.style.display !== 'none') displayPopQuiz();
    } else {
        closeSuccessModal();
    }
}

function handleSuccessUnderstood(index) {
    // Move to achievements and remove from pop quiz
    if (typeof index === 'number') {
        const removed = popQuizItems.splice(index, 1)[0];
        if (removed) {
            removed.round = (removed.round || 0) + 1;
            removed.lastAccessed = new Date().toISOString();
            achievements.unshift({ ...removed, achievedAt: new Date().toISOString() });
            saveAchievements();
            savePopQuizItems();
            updatePopQuizBadge();
            if (achievementView && achievementView.style.display !== 'none') displayAchievements();
            // Persist to DB (best-effort)
            (async () => {
                try {
                    const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                    if (removed.dbId) {
                        await fetch(base + '/api/achievements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ questionId: removed.dbId })
                        });
                        await fetch(base + '/api/pop-quiz-queue/by-question/' + removed.dbId, { method: 'DELETE' });
                    }
                } catch (_) {}
            })();
            // Pulse the 성취도 icon to indicate new card
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

if (successLaterBtn) successLaterBtn.addEventListener('click', () => {
    const main = document.getElementById('successMainActions');
    const opts = document.getElementById('successDelayOptions');
    if (main) main.style.display = 'none';
    if (opts) opts.style.display = 'flex';
});

const success5mBtn = document.getElementById('success5mBtn');
const success1hBtn = document.getElementById('success1hBtn');
const success1dBtn = document.getElementById('success1dBtn');

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
if (success5mBtn) success5mBtn.addEventListener('click', () => rescheduleFromSuccess(5 * 60 * 1000));
if (success1hBtn) success1hBtn.addEventListener('click', () => rescheduleFromSuccess(60 * 60 * 1000));
if (success1dBtn) success1dBtn.addEventListener('click', () => rescheduleFromSuccess(24 * 60 * 60 * 1000));

if (successUnderstoodBtn) successUnderstoodBtn.addEventListener('click', () => {
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    handleSuccessUnderstood(idx);
});

// Fail modal controls
const failModal = document.getElementById('failModal');
const failClose = document.getElementById('failClose');
const failAcknowledgeBtn = document.getElementById('failAcknowledgeBtn');
const fail5mBtn = document.getElementById('fail5mBtn');
const fail1hBtn = document.getElementById('fail1hBtn');
const fail1dBtn = document.getElementById('fail1dBtn');

function openFailModal() { if (failModal) failModal.style.display = 'flex'; }
function closeFailModal() { if (failModal) failModal.style.display = 'none'; }
if (failClose) failClose.addEventListener('click', closeFailModal);
if (failAcknowledgeBtn) failAcknowledgeBtn.addEventListener('click', () => {
    const indexStr = quizModal && quizModal.dataset.index;
    const index = indexStr ? parseInt(indexStr) : undefined;
    if (typeof index === 'number' && popQuizItems[index]) {
        popQuizItems[index].reappearAt = new Date(Date.now() + POP_QUIZ_REAPPEAR_MS).toISOString();
        savePopQuizItems();
        updatePopQuizBadge();
        closeFailModal();
        closeQuizModal();
        if (settingsView.style.display !== 'none') displayPopQuiz();
    } else {
        closeFailModal();
    }
});

function rescheduleCurrentQuiz(delayMs) {
    const indexStr = quizModal && quizModal.dataset.index;
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

if (fail5mBtn) fail5mBtn.addEventListener('click', () => rescheduleCurrentQuiz(5 * 60 * 1000));
if (fail1hBtn) fail1hBtn.addEventListener('click', () => rescheduleCurrentQuiz(60 * 60 * 1000));
if (fail1dBtn) fail1dBtn.addEventListener('click', () => rescheduleCurrentQuiz(24 * 60 * 60 * 1000));

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Keep previous disablements removed so we can show n회독 coaching again
    // localStorage.removeItem('hasSeenCoaching');
    // localStorage.removeItem('hasSeenListCoaching');
    // sessionStorage.removeItem('shownListCoaching');
    // sessionStorage.removeItem('shownNListCoach');
    // sessionStorage.removeItem('nListCoachPending');

    setupEventListeners();
    (async () => {
        await ensureSession();
        await refreshAuthUi();
        routeAuthOrApp();
        initAuthPage();
        reloadUserState();
        if (window.currentAuthProvider === 'pin') {
            showNRoundView();
        } else {
            const authView = document.getElementById('authView');
            if (authView) authView.style.display = 'flex';
        }
        try { if (typeof startPopQuizTimer === 'function') { startPopQuizTimer(); } } catch (_) {}
    })();
});

function initAuthPage() {
    const authView = document.getElementById('authView');
    const tabLogin = document.getElementById('authTabLogin');
    const tabSignup = document.getElementById('authTabSignup');
    const btn = document.getElementById('authActionBtn');
    const nn = document.getElementById('authNickname');
    const pc = document.getElementById('authPin');
    const err = document.getElementById('authError');
    if (!authView || !tabLogin || !tabSignup || !btn || !nn || !pc) return;
    let mode = 'login';
    function setMode(m) {
        mode = m;
        tabLogin.classList.toggle('active', m === 'login');
        tabSignup.classList.toggle('active', m === 'signup');
        btn.textContent = (m === 'login') ? '로그인' : '회원가입';
        if (err) err.style.display = 'none';
    }
    tabLogin.addEventListener('click', ()=> setMode('login'));
    tabSignup.addEventListener('click', ()=> setMode('signup'));
    setMode('login');

    async function submitAuth() {
        const nickname = (nn.value || '').trim();
        const pin = (pc.value || '').trim();
        console.log('submitAuth called', { mode, nicknameLength: nickname.length, pinLength: pin.length });
        if (!nickname || pin.length < 4) {
            if (err) { err.textContent = '입력을 확인해 주세요.'; err.style.display = 'block'; }
            return;
        }
        const path = (mode === 'login') ? '/api/auth/login-pin' : '/api/auth/register-pin';
        try {
            console.log('submitAuth fetch ->', path);
            const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, pin }) });
            console.log('submitAuth response status', res.status);
            if (!res.ok) {
                if (err) {
                    if (res.status === 401) {
                        err.textContent = '닉네임 또는 PIN이 올바르지 않습니다.';
                    } else if (res.status === 400) {
                        err.textContent = '입력값이 올바르지 않습니다.';
                    } else {
                        err.textContent = '요청에 실패했습니다.';
                    }
                    err.style.display = 'block';
                }
                return;
            }
            if (err) err.style.display = 'none';
            await refreshAuthUi();
            routeAuthOrApp();
            reloadUserState();
            showNRoundView();
        } catch (e) {
            console.error('submitAuth error', e);
            if (err) { err.textContent = '요청에 실패했습니다.'; err.style.display = 'block'; }
        }
    }
    console.log('initAuthPage: attaching click handler to authActionBtn');
    btn.addEventListener('click', submitAuth);
}

function reloadUserState() {
    // Reset and load per-user data from namespaced storage
    questions = [];
    popQuizItems = [];
    achievements = [];
    loadQuestions();
    loadPopQuizItems();
    loadAchievements();
    loadAnswerByHash();
    updateQuestionCount();
    updatePopQuizBadge();
    if (roundNView && roundNView.style.display !== 'none') displayNRoundQuestions();
    if (achievementView && achievementView.style.display !== 'none') displayAchievements();
}

async function ensureSession() {
    try {
        const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({ user: null }));
        if (me && me.user) return;
        await fetch('/api/auth/anon', { method: 'POST' });
        await refreshAuthUi();
    } catch (_) {}
}

function showPinOverlayIfNeeded() {
    const overlay = document.getElementById('pinOverlay');
    if (!overlay) return;
    fetch('/api/auth/me').then(r => r.json()).then(j => {
        const user = j && j.user;
        if (!user || user.provider !== 'pin') {
            overlay.style.display = 'flex';
        }
    }).catch(()=>{ overlay.style.display = 'flex'; });
}

// PIN overlay handlers
(function initPinOverlay(){
    const overlay = document.getElementById('pinOverlay');
    const loginBtn = document.getElementById('pinLoginBtn');
    const regBtn = document.getElementById('pinRegisterBtn');
    const nn = document.getElementById('pinNickname');
    const pc = document.getElementById('pinCode');
    const err = document.getElementById('pinError');

    function openOverlay(){ if (overlay) overlay.style.display = 'flex'; }
    function closeOverlay(){ if (overlay) overlay.style.display = 'none'; if (err) err.style.display = 'none'; }
    if (loginBtn) {
        loginBtn.addEventListener('click', ()=> handle('/api/auth/login-pin'));
    }

    async function handle(path){
        if (!nn || !pc) return;
        const nickname = (nn.value || '').trim();
        const pin = (pc.value || '').trim();
        if (!nickname || pin.length < 4) {
            if (err) { err.textContent = '입력을 확인해 주세요.'; err.style.display = 'block'; }
            return;
        }
        try {
            const res = await fetch(path, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname, pin })
            });
            if (!res.ok) throw new Error('failed');
            await refreshAuthUi();
            closeOverlay();
        } catch (_e) {
            if (err) { err.textContent = '로그인/가입에 실패했습니다.'; err.style.display = 'block'; }
        }
    }

    if (loginBtn) loginBtn.addEventListener('click', ()=> handle('/api/auth/login-pin'));
    if (regBtn) regBtn.addEventListener('click', ()=> handle('/api/auth/register-pin'));
})();

// Set up event listeners
function setupEventListeners() {
    // Floating camera button
    floatingCameraBtn.addEventListener('click', () => {
        cameraInput.click();
    });

    // Login button (toggle dropdown, no direct login trigger)
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleProfileDropdown();
        });
    }

    // Camera input change
    cameraInput.addEventListener('change', handleImageCapture);

    // Bottom navigation
    navNRound.addEventListener('click', showNRoundView);
    navSettings.addEventListener('click', showSettingsView);
    if (navAchievement) {
        navAchievement.addEventListener('click', showAchievementView);
    }
    
    // Review navigation
    backToCameraFromReview.addEventListener('click', showNRoundView);

    // Solution navigation
    backFromSolution.addEventListener('click', returnToPreviousView);
    // Header button removed/unused guarded elsewhere
    if (saveSolutionBtn) {
        saveSolutionBtn.addEventListener('click', saveSolutionNotes);
    }

    // Simple answer input persistence
    if (solutionAnswerInput) {
        solutionAnswerInput.addEventListener('change', persistSolutionAnswer);
        solutionAnswerInput.addEventListener('blur', persistSolutionAnswer);
        solutionAnswerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                persistSolutionAnswer();
                // no toast
            }
        });
    }
    const solutionAnswerSubmit = document.getElementById('solutionAnswerSubmit');
    if (solutionAnswerSubmit) {
        solutionAnswerSubmit.addEventListener('click', async (e) => {
            e.preventDefault();
            await persistSolutionAnswer();
            const questionId = parseInt(solutionView.dataset.currentId);
            const question = questions.find(q => q.id === questionId);
            if (question && question.imageHash) {
                try {
                    await fetch('/api/answers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageHash: question.imageHash, answer: solutionAnswerInput.value || '' })
                    });
                } catch (_) {}
            }
            // Clear input to signal it has been saved
            if (solutionAnswerInput) {
                solutionAnswerInput.value = '';
                solutionAnswerInput.blur();
            }
            const sys = document.getElementById('solutionSystemMsg');
            if (sys) {
                sys.textContent = '정답이 저장되었습니다';
                sys.style.display = 'block';
                sys.classList.add('show');
                setTimeout(() => {
                    sys.classList.remove('show');
                    setTimeout(() => { sys.style.display = 'none'; }, 180);
                }, 1200);
            }
        });
    }

    // Add Count and Quiz buttons
    // Removed solution action row buttons

    // Disable image swipe gestures
    // setupSwipeGestures();

    // Image review actions
    if (wrongBtn) {
        wrongBtn.addEventListener('click', (e) => {
            e.preventDefault();
            wrongBtn.disabled = true;
            setTimeout(() => { wrongBtn.disabled = false; }, 300);
            categorizeQuestion('wrong');
        });
    }
    if (ambiguousBtn) {
        ambiguousBtn.addEventListener('click', (e) => {
            e.preventDefault();
            ambiguousBtn.disabled = true;
            setTimeout(() => { ambiguousBtn.disabled = false; }, 300);
            categorizeQuestion('ambiguous');
        });
    }

    // Quiz modal
    if (quizClose) {
        quizClose.addEventListener('click', closeQuizModal);
    }
    if (quizModal) {
        quizModal.addEventListener('click', (e) => {
            if (e.target === quizModal) {
                closeQuizModal();
            }
        });
    }
    quizSubmit.addEventListener('click', handleQuizSubmit);

    // Review answer input persistence (by image hash)
    const reviewAnswerInput = document.getElementById('reviewAnswerInput');
    if (reviewAnswerInput) {
        const saveReviewAnswer = async () => {
            if (!currentImageHash) return;
            await saveAnswerForHash(currentImageHash, reviewAnswerInput.value || '');
            const dbg = document.getElementById('reviewDebugHash');
            if (dbg) {
                dbg.textContent = '';
                dbg.style.display = 'none';
            }
        };
        reviewAnswerInput.addEventListener('blur', saveReviewAnswer);
        reviewAnswerInput.addEventListener('change', saveReviewAnswer);
        reviewAnswerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveReviewAnswer();
            }
        });
    }
}

// Replace persistSolutionAnswer with async version mapping by image hash
async function persistSolutionAnswer() {
    const questionId = parseInt(solutionView.dataset.currentId);
    if (!questionId) return;
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    const answer = (solutionAnswerInput && solutionAnswerInput.value) || '';
    question.userAnswer = answer;
    const hash = question.imageHash || (await ensureQuestionImageHash(question));
    if (hash) {
        await saveAnswerForHash(hash, answer);
    }
    try {
        saveQuestions();
    } catch (err) {
        console.error('saveQuestions error:', err);
        alert('저장 공간이 가득 찼습니다. 일부 항목을 삭제하거나 이미지 크기를 줄여주세요.');
        // Rollback the push to avoid inconsistent state
        questions.splice(questions.findIndex(q => q.id === questionId), 1);
        return;
    }
    // Persist to DB (best-effort)
    try {
        const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
        const resp = await fetch(base + '/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageHash: imageHash, imageUrl: dataUrl, questionNumber: newQuestion.questionNumber, publisher: newQuestion.publisher, category, round: 0 })
        });
        if (resp.ok) {
            const j = await resp.json();
            if (j && j.item && j.item.id) {
                newQuestion.dbId = j.item.id;
            }
        }
    } catch (_) {}
    updateQuestionCount();
}

// Show 0회독 view (deprecated): redirect to n회독
function show0RoundView() {
    showNRoundView();
}

// Show n회독 view
function showNRoundView() {
    if (round0View) round0View.style.display = 'none';
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

// Show settings view (Pop Quiz)
function showSettingsView() {
    if (round0View) round0View.style.display = 'none';
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

function computeRankIncrements() {
    const increments = [3];
    for (let i = 1; i < 4; i++) { // 5 tiers total → 4 increments
        increments[i] = Math.round(increments[i - 1] * 1.8);
    }
    return increments; // length 4 for 5 tiers
}

function computeRankTotals(increments) {
    const totals = [];
    let sum = 0;
    for (let i = 0; i < increments.length; i++) {
        sum += increments[i];
        totals.push(sum);
    }
    return totals; // thresholds to reach tiers 2..8
}

function getAchievementRankInfo(achieveCount) {
    const inc = computeRankIncrements();
    const totals = computeRankTotals(inc);
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
    const nextStepSize = stepIndex < inc.length ? inc[stepIndex] : 0;
    const inStepProgress = Math.max(0, achieveCount - prevTotal);
    const remaining = Math.max(0, nextStepSize - inStepProgress);
    const progressRatio = nextStepSize > 0 ? Math.min(1, inStepProgress / nextStepSize) : 1;
    // Tier titles/emojis
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

function displayAchievements() {
    const list = document.getElementById('achievementList');
    const empty = document.getElementById('achievementEmpty');
    const status = document.getElementById('achievementStatus');
    if (!list || !empty) return;

    // Rank panel
    if (status) {
        const info = getAchievementRankInfo((achievements || []).length);
        status.style.display = 'block';
        const percent = Math.round(info.progressRatio * 100);
        const progressFill = info.rank >= info.maxRank ? 100 : percent;
        // Visual badge row
        const badges = Array.from({ length: info.maxRank }, (_, i) => {
            const idx = i + 1;
            const active = idx <= info.rank ? 'active' : '';
            return `<div class=\"rank-badge ${active}\">${idx <= info.rank ? '⭐' : '☆'}</div>`;
        }).join('');
        const nextText = info.rank >= info.maxRank ? '최고 등급 도달' : `${info.remaining}개 남음`;
        status.innerHTML = `
            <div class="rank-panel fun">
                <div class="rank-tier-title"><span class="rank-emoji">${info.title.e}</span>${info.title.t}</div>
                <div class="rank-badges">${badges}</div>
                <div class="rank-stats">
                    <span>${info.nextTitle ? info.nextTitle.t : '다음 등급'}까지: <strong>${nextText}</strong></span>
                </div>
                <div class="rank-progress"><div class="rank-progress-bar" style="width:${progressFill}%"></div></div>
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
        <div class="question-item" data-id="${q.id}">
            <div class="question-with-image">
                <div class="question-image">
                    <img src="${q.imageUrl}" alt="문제 이미지" />
                </div>
                <div class="question-content">
                    <div class="question-header">
                        <span class="question-number">${q.questionNumber}</span>
                        <div class="question-meta">
                            <div class="source-category">
                                <span class="question-source">${q.publisher}</span>
                                <span class="question-round">${q.round}회독</span>
                            </div>
                        </div>
                    </div>
                    <div class="question-timestamp">
                        ${new Date(q.achievedAt || q.lastAccessed || q.timestamp).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function showAchievementView() {
    if (round0View) round0View.style.display = 'none';
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

// Show image review view
function showImageReviewView() {
    if (round0View) round0View.style.display = 'none';
    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'flex';
    if (solutionView) solutionView.style.display = 'none';
    
    // Do not show swipe coaching in the new flow
    // checkAndShowCoachingGuide();
}

// Helper: derive a 9-digit short id from a hash (display only)
function shortIdFromHash(hash) {
    if (!hash || typeof hash !== 'string') return '';
    let acc = 5381;
    for (let i = 0; i < hash.length; i++) {
        acc = ((acc << 5) + acc) ^ hash.charCodeAt(i);
        acc >>>= 0;
    }
    const num = acc % 1000000000;
    return String(num).padStart(9, '0');
}

// After computing currentImageHash on capture, render debug line
async function handleImageCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentImageBlob = file;
    currentImageUrl = URL.createObjectURL(file);
    currentImageHash = null;

    try {
        const fr = new FileReader();
        fr.onload = async (e) => {
            const dataUrl = e.target.result;
            currentImageHash = await computeSHA256HexFromDataUrl(dataUrl);
            const dbg = document.getElementById('reviewDebugHash');
            if (dbg) {
                dbg.textContent = '';
                dbg.style.display = 'none';
            }
        };
        fr.readAsDataURL(file);
    } catch (_) {}
    
    reviewImage.src = currentImageUrl;
    const reviewAnswerInput = document.getElementById('reviewAnswerInput');
    if (reviewAnswerInput) reviewAnswerInput.value = '';
    // Show debug unique id - answer in review view
    try {
        const dbg = document.getElementById('reviewDebugHash');
        if (dbg) {
            const hash = await ensureQuestionImageHash({ imageUrl: currentImageUrl, imageHash: currentImageHash });
            const short = shortIdFromHash(hash || '');
            const ans = hash ? (await getAnswerForHash(hash)) : '';
            dbg.textContent = short ? (ans ? `${short} - ${ans}` : `${short}`) : '';
            dbg.style.display = short ? 'block' : 'none';
        }
    } catch (_) {}

    showImageReviewView();
    cameraInput.value = '';
}

// Categorize question and store locally
function categorizeQuestion(category) {
    if (!currentImageBlob) {
        const sys = document.getElementById('solutionSystemMsg');
        if (sys) {
            sys.textContent = '이미지가 없습니다. 먼저 이미지를 촬영/업로드 해주세요.';
            sys.style.display = 'block';
            sys.classList.add('show');
            setTimeout(() => {
                sys.classList.remove('show');
                setTimeout(() => { sys.style.display = 'none'; }, 1500);
            }, 1500);
        }
        return;
    }

    const preCountNRound = questions.filter(q => (q.round ?? -1) >= 0).length;

    const reader = new FileReader();
    reader.onload = async function(e) {
        let dataUrl = e.target.result;
        const origDataUrl = dataUrl;
        // Compress image to avoid localStorage quota issues
        try { dataUrl = await compressDataUrl(dataUrl, 1080, 0.82); } catch (_) {}
        // Upload to server and keep URL only (reduces localStorage usage)
        try {
            const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
            const up = await fetch(base + '/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: dataUrl })
            });
            if (up.ok) {
                const j = await up.json();
                if (j && j.url) {
                    dataUrl = j.url;
                }
            }
        } catch (_) {}
        let imageHash = null;
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            imageHash = currentImageHash || await computeSHA256HexFromDataUrl(dataUrl);
        } else {
            imageHash = await computeSHA256HexFromString(dataUrl);
            // Bridge: if an answer exists under the original data-hash, copy it to URL-hash
            const origHash = currentImageHash || await computeSHA256HexFromDataUrl(origDataUrl);
            if (origHash && answerByHash && answerByHash[origHash] && !answerByHash[imageHash]) {
                await saveAnswerForHash(imageHash, answerByHash[origHash]);
            }
        }
        const reviewAnswerInput = document.getElementById('reviewAnswerInput');
        const initialAnswer = reviewAnswerInput ? (reviewAnswerInput.value || '') : '';
        
        const newQuestion = {
            id: Date.now(),
            questionNumber: '문제 ' + (questions.length + 1),
            publisher: '출처모름',
            questionText: '이미지 문제',
            answerChoices: [],
            handwrittenNotes: '',
            imageUrl: dataUrl,
            imageHash: imageHash || null,
            category: category,
            round: 0,
            timestamp: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            solutionNotes: '',
            userAnswer: initialAnswer
        };

        questions.unshift(newQuestion);
        if (newQuestion.imageHash) {
            await saveAnswerForHash(newQuestion.imageHash, initialAnswer);
        }
        try {
            saveQuestions();
        } catch (err) {
            console.error('saveQuestions error:', err);
            alert('저장 공간이 가득 찼습니다. 일부 항목을 삭제하거나 이미지 크기를 줄여주세요.');
            // Rollback the push to avoid inconsistent state
            questions.splice(questions.findIndex(q => q.id === newQuestion.id), 1);
            return;
        }
        // Persist to DB (best-effort)
        try {
            const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
            const resp = await fetch(base + '/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageHash: imageHash, imageUrl: dataUrl, questionNumber: newQuestion.questionNumber, publisher: newQuestion.publisher, category, round: 0 })
            });
            if (resp.ok) {
                const j = await resp.json();
                if (j && j.item && j.item.id) {
                    newQuestion.dbId = j.item.id;
                }
            }
        } catch (_) {}
        updateQuestionCount();

        const sys = document.getElementById('solutionSystemMsg');
        if (sys) {
            sys.textContent = (category === 'ambiguous') ? '애매한 문제로 저장되었습니다' : '틀린 문제로 저장되었습니다';
            sys.style.display = 'block';
            sys.classList.add('show');
            setTimeout(() => {
                sys.classList.remove('show');
                setTimeout(() => { sys.style.display = 'none'; }, 1500);
            }, 1500);
        }
        
        cleanupCurrentImage();
        showNRoundView();
        
        if (preCountNRound === 0) {
            sessionStorage.setItem('nListCoachPending', 'true');
            setTimeout(() => {
                if (!sessionStorage.getItem('shownNListCoach')) {
                    showNListCoachingGuide();
                    sessionStorage.setItem('shownNListCoach', 'true');
                    sessionStorage.removeItem('nListCoachPending');
                }
            }, 300);
        }
    };
    
    reader.readAsDataURL(currentImageBlob);
}

// Clean up current image resources
function cleanupCurrentImage() {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
    currentImageBlob = null;
    currentImageUrl = null;
    currentImageHash = null;
}

// Display questions in 0회독 view (unused)
function display0RoundQuestions() {
    // Deprecated in new flow
}

// Display questions in n회독 view
function displayNRoundQuestions() {
    let roundNQuestions = questions.filter(q => (q.round ?? -1) >= 0);

    // Apply sorting based on dropdown
    const sortSelect = document.getElementById('nSortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'created_recent';
    roundNQuestions = sortNRoundQuestions(roundNQuestions, sortValue);
    
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
                                <span class="question-source">${question.publisher}</span>
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
                        ${question.category ? `<span class="question-category ${question.category}">${question.category === 'ambiguous' ? '애매함' : '틀림'}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    applyRoundBadgeStyles(roundNList);

    // Add click handlers and swipe functionality
    document.querySelectorAll('#roundNList .question-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Only open solution if not currently swiping
            if (!item.classList.contains('swiping')) {
                const questionId = parseInt(item.dataset.id);
                showSolutionView(questionId, 'n회독');
            }
        });
        
        // Add swipe functionality for n회독 items
        setupNRoundSwipe(item);
    });

    // Show n회독 coaching only when: first n회독 card exists AND user is on n회독 page
    if (
        roundNQuestions.length === 1 &&
        sessionStorage.getItem('nListCoachPending') === 'true' &&
        !sessionStorage.getItem('shownNListCoach') &&
        roundNView && roundNView.style.display !== 'none'
    ) {
        setTimeout(() => {
            showNListCoachingGuide();
            sessionStorage.removeItem('nListCoachPending');
        }, 200);
    }
    applyRoundBadgeStyles(roundNList); // Apply gradient colors after rendering
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

// Apply dynamic styles to .question-round badges based on round count (blue -> red by 10th)
function applyRoundBadgeStyles(container) {
    if (!container) return;
    const badges = container.querySelectorAll('.question-round');
    badges.forEach(badge => {
        const text = (badge.textContent || '').trim();
        const match = text.match(/(\d+)/);
        const round = match ? Math.min(parseInt(match[1], 10) || 0, 10) : 0;
        const t = Math.max(0, Math.min(round / 10, 1)); // 0..1
        // Hue from 220 (blue) -> 0 (red)
        const hueStart = 220;
        const hueEnd = 0;
        const hue = Math.round(hueStart + (hueEnd - hueStart) * t);
        const color1 = `hsl(${hue}, 85%, 55%)`;
        const color2 = `hsl(${hue}, 85%, 45%)`;
        badge.style.color = '#fff';
        badge.style.borderRadius = '12px';
        badge.style.padding = '2px 8px';
        badge.style.fontWeight = '600';
        badge.style.background = `linear-gradient(135deg, ${color1}, ${color2})`;
        badge.style.display = 'inline-block';
    });
}

// Wire up sort change
(function initNSortHandler(){
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && target.id === 'nSortSelect') {
            displayNRoundQuestions();
        }
    });
})();

// Show solution view
function showSolutionView(questionId, fromView) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    // Update last accessed time
    question.lastAccessed = new Date().toISOString();
    saveQuestions();

    // Populate solution view
    document.getElementById('solutionQuestionNumber').textContent = question.questionNumber;
    (async () => {
        try {
            const h = await ensureQuestionImageHash(question);
            const s = shortIdFromHash(h || '');
            let a = '';
            if (h) {
                try { a = await getAnswerForHash(h); } catch (_) {}
            }
            if (s) {
                const el = document.getElementById('solutionQuestionNumber');
                const tag = a ? `${s} - ${a}` : s;
                if (el) el.textContent = `[${tag}] ${question.questionNumber}`;
            }
        } catch (_) {}
    })();
    // Removed: solutionPublisher and solutionTimestamp UI

    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = question.category === 'ambiguous' ? '애매함' : '틀림';
    solutionCategory.className = `solution-category ${question.category}`;

    document.getElementById('solutionImage').src = question.imageUrl;

    // Show debug unique id - answer in solution view
    (async () => {
        try {
            const dbg = document.getElementById('solutionDebugHash');
            if (dbg) {
                const hash = await ensureQuestionImageHash(question);
                const short = shortIdFromHash(hash || '');
                const ans = hash ? (await getAnswerForHash(hash)) : '';
                dbg.textContent = short ? (ans ? `${short} - ${ans}` : `${short}`) : '';
                dbg.style.display = short ? 'block' : 'none';
            }
        } catch (_) {}
    })();


    // Expose current id for chat/delete handlers
    solutionView.dataset.currentId = String(question.id);

    // Populate answer input from mapping by image hash (fallback to userAnswer)
    if (solutionAnswerInput) {
        solutionAnswerInput.value = question.userAnswer || '';
        ensureQuestionImageHash(question).then(async (hash) => {
            if (!hash) return;
            try {
                const r = await fetch(`/api/answers/${hash}`);
                if (r.ok) {
                    const j = await r.json();
                    if (typeof j.answer === 'string' && j.answer.length > 0) {
                        solutionAnswerInput.value = j.answer;
                    }
                }
            } catch (_) {}
            if (typeof answerByHash[hash] === 'string' && answerByHash[hash].length > 0) {
                solutionAnswerInput.value = answerByHash[hash];
            }
            // Hide solution process (and input row) if we already have an answer
            const inputRow = solutionAnswerInput && solutionAnswerInput.parentElement;
            const hasAnswer = (solutionAnswerInput && solutionAnswerInput.value && solutionAnswerInput.value.trim().length > 0);
            const solutionProcess = document.querySelector('.solution-process');
            if (hasAnswer) {
                if (solutionProcess) solutionProcess.style.display = 'none';
                if (inputRow) inputRow.style.display = 'none';
                if (solutionAnswerInput) solutionAnswerInput.style.display = 'none';
                const submitBtn = document.getElementById('solutionAnswerSubmit');
                if (submitBtn) submitBtn.style.display = 'none';
            } else {
                if (solutionProcess) solutionProcess.style.display = '';
                if (inputRow) inputRow.style.display = 'flex';
                if (solutionAnswerInput) solutionAnswerInput.style.display = '';
                const submitBtn = document.getElementById('solutionAnswerSubmit');
                if (submitBtn) submitBtn.style.display = '';
            }
            const dbg = document.getElementById('solutionDebugHash');
            if (dbg) {
                dbg.textContent = '';
                dbg.style.display = 'none';
            }
        });
    }

    // Render chat removed in new flow (leave no-op if functions exist)
    // renderChat(question);

    // Show view
    if (round0View) round0View.style.display = 'none';
    if (roundNView) roundNView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (achievementView) achievementView.style.display = 'none';
    if (imageReviewView) imageReviewView.style.display = 'none';
    if (solutionView) solutionView.style.display = 'block';
}

function renderChat(question) {
    if (!chatMessages) return;
    chatMessages.innerHTML = '';
    const messages = question.chat || [];
    messages.forEach(m => {
        const div = document.createElement('div');
        div.className = `chat-message ${m.role}`;
        if (m.role === 'assistant') {
            div.innerHTML = formatAssistantText(m.content);
        } else {
            div.textContent = m.content;
        }
        chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (window.MathJax && window.MathJax.typesetPromise) {
        setTimeout(() => window.MathJax.typesetPromise([chatMessages]), 0);
    }
}

function formatAssistantText(text) {
    const lines = (text || '').split(/\r?\n/);
    let html = '';
    let inUl = false;
    let inOl = false;
    const closeLists = () => {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
    };

    for (const line of lines) {
        if (/^\s*$/.test(line)) { closeLists(); html += '<br/>'; continue; }
        const h3 = line.match(/^\s*###\s+(.*)$/);
        if (h3) { closeLists(); html += `<h4>${escapeHtml(h3[1])}</h4>`; continue; }
        const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (ol) { if (!inOl) { closeLists(); html += '<ol>'; inOl = true; } html += `<li>${escapeHtml(ol[2])}</li>`; continue; }
        const ul = line.match(/^\s*[-*]\s+(.*)$/);
        if (ul) { if (!inUl) { closeLists(); html += '<ul>'; inUl = true; } html += `<li>${escapeHtml(ul[1])}</li>`; continue; }
        closeLists();
        html += `<div>${escapeHtml(line)}</div>`;
    }
    closeLists();
    return html;
}

function escapeHtml(s){
    return (s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

function handleChatSend() {
    if (chatSendLocked) return; // prevent double send
    const questionId = parseInt(solutionView.dataset.currentId);
    if (!questionId) return;
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const text = (chatInput.value || '').trim();
    if (!text) return;

    chatSendLocked = true;
    question.chat = question.chat || [];
    question.chat.push({ role: 'user', content: text });
    saveQuestions();

    chatInput.value = '';
    renderChat(question);

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-message assistant';
    typing.innerHTML = '<div class="typing"><span>생각 중...</span><div class="dots"><span></span><span></span><span></span></div></div>';
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send to backend LLM with image context
    fetch('/api/llm-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: text,
            imageDataUrl: question.imageUrl // already base64 data URL
        })
    })
    .then(r => r.json())
    .then(data => {
        typing.remove();
        const raw = data.reply || '답변을 생성하지 못했습니다.';
        question.chat.push({ role: 'assistant', content: raw });
        saveQuestions();
        renderChat(question);
    })
    .catch(err => {
        typing.remove();
        console.error('LLM error:', err);
        question.chat.push({ role: 'assistant', content: 'LLM 호출 중 오류가 발생했습니다.' });
        saveQuestions();
        renderChat(question);
    })
    .finally(() => {
        chatSendLocked = false;
    });
}

// Return to previous view (n회독 in new flow)
function returnToPreviousView() {
    showNRoundView();
}

// Save solution notes
function saveSolutionNotes() {
    const questionId = parseInt(solutionView.dataset.currentId);
    const question = questions.find(q => q.id === questionId);
    
    if (question && typeof solutionNotes !== 'undefined' && solutionNotes) {
        question.solutionNotes = solutionNotes.value;
        saveQuestions();
        showToast('풀이 과정이 저장되었습니다!');
    }
}

// Handle delete from solution view
function handleDeleteCurrentSolution() {
    const questionId = parseInt(solutionView.dataset.currentId);
    const questionIndex = questions.findIndex(q => q.id === questionId);
    
    if (questionIndex !== -1) {
        questions.splice(questionIndex, 1);
        saveQuestions();
        updateQuestionCount();
        showToast('문제가 삭제되었습니다!');
        showNRoundView();
    }
}

// Open image detail view (kept for backward compatibility if needed)
function openImageDetail(questionId) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    // Update last accessed time
    question.lastAccessed = new Date().toISOString();
    saveQuestions();

    // Populate detail view
    detailQuestionNumber.textContent = question.questionNumber;
    detailPublisher.textContent = question.publisher || '출처모름';
    detailTimestamp.textContent = new Date(question.lastAccessed).toLocaleString('ko-KR');

    detailCategory.textContent = question.category === 'ambiguous' ? '애매함' : '틀림';
    detailCategory.className = `detail-category ${question.category}`;

    detailImage.src = question.imageUrl;

    // Store current detail id for deletion
    imageDetailView.dataset.currentId = String(question.id);

    // Show detail view
    round0View.style.display = 'none';
    roundNView.style.display = 'none';
    settingsView.style.display = 'none';
    imageReviewView.style.display = 'none';
    imageDetailView.style.display = 'flex';
}

function handleDeleteCurrentDetail() {
    const idStr = imageDetailView.dataset.currentId;
    if (!idStr) return;
    const id = parseInt(idStr);
    const idx = questions.findIndex(q => q.id === id);
    if (idx >= 0) {
        questions.splice(idx, 1);
        saveQuestions();
        updateQuestionCount();
    }
    show0RoundView();
}

// Update question count
function updateQuestionCount() {
    if (totalQuestionCount) {
        totalQuestionCount.textContent = questions.length + '개';
    }
}

function updatePopQuizStatusPanel() {
    const waitingEl = document.getElementById('popQuizWaitingCountStat');
    const avgEl = document.getElementById('popQuizAvgRoundStat');
    if (!waitingEl || !avgEl) return;

    // Show only ready-to-appear items to match the visible list and badge
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

// Update pop quiz badge
function updatePopQuizBadge() {
    const now = Date.now();
    const readyCount = popQuizItems.filter(item => isPopQuizReady(item, now)).length;

    if (readyCount > 0) {
        quizBadge.textContent = String(readyCount);
        quizBadge.style.display = 'flex';
    } else {
        quizBadge.style.display = 'none';
    }
    if (popQuizWaitingCount) {
        popQuizWaitingCount.textContent = readyCount + '개';
    }
    updatePopQuizStatusPanel();
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
            <img src="${item.imageUrl}" alt="팝퀴즈 이미지" />
            <div class="meta">
                <div class="question-number">${item.questionNumber || '문제'}</div>
                <div class="question-badges">
                    <span class="question-round">${item.round || 0}회독</span>
                    <span class="quiz-count">퀴즈 ${(item.quizCount || 0)}회</span>
                </div>
            </div>
        </div>
    `).join('');

    popQuizContainer.querySelectorAll('.pop-quiz-card').forEach(card => {
        const index = parseInt(card.getAttribute('data-index'));
        card.addEventListener('click', () => openQuizModal(index));
    });
}

function openQuizModal(index) {
    const quizItem = popQuizItems[index];
    if (!quizItem) return;
    quizModal.style.display = 'flex';
    quizImage.src = quizItem.imageUrl;
    quizModal.dataset.index = String(index);
}

// Helper to retrieve saved answer by image hash
async function getAnswerForHash(imageHash) {
    if (!imageHash) return '';
    try {
        const r = await fetch(`/api/answers/${imageHash}`);
        if (r.ok) {
            const j = await r.json();
            if (typeof j.answer === 'string') return j.answer.trim();
        }
    } catch (_) {}
    const local = (answerByHash && typeof answerByHash[imageHash] === 'string') ? answerByHash[imageHash] : '';
    return (local || '').trim();
}

// Update quiz submit to open success modal
function handleQuizSubmit() {
    const indexStr = quizModal.dataset.index;
    if (!indexStr) return;
    const index = parseInt(indexStr);
    const quizItem = popQuizItems[index];
    if (!quizItem) return;

    (async () => {
        const userAnswer = (quizAnswer.value || '').trim();
        const hash = quizItem.imageHash || (await ensureQuestionImageHash(quizItem));
        const correctAnswer = await getAnswerForHash(hash);

        const isCorrect = userAnswer.length > 0 && correctAnswer.length > 0 && (userAnswer === correctAnswer);

        // Increment quiz count for this item
        quizItem.quizCount = (quizItem.quizCount || 0) + 1;
        savePopQuizItems();
        // Refresh visible badges if container is shown
        if (settingsView && settingsView.style.display !== 'none') {
            displayPopQuiz();
        }

        quizResult.style.display = 'block';
        quizResult.textContent = isCorrect
            ? '✅ 정답입니다! 이제 이 문제를 완벽히 이해하신 것 같네요! 이 문제는 성취도 메뉴 에서 확인하실 수 있어요'
            : '❌ 틀렸습니다ㅠ 다음에 또 시도해보아요!';
        quizResult.className = `quiz-result ${isCorrect ? 'correct' : 'wrong'}`;

        if (isCorrect) {
            // Show success modal with celebration and two choices
            openSuccessModal();
        } else {
            // Schedule reappearance after 1 day, and hide immediately
            openFailModal();
        }
    })();
}

// Save questions to localStorage
function saveQuestions() {
    localStorage.setItem(storageKey('reviewNoteQuestions'), JSON.stringify(questions));
}

// Load questions from localStorage
function loadQuestions() {
    const saved = localStorage.getItem(storageKey('reviewNoteQuestions'));
    if (saved) {
        try {
            questions = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading saved questions:', error);
            questions = [];
        }
    }
}

// Save pop quiz items to localStorage
function savePopQuizItems() {
    localStorage.setItem(storageKey('reviewNotePopQuiz'), JSON.stringify(popQuizItems));
}

// Load pop quiz items from localStorage
function loadPopQuizItems() {
    const saved = localStorage.getItem(storageKey('reviewNotePopQuiz'));
    if (saved) {
        try {
            popQuizItems = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading saved pop quiz items:', error);
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

function isPopQuizReady(item, nowTs) {
    const now = nowTs || Date.now();
    if (item.reappearAt) {
        return now >= new Date(item.reappearAt).getTime();
    }
    const added = item.popQuizAdded ? new Date(item.popQuizAdded).getTime() : 0;
    return added > 0 && (now - added) >= POP_QUIZ_DELAY_MS;
}

// Save/load answers mapped by image hash
function saveAnswerByHash() {
    try { localStorage.setItem(storageKey('answerByHash'), JSON.stringify(answerByHash)); } catch (_) {}
}
function loadAnswerByHash() {
    try {
        const v = localStorage.getItem(storageKey('answerByHash'));
        answerByHash = v ? (JSON.parse(v) || {}) : {};
    } catch (_) {
        answerByHash = {};
    }
}

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
            body: JSON.stringify({ imageHash, answer: val })
        });
    } catch (_) {}
}

// New: Compute SHA-256 hex of an arbitrary string
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

// New: Compute SHA-256 hex of a Data URL (fallbacks to simple hash)
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
function shortIdFromHash(hash) {
    if (!hash || typeof hash !== 'string') return '';
    let acc = 5381;
    for (let i = 0; i < hash.length; i++) {
        acc = ((acc << 5) + acc) ^ hash.charCodeAt(i);
        acc >>>= 0;
    }
    const num = acc % 1000000000;
    return String(num).padStart(9, '0');
}
async function ensureQuestionImageHash(question) {
    if (question.imageHash) return question.imageHash;
    const url = question.imageUrl;
    if (!url) return null;
    let hash = null;
    if (typeof url === 'string' && url.startsWith('data:')) {
        hash = await computeSHA256HexFromDataUrl(url);
    } else {
        // For blob:/http(s): or any other URL, hash the URL string for stable identity
        hash = await computeSHA256HexFromString(url);
    }
    if (hash) {
        question.imageHash = hash;
        try { saveQuestions(); } catch (_) {}
    }
    return hash;
}

// Show toast notification
function showToast(message, type = 'success') {
    // Suppress green success system messages globally
    if (type === 'success') {
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles for toast
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
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// No API simulation needed - we're storing images locally

// Set up swipe gestures
function setupSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;

    imageCard.addEventListener('touchstart', handleStart, { passive: false });
    imageCard.addEventListener('touchmove', handleMove, { passive: false });
    imageCard.addEventListener('touchend', handleEnd, { passive: false });

    // Mouse events for desktop testing
    imageCard.addEventListener('mousedown', handleStart);
    imageCard.addEventListener('mousemove', handleMove);
    imageCard.addEventListener('mouseup', handleEnd);
    imageCard.addEventListener('mouseleave', handleEnd);

    function handleStart(e) {
        e.preventDefault();
        isDragging = true;
        imageCard.classList.add('dragging');

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        currentX = clientX;
        currentY = clientY;
    }

    function handleMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX;
        currentY = clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const rotation = deltaX * 0.1; // Slight rotation effect

        // Update card position
        imageCard.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

        // Show/hide indicators based on swipe direction
        const threshold = 80;
        if (deltaX < -threshold) {
            leftIndicator.classList.add('active');
            rightIndicator.classList.remove('active');
        } else if (deltaX > threshold) {
            rightIndicator.classList.add('active');
            leftIndicator.classList.remove('active');
        } else {
            leftIndicator.classList.remove('active');
            rightIndicator.classList.remove('active');
        }
    }

    function handleEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        imageCard.classList.remove('dragging');

        const deltaX = currentX - startX;
        const threshold = 120;

        if (deltaX < -threshold) {
            // Swiped left - Wrong
            swipeComplete('left', 'wrong');
        } else if (deltaX > threshold) {
            // Swiped right - Ambiguous
            swipeComplete('right', 'ambiguous');
        } else {
            // Snap back to center
            imageCard.style.transform = 'translateX(0) rotate(0deg)';
            leftIndicator.classList.remove('active');
            rightIndicator.classList.remove('active');
        }
    }

    function swipeComplete(direction, category) {
        imageCard.classList.add(`swipe-${direction}`);
        leftIndicator.classList.remove('active');
        rightIndicator.classList.remove('active');

        setTimeout(() => {
            categorizeQuestion(category);
            // Reset card position for next use
            imageCard.style.transform = 'translateX(0) rotate(0deg)';
            imageCard.classList.remove(`swipe-${direction}`);
        }, 300);
    }
}

// Set up swipe gestures for question items
function setupQuestionSwipe(item) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;

    item.addEventListener('touchstart', handleStart, { passive: false });
    item.addEventListener('touchmove', handleMove, { passive: false });
    item.addEventListener('touchend', handleEnd, { passive: false });

    // Mouse events for desktop testing
    item.addEventListener('mousedown', handleStart);
    item.addEventListener('mousemove', handleMove);
    item.addEventListener('mouseup', handleEnd);
    item.addEventListener('mouseleave', handleEnd);

    function handleStart(e) {
        e.preventDefault();
        isDragging = true;
        item.classList.add('swiping');

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        currentX = clientX;
        currentY = clientY;
    }

    function handleMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX;
        currentY = clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const rotation = deltaX * 0.1; // Slight rotation effect

        // Update card position
        item.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

        // Show/hide indicators based on swipe direction
        const threshold = 80;
        if (deltaX < -threshold) {
            leftIndicator.classList.add('active');
            rightIndicator.classList.remove('active');
        } else if (deltaX > threshold) {
            rightIndicator.classList.add('active');
            leftIndicator.classList.remove('active');
        } else {
            leftIndicator.classList.remove('active');
            rightIndicator.classList.remove('active');
        }
    }

    function handleEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        item.classList.remove('swiping');

        const deltaX = currentX - startX;
        const threshold = 120;

        if (deltaX < -threshold) {
            // Swiped left - Wrong
            swipeComplete('left', 'wrong');
        } else if (deltaX > threshold) {
            // Swiped right - Ambiguous
            swipeComplete('right', 'ambiguous');
        } else {
            // Snap back to center
            item.style.transform = 'translateX(0) rotate(0deg)';
            leftIndicator.classList.remove('active');
            rightIndicator.classList.remove('active');
        }
    }

    function swipeComplete(direction, category) {
        item.classList.add(`swipe-${direction}`);
        leftIndicator.classList.remove('active');
        rightIndicator.classList.remove('active');

        setTimeout(() => {
            categorizeQuestion(category);
            // Reset card position for next use
            item.style.transform = 'translateX(0) rotate(0deg)';
            item.classList.remove(`swipe-${direction}`);
        }, 300);
    }
}

// Show 3-step coaching guide for first creation
function showNListCoachingGuide() {
    if (!listCoachingOverlay) return;
    listCoachingOverlay.style.display = 'flex';
    const steps = Array.from(listCoachingOverlay.querySelectorAll('.coaching-step'));
    let index = 0;
    function render() {
        steps.forEach((s, i) => { s.style.display = (i === index) ? 'block' : 'none'; });
        if (listCoachingNext) listCoachingNext.innerHTML = index === steps.length - 1 ? '<span>시작하기</span>' : '<span>다음</span>';
    }
    function complete() {
        listCoachingOverlay.style.display = 'none';
        sessionStorage.setItem('shownNListCoach', 'true');
    }
    if (listCoachingSkip) listCoachingSkip.onclick = complete;
    if (listCoachingNext) listCoachingNext.onclick = () => {
        if (index < steps.length - 1) { index += 1; render(); } else { complete(); }
    };
    render();
}

// Show N-round coaching guide
function showNRoundCoachingGuide() {
    if (nListCoachingOverlay) nListCoachingOverlay.style.display = 'flex';
    if (nListCoachingSkip) nListCoachingSkip.addEventListener('click', () => {
        nListCoachingOverlay.style.display = 'none';
        sessionStorage.setItem('shownNListCoach', 'true');
    });
    if (nListCoachingNext) nListCoachingNext.addEventListener('click', () => {
        nListCoachingOverlay.style.display = 'none';
        sessionStorage.setItem('shownNListCoach', 'true');
    });
}

// Robust logout handler
async function doLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    // Keep per-user data in localStorage to persist across sessions
    window.currentUserId = null;
    window.currentAuthProvider = null;
    await refreshAuthUi();
    // Do not clear localStorage; data is namespaced by userId and will be reloaded after login
    reloadUserState();
    routeAuthOrApp();
}

// Delegate click for logout to avoid missing listeners
document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === 'logoutBtn' || (t.closest && t.closest('#logoutBtn'))) {
        e.preventDefault();
        if (profileDropdown) {
            const visible = profileDropdown.style.display !== 'none';
            profileDropdown.style.display = visible ? 'none' : 'block';
            if (!visible) {
                try {
                    // Fill in current user info
                    const meFill = window.currentPublicId || '';
                    if (profilePublicId) profilePublicId.textContent = meFill || '-';
                    const nick = document.getElementById('headerNickname');
                    if (profileNickname) profileNickname.textContent = (nick && nick.textContent) ? nick.textContent : '';
                } catch (_) {}
            }
        }
        return;
    }
    if (t.id === 'profileLogoutBtn' || (t.closest && t.closest('#profileLogoutBtn'))) {
        e.preventDefault();
        if (profileDropdown) profileDropdown.style.display = 'none';
        doLogout();
        return;
    }
    // click outside to close
    if (profileDropdown && profileDropdown.style.display !== 'none') {
        if (!t.closest('#profileDropdown') && !t.closest('#logoutBtn')) {
            profileDropdown.style.display = 'none';
        }
    }
});

// Ensure routeAuthOrApp exists (guard)
    if (typeof window.routeAuthOrApp !== 'function') {
        window.routeAuthOrApp = function () {
            const authView = document.getElementById('authView');
            const showAuth = !window.currentAuthProvider || window.currentAuthProvider !== 'pin';
            if (authView) authView.style.display = showAuth ? 'flex' : 'none';
            if (typeof roundNView !== 'undefined' && roundNView) roundNView.style.display = showAuth ? 'none' : 'block';
            if (typeof settingsView !== 'undefined' && settingsView) settingsView.style.display = 'none';
            if (typeof achievementView !== 'undefined' && achievementView) achievementView.style.display = 'none';
            if (typeof imageReviewView !== 'undefined' && imageReviewView) imageReviewView.style.display = 'none';
            if (typeof solutionView !== 'undefined' && solutionView) solutionView.style.display = 'none';
        };
    }

// Minimal no-op to avoid ReferenceError when swipe is disabled on n회독 items
function setupNRoundSwipe(item) {
    let isDragging = false;
    let startX = 0;
    let currentX = 0;

    // Lock height to avoid reflow jump during swipe
    const fixedHeight = item.offsetHeight;
    item.style.minHeight = fixedHeight + 'px';

    function handleStart(e) {
        isDragging = true;
        item.classList.add('swiping');
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        startX = clientX;
        currentX = clientX;
    }

    function handleMove(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        currentX = clientX;
        const deltaX = currentX - startX;
        item.style.transform = `translateX(${deltaX}px)`;
    }

    function handleEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        item.classList.remove('swiping');
        const deltaX = currentX - startX;
        const threshold = 110;
        if (deltaX < -threshold) {
            // Left: increment round (wrong)
            const qid = parseInt(item.dataset.id);
            const q = questions.find(q => q.id === qid);
            if (q) {
                q.round = (q.round || 0) + 1;
                try { saveQuestions(); } catch (_) {}
                const badge = item.querySelector('.question-round');
                if (badge) badge.textContent = `${q.round}회독`;
                applyRoundBadgeStyles(item.parentElement || roundNList);
            }
            item.style.transform = 'translateX(0) rotate(0deg)';
        } else if (deltaX > threshold) {
            // Right: send to pop quiz (ambiguous)
            const qid = parseInt(item.dataset.id);
            const q = questions.find(q => q.id === qid);
            if (q) {
                // Require answer before queuing to pop quiz
                (async () => {
                    const hash = q.imageHash || (await ensureQuestionImageHash(q));
                    let ans = '';
                    try {
                        const r = hash ? await fetch(`/api/answers/${hash}`) : null;
                        if (r && r.ok) { const j = await r.json(); ans = (j && j.answer) || ''; }
                    } catch (_) {}
                    if ((!ans || ans.trim().length === 0) && hash && answerByHash && typeof answerByHash[hash] === 'string') {
                        ans = (answerByHash[hash] || '').trim();
                    }
                    if (!ans || ans.trim().length === 0) {
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
                                if (hash) {
                                    await saveAnswerForHash(hash, v);
                                }
                                // queue to pop quiz now
                                const entry = { imageUrl: q.imageUrl, questionId: String(q.dbId || q.id), reappearAt: new Date(Date.now() + POP_QUIZ_DELAY_MS).toISOString(), round: q.round || 0 };
                                popQuizItems.push(entry);
                                try { savePopQuizItems(); updatePopQuizBadge(); } catch (_) {}
                                // remove from list now that it’s queued
                                const idx = questions.findIndex(qq => qq.id === qid);
                                if (idx !== -1) {
                                    questions.splice(idx, 1);
                                    try { saveQuestions(); } catch (_) {}
                                    displayNRoundQuestions();
                                }
                                cleanup();
                            };
                        }
                        item.style.transform = 'translateX(0)';
                        return;
                    }
                    const entry = { imageUrl: q.imageUrl, questionId: String(q.dbId || q.id), reappearAt: new Date(Date.now() + POP_QUIZ_DELAY_MS).toISOString(), round: q.round || 0 };
                    popQuizItems.push(entry);
                    try { savePopQuizItems(); updatePopQuizBadge(); } catch (_) {}
                    // remove from list now that it’s queued
                    const idx = questions.findIndex(qq => qq.id === qid);
                    if (idx !== -1) {
                        questions.splice(idx, 1);
                        try { saveQuestions(); } catch (_) {}
                        displayNRoundQuestions();
                    }
                })();
                // microinteraction on pop quiz icon
                try {
                    const icon = document.querySelector('#navSettings i.fas.fa-question-circle');
                    if (icon && icon.animate) {
                        icon.animate([
                            { transform: 'scale(1)', filter: 'brightness(1)' },
                            { transform: 'scale(1.25)', filter: 'brightness(1.3)' },
                            { transform: 'scale(1)', filter: 'brightness(1)' }
                        ], { duration: 300, easing: 'ease-out' });
                    }
                } catch (_) {}
                // Best-effort DB persist
                (async () => {
                    try {
                        if (q.dbId) {
                            const base = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:3000';
                            await fetch(base + '/api/pop-quiz-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: String(q.dbId), nextAt: new Date(Date.now() + POP_QUIZ_DELAY_MS).toISOString() }) });
                        }
                    } catch (_) {}
                })();
                // Keep card in place; do not remove from list unless explicitly handled elsewhere
            }
            item.style.transform = 'translateX(0) rotate(0deg)';
        } else {
            item.style.transform = 'translateX(0) rotate(0deg)';
        }
    }

    item.addEventListener('touchstart', handleStart, { passive: true });
    item.addEventListener('mousedown', handleStart);
    item.addEventListener('touchmove', handleMove, { passive: true });
    item.addEventListener('mousemove', handleMove);
    item.addEventListener('touchend', handleEnd);
    item.addEventListener('mouseup', handleEnd);
}