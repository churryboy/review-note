// State management
let questions = [];
let popQuizItems = [];
let currentImageBlob = null;
let currentImageUrl = null;
let currentImageHash = null;
let achievements = [];

// Constants
const POP_QUIZ_DELAY_MS = 10 * 1000; // 10 seconds readiness delay
const POP_QUIZ_REAPPEAR_MS = 24 * 60 * 60 * 1000; // 1 day for wrong answers

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
    const idx = quizModal && quizModal.dataset.index ? parseInt(quizModal.dataset.index) : undefined;
    handleSuccessLater(idx);
});
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
    // Disable all coaching: clear and do not set again
    localStorage.removeItem('hasSeenCoaching');
    localStorage.removeItem('hasSeenListCoaching');
    sessionStorage.removeItem('shownListCoach');
    sessionStorage.removeItem('shownNListCoach');
    sessionStorage.removeItem('nListCoachPending');

    loadQuestions();
    loadPopQuizItems();
    loadAnswerByHash();
    loadAchievements();
    updateQuestionCount();
    updatePopQuizBadge();
    setupEventListeners();
    showNRoundView();
    startPopQuizTimer();
});

// Set up event listeners
function setupEventListeners() {
    // Floating camera button
    floatingCameraBtn.addEventListener('click', () => {
        cameraInput.click();
    });

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
                const sid = shortIdFromHash(currentImageHash);
                dbg.textContent = `${sid} - ${(reviewAnswerInput.value || '').trim()}`;
                dbg.style.display = 'block';
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
    saveQuestions();
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
    for (let i = 1; i < 7; i++) {
        increments[i] = Math.round(increments[i - 1] * 1.8);
    }
    return increments; // length 7 for 8 tiers
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
    const maxRank = 8;
    if (rank > maxRank) rank = maxRank;
    const nextStepSize = stepIndex < inc.length ? inc[stepIndex] : 0;
    const inStepProgress = Math.max(0, achieveCount - prevTotal);
    const remaining = Math.max(0, nextStepSize - inStepProgress);
    const progressRatio = nextStepSize > 0 ? Math.min(1, inStepProgress / nextStepSize) : 1;
    return { rank, maxRank, achieveCount, nextStepSize, inStepProgress, remaining, progressRatio };
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
        if (info.rank >= info.maxRank) {
            status.innerHTML = `
                <div class="rank-panel">
                    <div class="rank-header">오답노트 랭커</div>
                    <div class="rank-stats">
                        <span>현재 등급: <strong>${info.rank}/${info.maxRank}</strong></span>
                        <span>총 성취: <strong>${info.achieveCount}개</strong></span>
                        <span>다음 등급: <strong>최고 등급 도달</strong></span>
                    </div>
                    <div class="rank-progress"><div class="rank-progress-bar" style="width:100%"></div></div>
                </div>`;
        } else {
            const percent = Math.round(info.progressRatio * 100);
            status.innerHTML = `
                <div class="rank-panel">
                    <div class="rank-header">오답노트 랭커</div>
                    <div class="rank-stats">
                        <span>현재 등급: <strong>${info.rank}/${info.maxRank}</strong></span>
                        <span>총 성취: <strong>${info.achieveCount}개</strong></span>
                        <span>다음 등급까지: <strong>${info.remaining}개</strong></span>
                    </div>
                    <div class="rank-progress"><div class="rank-progress-bar" style="width:${percent}%"></div></div>
                </div>`;
        }
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
            if (dbg && currentImageHash) {
                const ans = answerByHash[currentImageHash] || '';
                const sid = shortIdFromHash(currentImageHash);
                dbg.textContent = `${sid} - ${ans}`;
                dbg.style.display = 'block';
            }
        };
        fr.readAsDataURL(file);
    } catch (_) {}
    
    reviewImage.src = currentImageUrl;
    const reviewAnswerInput = document.getElementById('reviewAnswerInput');
    if (reviewAnswerInput) reviewAnswerInput.value = '';
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
                setTimeout(() => { sys.style.display = 'none'; }, 180);
            }, 1500);
        }
        return;
    }

    const preCountNRound = questions.filter(q => (q.round ?? -1) >= 0).length;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl = e.target.result;
        const imageHash = currentImageHash || await computeSHA256HexFromDataUrl(dataUrl);
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
        saveQuestions();
        updateQuestionCount();

        const sys = document.getElementById('solutionSystemMsg');
        if (sys) {
            sys.textContent = (category === 'ambiguous') ? '애매한 문제로 저장되었습니다' : '틀린 문제로 저장되었습니다';
            sys.style.display = 'block';
            sys.classList.add('show');
            setTimeout(() => {
                sys.classList.remove('show');
                setTimeout(() => { sys.style.display = 'none'; }, 180);
            }, 1500);
        }
        
        cleanupCurrentImage();
        showNRoundView();
        
        if (preCountNRound === 0) {
            sessionStorage.removeItem('nListCoachPending');
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
                                ${question.category ? `<span class="question-category ${question.category}">${question.category === 'ambiguous' ? '애매함' : '틀림'}</span>` : ''}
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
    // Removed: solutionPublisher and solutionTimestamp UI

    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = question.category === 'ambiguous' ? '애매함' : '틀림';
    solutionCategory.className = `solution-category ${question.category}`;

    document.getElementById('solutionImage').src = question.imageUrl;

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
            const dbg = document.getElementById('solutionDebugHash');
            if (dbg) {
                const ans = (solutionAnswerInput.value || '').trim();
                const sid = shortIdFromHash(hash);
                dbg.textContent = `${sid} - ${ans}`;
                dbg.style.display = 'block';
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
                <div class="question-source">${item.publisher || '출처모름'}</div>
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
    localStorage.setItem('reviewNoteQuestions', JSON.stringify(questions));
}

// Load questions from localStorage
function loadQuestions() {
    const saved = localStorage.getItem('reviewNoteQuestions');
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
    localStorage.setItem('reviewNotePopQuiz', JSON.stringify(popQuizItems));
}

// Load pop quiz items from localStorage
function loadPopQuizItems() {
    const saved = localStorage.getItem('reviewNotePopQuiz');
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
    localStorage.setItem('reviewNoteAchievements', JSON.stringify(achievements));
}

function loadAchievements() {
    const saved = localStorage.getItem('reviewNoteAchievements');
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
    try {
        localStorage.setItem('reviewNoteAnswerByHash', JSON.stringify(answerByHash));
    } catch (_) {}
}
function loadAnswerByHash() {
    const saved = localStorage.getItem('reviewNoteAnswerByHash');
    if (saved) {
        try {
            answerByHash = JSON.parse(saved) || {};
        } catch (e) {
            answerByHash = {};
        }
    }
}

async function saveAnswerForHash(imageHash, answer) {
    if (!imageHash) return;
    const val = (answer || '').trim();
    answerByHash[imageHash] = val;
    saveAnswerByHash();
    try {
        await fetch('/api/answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageHash, answer: val })
        });
    } catch (_) {}
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
async function ensureQuestionImageHash(question) {
    if (question.imageHash) return question.imageHash;
    if (!question.imageUrl) return null;
    const hash = await computeSHA256HexFromDataUrl(question.imageUrl);
    if (hash) {
        question.imageHash = hash;
        saveQuestions();
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
    console.log('setupQuestionSwipe called for item:', item.dataset.id);
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;

    console.log('Adding touch event listeners to item');
    item.addEventListener('touchstart', handleStart, { passive: false });
    item.addEventListener('touchmove', handleMove, { passive: false });
    item.addEventListener('touchend', handleEnd, { passive: false });

    // Mouse events for desktop testing
    console.log('Adding mouse event listeners to item');
    item.addEventListener('mousedown', handleStart);
    item.addEventListener('mousemove', handleMove);
    item.addEventListener('mouseup', handleEnd);
    item.addEventListener('mouseleave', handleEnd);

    function handleStart(e) {
        isDragging = true;
        // Don't add 'swiping' class immediately - wait for actual movement

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        currentX = clientX;
        currentY = clientY;
    }

    function handleMove(e) {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX;
        currentY = clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        console.log('Move detected - deltaX:', deltaX, 'deltaY:', deltaY);

        // Start swiping mode if horizontal movement is significant
        if (Math.abs(deltaX) > 10) {
            console.log('Starting swipe mode');
            item.classList.add('swiping');
            e.preventDefault();
            e.stopPropagation();
        }

        // Only allow horizontal swiping
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaX) < 20) return;

        // Update item position
        item.style.transform = `translateX(${deltaX}px)`;
        item.style.opacity = Math.max(0.3, 1 - Math.abs(deltaX) / 200);

        // Show visual feedback for swipe direction
        if (deltaX < -30) {
            item.style.backgroundColor = '#e8f5e8'; // Green tint for n회독
        } else if (deltaX > 30) {
            item.style.backgroundColor = '#ffe8e8'; // Red tint for delete
        } else {
            item.style.backgroundColor = '';
        }
    }

    function handleEnd(e) {
        if (!isDragging) return;
        console.log('0회독 Touch/mouse end detected');
        isDragging = false;
        
        const deltaX = currentX - startX;
        const threshold = 100;
        console.log('0회독 Final deltaX:', deltaX, 'threshold:', threshold);
        
        setTimeout(() => {
            item.classList.remove('swiping');
        }, 100);

        if (deltaX < -threshold) {
            // Swiped left - Move to n회독
            console.log('0회독 Swiped left - moving to n회독');
            moveToNRound(parseInt(item.dataset.id));
            item.style.transform = 'translateX(-100%)';
            item.style.opacity = '0';
            
            setTimeout(() => {
                display0RoundQuestions(); // Refresh 0회독 list
            }, 300);
        } else if (deltaX > threshold) {
            // Swiped right - Delete
            console.log('0회독 Swiped right - deleting');
            deleteQuestion0Round(parseInt(item.dataset.id));
            item.style.transform = 'translateX(100%)';
            item.style.opacity = '0';
            
            setTimeout(() => {
                display0RoundQuestions(); // Refresh 0회독 list
            }, 300);
        } else {
            // Snap back to original position
            console.log('0회독 Snapping back to center');
            item.style.transform = 'translateX(0)';
            item.style.opacity = '1';
            item.style.backgroundColor = '';
        }
    }
}

// Move question to n회독
function moveToNRound(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        // Capture pre-count of n회독 items
        const preCountNRound = questions.filter(q => (q.round ?? -1) >= 0).length;

        questions[questionIndex].round = 1; // Move to 1회독
        saveQuestions();
        showToast('n회독으로 이동했습니다!');

        // Mark coaching pending if this creates the first n회독 card
        if (preCountNRound === 0) {
            sessionStorage.setItem('nListCoachPending', 'true');
        }
    }
}

// Delete question from 0회독
function deleteQuestion0Round(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        questions.splice(questionIndex, 1); // Remove from questions
        saveQuestions();
        updateQuestionCount();
        showToast('문제가 삭제되었습니다!');
    }
}

// Set up swipe gestures for n회독 items
function setupNRoundSwipe(item) {
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
        console.log('Touch/mouse start detected on 0회독 item');
        isDragging = true;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        currentX = clientX;
        currentY = clientY;
    }

    function handleMove(e) {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX;
        currentY = clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // Start swiping mode if horizontal movement is significant
        if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY)) {
            item.classList.add('swiping');
            e.preventDefault();
        }

        // Only allow horizontal swiping
        if (Math.abs(deltaY) > Math.abs(deltaX)) return;

        // Update item position
        item.style.transform = `translateX(${deltaX}px)`;
        item.style.opacity = Math.max(0.3, 1 - Math.abs(deltaX) / 200);

        // Show visual feedback for swipe direction
        if (deltaX < -30) {
            item.style.backgroundColor = '#e8f5e8'; // Green tint for round increment
        } else if (deltaX > 30) {
            item.style.backgroundColor = '#fff3e0'; // Orange tint for pop quiz
        } else {
            item.style.backgroundColor = '';
        }
    }

    function handleEnd(e) {
        if (!isDragging) return;
        console.log('n회독 Touch/mouse end detected');
        isDragging = false;
        
        const deltaX = currentX - startX;
        const threshold = 100;
        console.log('n회독 Final deltaX:', deltaX, 'threshold:', threshold);
        
        setTimeout(() => {
            item.classList.remove('swiping');
        }, 100);

        if (deltaX < -threshold) {
            // Swiped left - Increment round count
            console.log('n회독 Swiped left - incrementing round');
            const id = parseInt(item.dataset.id);
            incrementRound(id);
            item.style.transform = 'translateX(0)';
            item.style.opacity = '1';
            item.style.backgroundColor = '';
            // Update round label in-place without re-rendering the list
            const roundEl = item.querySelector('.question-round');
            const q = questions.find(q => q.id === id);
            if (roundEl && q) {
                roundEl.textContent = `${q.round}회독`;
                roundEl.style.backgroundColor = computeRoundColor(q.round || 0);
                roundEl.classList.add('bump');
                setTimeout(() => roundEl.classList.remove('bump'), 300);
            }
        } else if (deltaX > threshold) {
            // Swiped right - Move to 팝퀴즈
            console.log('n회독 Swiped right - moving to pop quiz');
            moveToPopQuiz(parseInt(item.dataset.id));
            item.style.transform = 'translateX(100%)';
            item.style.opacity = '0';
            
            setTimeout(() => {
                displayNRoundQuestions(); // Refresh n회독 list
                updatePopQuizBadge(); // Update notification badge
            }, 300);
        } else {
            // Snap back to original position
            console.log('n회독 Snapping back to center');
            item.style.transform = 'translateX(0)';
            item.style.opacity = '1';
            item.style.backgroundColor = '';
        }
    }
}

// Increment round count
function incrementRound(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        questions[questionIndex].round += 1;
        questions[questionIndex].lastAccessed = new Date().toISOString();
        saveQuestions();
        showToast(`${questions[questionIndex].round}회독으로 업데이트되었습니다!`);
    }
}

// Move question to pop quiz
function moveToPopQuiz(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        const question = questions[questionIndex];
        question.popQuizAdded = new Date().toISOString();
        popQuizItems.push(question);
        questions.splice(questionIndex, 1); // Remove from main questions
        saveQuestions();
        savePopQuizItems();
        // Update status immediately so stats reflect at swipe time
        updatePopQuizBadge();
        displayPopQuiz();
        // Pulse the 팝퀴즈 icon to indicate movement
        if (navSettings) {
            navSettings.classList.add('popquiz-pulse');
            const removePulse = () => {
                navSettings.classList.remove('popquiz-pulse');
                navSettings.removeEventListener('animationend', removePulse);
            };
            navSettings.addEventListener('animationend', removePulse);
        }
    }
}

// Start pop quiz timer
function startPopQuizTimer() {
    setInterval(() => {
        updatePopQuizBadge();
        if (settingsView.style.display !== 'none') {
            displayPopQuiz();
        }
    }, 2000); // poll every 2s for snappier 10s readiness
}

// Check if we should show a pop quiz (kept for compatibility)
function checkForPopQuiz() {
    // No-op: display is handled in displayPopQuiz with 5-minute readiness
}

// Show a random pop quiz (kept for compatibility)
function showRandomPopQuiz() {
    // No-op: display is handled via displayPopQuiz filtering by readiness
}

// Remove all coaching features: make functions no-ops
function checkAndShowCoachingGuide() {}
function showCoachingGuide() {}
function closeCoachingGuide() {}
function nextCoachingStep() {}
function checkAndShowListCoaching() {}
function showListCoachingGuide() {}
function closeListCoachingGuide() {}
function nextListCoachingStep() {}
function showNListCoachingGuide() {}
function closeNListCoachingGuide() {}
function nextNListCoachingStep() {} 

function computeRoundColor(round) {
    const r = Math.max(0, Math.min(10, round));
    // Interpolate from blue (#1e88e5) to red (#e53935)
    const from = { r: 0x1e, g: 0x88, b: 0xe5 };
    const to   = { r: 0xe5, g: 0x39, b: 0x35 };
    const t = r / 10;
    const mix = (a, b) => Math.round(a + (b - a) * t);
    const rr = mix(from.r, to.r);
    const gg = mix(from.g, to.g);
    const bb = mix(from.b, to.b);
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(rr)}${hex(gg)}${hex(bb)}`;
}

function applyRoundBadgeStyles(container) {
    if (!container) return;
    container.querySelectorAll('.question-item').forEach(item => {
        const id = parseInt(item.dataset.id);
        const q = questions.find(x => x.id === id);
        const el = item.querySelector('.question-round');
        if (q && el) {
            el.style.backgroundColor = computeRoundColor(q.round || 0);
        }
    });
} 