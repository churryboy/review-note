// State management
let questions = [];
let popQuizItems = [];
let currentImageBlob = null;
let currentImageUrl = null;

// DOM elements
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
const nav0Round = document.getElementById('nav0Round');
const navNRound = document.getElementById('navNRound');
const navSettings = document.getElementById('navSettings');
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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Always treat as first-time user on refresh
    localStorage.removeItem('hasSeenCoaching');
    localStorage.removeItem('hasSeenListCoaching');
    sessionStorage.removeItem('shownListCoach');
    // Reset n회독 coaching flags for testing on every refresh
    sessionStorage.removeItem('shownNListCoach');
    sessionStorage.removeItem('nListCoachPending');

    loadQuestions();
    loadPopQuizItems();
    updateQuestionCount();
    updatePopQuizBadge();
    setupEventListeners();
    show0RoundView(); // Show 0회독 view by default
    startPopQuizTimer(); // Start random pop quiz timer
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
    nav0Round.addEventListener('click', show0RoundView);
    navNRound.addEventListener('click', showNRoundView);
    navSettings.addEventListener('click', showSettingsView);
    
    // Review navigation
    backToCameraFromReview.addEventListener('click', show0RoundView);

    // Solution navigation
    backFromSolution.addEventListener('click', returnToPreviousView);
    deleteSolutionQuestion.addEventListener('click', handleDeleteCurrentSolution);
    saveSolutionBtn.addEventListener('click', saveSolutionNotes);

    // Image popup (remove unused popup functionality)
    // popupClose.addEventListener('click', closeImagePopup);
    // imagePopupOverlay.addEventListener('click', (e) => {
    //     if (e.target === imagePopupOverlay) {
    //         closeImagePopup();
    //     }
    // });

    // Image review actions
    wrongBtn.addEventListener('click', () => categorizeQuestion('wrong'));
    ambiguousBtn.addEventListener('click', () => categorizeQuestion('ambiguous'));

    // Coaching guide
    coachingSkip.addEventListener('click', closeCoachingGuide);
    coachingNext.addEventListener('click', nextCoachingStep);
    coachingDone.addEventListener('click', closeCoachingGuide);

    // List coaching guide
    listCoachingSkip.addEventListener('click', closeListCoachingGuide);
    listCoachingNext.addEventListener('click', nextListCoachingStep);
    listCoachingDone.addEventListener('click', closeListCoachingGuide);

    // N-round coaching guide
    nListCoachingSkip.addEventListener('click', closeNListCoachingGuide);
    nListCoachingNext.addEventListener('click', nextNListCoachingStep);
    nListCoachingDone.addEventListener('click', closeNListCoachingGuide);

    // Set up swipe gestures
    setupSwipeGestures();
}

// Show 0회독 view
function show0RoundView() {
    round0View.style.display = 'block';
    roundNView.style.display = 'none';
    settingsView.style.display = 'none';
    imageReviewView.style.display = 'none';
    solutionView.style.display = 'none';
    
    nav0Round.classList.add('active');
    navNRound.classList.remove('active');
    navSettings.classList.remove('active');
    
    display0RoundQuestions();
}

// Show n회독 view
function showNRoundView() {
    round0View.style.display = 'none';
    roundNView.style.display = 'block';
    settingsView.style.display = 'none';
    imageReviewView.style.display = 'none';
    solutionView.style.display = 'none';
    
    nav0Round.classList.remove('active');
    navNRound.classList.add('active');
    navSettings.classList.remove('active');
    
    displayNRoundQuestions();
}

// Show settings view (Pop Quiz)
function showSettingsView() {
    round0View.style.display = 'none';
    roundNView.style.display = 'none';
    settingsView.style.display = 'block';
    imageReviewView.style.display = 'none';
    solutionView.style.display = 'none';
    
    nav0Round.classList.remove('active');
    navNRound.classList.remove('active');
    navSettings.classList.add('active');
    
    displayPopQuiz();
}

// Show image review view
function showImageReviewView() {
    round0View.style.display = 'none';
    roundNView.style.display = 'none';
    settingsView.style.display = 'none';
    imageReviewView.style.display = 'flex';
    solutionView.style.display = 'none';
    
    // Show coaching guide for first-time users
    checkAndShowCoachingGuide();
}

// Handle image capture
async function handleImageCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Store the image file and create URL for display
    currentImageBlob = file;
    currentImageUrl = URL.createObjectURL(file);
    
    // Show the image in review view
    reviewImage.src = currentImageUrl;
    showImageReviewView();
    
    // Clear the input
    cameraInput.value = '';
}

// Categorize question and store locally
function categorizeQuestion(category) {
    if (!currentImageBlob) return;

    // Determine pre-count of 0회독 items before adding
    const preCountRound0 = questions.filter(q => q.round === 0).length;

    // Convert image to base64 for storage immediately
    const reader = new FileReader();
    reader.onload = function(e) {
        // Create new question entry
        const newQuestion = {
            id: Date.now(),
            questionNumber: '문제 ' + (questions.length + 1),
            publisher: '출처모름',
            questionText: '이미지 문제',
            answerChoices: [],
            handwrittenNotes: '',
            imageUrl: e.target.result, // Base64 image data
            category: category,
            round: 0, // Start in 0회독
            timestamp: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            solutionNotes: '' // For storing solution process
        };

        questions.unshift(newQuestion); // Add to beginning of array
        saveQuestions();
        updateQuestionCount();

        // Show success feedback
        const categoryText = category === 'ambiguous' ? '애매한 문제' : '틀린 문제';
        showToast(`${categoryText}로 저장되었습니다!`);
        
        // Clean up and go back to 0회독 view
        cleanupCurrentImage();
        show0RoundView();
        
        // Show list coaching the first time 0회독 transitions from 0 → 1
        if (preCountRound0 === 0 && !sessionStorage.getItem('shownListCoach')) {
            setTimeout(() => {
                console.log('Triggering list coaching after first card created');
                showListCoachingGuide();
            }, 300); // small delay to ensure list rendered
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
}

// Display questions in 0회독 view
function display0RoundQuestions() {
    const round0Questions = questions.filter(q => q.round === 0);
    
    if (round0Questions.length === 0) {
        round0List.style.display = 'none';
        round0Empty.style.display = 'block';
        return;
    }

    round0List.style.display = 'block';
    round0Empty.style.display = 'none';

    round0List.innerHTML = round0Questions.map(question => `
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

    // Add click handlers and swipe functionality
    document.querySelectorAll('#round0List .question-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Item clicked:', item.dataset.id);
            
            // Only open solution if not currently swiping
            if (!item.classList.contains('swiping')) {
                const questionId = parseInt(item.dataset.id);
                console.log('Opening solution for question:', questionId);
                showSolutionView(questionId, '0회독');
            } else {
                console.log('Item is swiping, ignoring click');
            }
        });
        
        // Add swipe functionality
        console.log('Setting up 0회독 swipe for item:', item.dataset.id);
        console.log('Item element:', item);
        setupQuestionSwipe(item);
    });
}

// Display questions in n회독 view
function displayNRoundQuestions() {
    const roundNQuestions = questions.filter(q => q.round > 0);
    
    if (roundNQuestions.length === 0) {
        roundNList.style.display = 'none';
        roundNEmpty.style.display = 'block';
        return;
    }

    roundNList.style.display = 'block';
    roundNEmpty.style.display = 'none';

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

    // Add click handlers and swipe functionality
    document.querySelectorAll('#roundNList .question-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('N-round item clicked:', item.dataset.id);
            
            // Only open solution if not currently swiping
            if (!item.classList.contains('swiping')) {
                const questionId = parseInt(item.dataset.id);
                console.log('Opening solution for N-round question:', questionId);
                showSolutionView(questionId, 'n회독');
            } else {
                console.log('N-round item is swiping, ignoring click');
            }
        });
        
        // Add swipe functionality for n회독 items
        console.log('Setting up n회독 swipe for item:', item.dataset.id);
        setupNRoundSwipe(item);
    });

    // Show n회독 coaching only when: first n회독 card exists AND user is on n회독 page
    if (
        roundNQuestions.length === 1 &&
        sessionStorage.getItem('nListCoachPending') === 'true' &&
        !sessionStorage.getItem('shownNListCoach')
    ) {
        setTimeout(() => {
            console.log('Triggering n회독 coaching after entering n회독 with first card');
            showNListCoachingGuide();
            sessionStorage.removeItem('nListCoachPending');
        }, 200);
    }
}

// Show solution view
function showSolutionView(questionId, fromView) {
    console.log('showSolutionView called with ID:', questionId, 'from:', fromView);
    const question = questions.find(q => q.id === questionId);
    console.log('Found question:', question);
    
    if (!question) {
        console.log('Question not found!');
        return;
    }

    // Update last accessed time
    question.lastAccessed = new Date().toISOString();
    saveQuestions();

    // Populate solution view
    document.getElementById('solutionQuestionNumber').textContent = question.questionNumber;
    document.getElementById('solutionPublisher').textContent = question.publisher || '출처모름';
    document.getElementById('solutionTimestamp').textContent = new Date(question.lastAccessed).toLocaleString('ko-KR');

    const solutionCategory = document.getElementById('solutionCategory');
    solutionCategory.textContent = question.category === 'ambiguous' ? '애매함' : '틀림';
    solutionCategory.className = `solution-category ${question.category}`;

    document.getElementById('solutionImage').src = question.imageUrl;
    
    // Load existing solution notes
    solutionNotes.value = question.solutionNotes || '';

    // Store current question id and source view for navigation
    solutionView.dataset.currentId = String(question.id);
    solutionView.dataset.fromView = fromView;

    // Show solution view
    round0View.style.display = 'none';
    roundNView.style.display = 'none';
    settingsView.style.display = 'none';
    imageReviewView.style.display = 'none';
    solutionView.style.display = 'flex';
    
    console.log('Solution view should now be visible');
}

// Return to previous view
function returnToPreviousView() {
    const fromView = solutionView.dataset.fromView;
    
    if (fromView === 'n회독') {
        showNRoundView();
    } else {
        show0RoundView();
    }
}

// Save solution notes
function saveSolutionNotes() {
    const questionId = parseInt(solutionView.dataset.currentId);
    const question = questions.find(q => q.id === questionId);
    
    if (question) {
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
        returnToPreviousView();
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
    totalQuestionCount.textContent = questions.length + '개';
}

// Update pop quiz badge
function updatePopQuizBadge() {
    if (popQuizItems.length > 0) {
        quizBadge.textContent = popQuizItems.length;
        quizBadge.style.display = 'flex';
    } else {
        quizBadge.style.display = 'none';
    }
    
    // Update waiting count
    if (popQuizWaitingCount) {
        popQuizWaitingCount.textContent = popQuizItems.length + '개';
    }
}

// Display pop quiz
function displayPopQuiz() {
    // For now, show a simple message or random question
    // This can be enhanced with actual random timing logic
    if (popQuizItems.length === 0) {
        popQuizContainer.style.display = 'none';
        popQuizEmpty.style.display = 'block';
    } else {
        // Show a random question or just show that there are items waiting
        popQuizContainer.style.display = 'none';
        popQuizEmpty.style.display = 'block';
        // The actual pop quiz will be triggered randomly, not when viewing this page
    }
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

// Show toast notification
function showToast(message, type = 'success') {
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
        const preCountNRound = questions.filter(q => q.round > 0).length;

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
            incrementRound(parseInt(item.dataset.id));
            item.style.transform = 'translateX(0)';
            item.style.opacity = '1';
            item.style.backgroundColor = '';
            
            setTimeout(() => {
                displayNRoundQuestions(); // Refresh n회독 list
            }, 100);
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
        showToast('팝퀴즈로 이동했습니다!');
    }
}

// Start pop quiz timer
function startPopQuizTimer() {
    // Check for pop quiz every 30 seconds to 2 minutes (random interval)
    function scheduleNextCheck() {
        const minInterval = 30000; // 30 seconds
        const maxInterval = 120000; // 2 minutes
        const interval = Math.random() * (maxInterval - minInterval) + minInterval;
        
        setTimeout(() => {
            checkForPopQuiz();
            scheduleNextCheck(); // Schedule next check
        }, interval);
    }
    
    scheduleNextCheck();
}

// Check if we should show a pop quiz
function checkForPopQuiz() {
    if (popQuizItems.length === 0) return;
    
    // 20% chance to show a pop quiz when there are items available
    if (Math.random() < 0.2) {
        showRandomPopQuiz();
    }
}

// Show a random pop quiz
function showRandomPopQuiz() {
    if (popQuizItems.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * popQuizItems.length);
    const quizItem = popQuizItems[randomIndex];
    
    // Remove from pop quiz items and add back to questions with higher round
    popQuizItems.splice(randomIndex, 1);
    quizItem.round += 1;
    quizItem.lastAccessed = new Date().toISOString();
    questions.unshift(quizItem);
    
    saveQuestions();
    savePopQuizItems();
    updatePopQuizBadge();
    
    // Show notification
    showToast(`팝퀴즈! ${quizItem.questionNumber}이 나타났습니다!`, 'success');
    
    // Update displays if currently viewing relevant pages
    if (round0View.style.display !== 'none') {
        display0RoundQuestions();
    } else if (roundNView.style.display !== 'none') {
                 displayNRoundQuestions();
     }
}

// Check and show coaching guide for first-time users
function checkAndShowCoachingGuide() {
    const hasSeenCoaching = localStorage.getItem('hasSeenCoaching');
    if (!hasSeenCoaching) {
        showCoachingGuide();
    }
}

// Show coaching guide
function showCoachingGuide() {
    coachingOverlay.style.display = 'flex';
    // Reset to first step
    document.querySelectorAll('.coaching-step').forEach(step => step.classList.remove('active'));
    document.getElementById('step1').classList.add('active');
    document.querySelectorAll('.step-dot').forEach(dot => dot.classList.remove('active'));
    document.querySelector('.step-dot[data-step="1"]').classList.add('active');
    coachingNext.style.display = 'block';
    coachingDone.style.display = 'none';
}

// Close coaching guide
function closeCoachingGuide() {
    coachingOverlay.style.display = 'none';
    localStorage.setItem('hasSeenCoaching', 'true');
}

// Next coaching step
function nextCoachingStep() {
    const currentStep = document.querySelector('.coaching-step.active');
    const currentStepId = currentStep.id;
    
    if (currentStepId === 'step1') {
        // Move to step 2
        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');
        document.querySelector('.step-dot[data-step="1"]').classList.remove('active');
        document.querySelector('.step-dot[data-step="2"]').classList.add('active');
                 coachingNext.style.display = 'none';
         coachingDone.style.display = 'block';
     }
}

// Check and show list coaching guide
function checkAndShowListCoaching() {
    const hasSeenListCoaching = localStorage.getItem('hasSeenListCoaching');
    if (!hasSeenListCoaching) {
        showListCoachingGuide();
    }
}

// Show list coaching guide
function showListCoachingGuide() {
    listCoachingOverlay.style.display = 'flex';
    // Reset to first step
    document.querySelectorAll('#listCoachingOverlay .coaching-step').forEach(step => step.classList.remove('active'));
    document.getElementById('listStep1').classList.add('active');
    document.querySelectorAll('#listCoachingOverlay .step-dot').forEach(dot => dot.classList.remove('active'));
    document.querySelector('#listCoachingOverlay .step-dot[data-step="1"]').classList.add('active');
    listCoachingNext.style.display = 'block';
    listCoachingDone.style.display = 'none';
    // Mark shown for this session to avoid duplicates until refresh
    sessionStorage.setItem('shownListCoach', 'true');
}

// Close list coaching guide
function closeListCoachingGuide() {
    listCoachingOverlay.style.display = 'none';
    localStorage.setItem('hasSeenListCoaching', 'true');
}

// Next list coaching step
function nextListCoachingStep() {
    const currentStep = document.querySelector('#listCoachingOverlay .coaching-step.active');
    const currentStepId = currentStep.id;
    
    if (currentStepId === 'listStep1') {
        // Move to step 2
        document.getElementById('listStep1').classList.remove('active');
        document.getElementById('listStep2').classList.add('active');
        document.querySelector('#listCoachingOverlay .step-dot[data-step="1"]').classList.remove('active');
        document.querySelector('#listCoachingOverlay .step-dot[data-step="2"]').classList.add('active');
        listCoachingNext.style.display = 'none';
        listCoachingDone.style.display = 'block';
    }
} 

// N-round coaching helpers
function showNListCoachingGuide() {
    nListCoachingOverlay.style.display = 'flex';
    document.querySelectorAll('#nListCoachingOverlay .coaching-step').forEach(step => step.classList.remove('active'));
    document.getElementById('nListStep1').classList.add('active');
    document.querySelectorAll('#nListCoachingOverlay .step-dot').forEach(dot => dot.classList.remove('active'));
    document.querySelector('#nListCoachingOverlay .step-dot[data-step="1"]').classList.add('active');
    nListCoachingNext.style.display = 'block';
    nListCoachingDone.style.display = 'none';
    sessionStorage.setItem('shownNListCoach', 'true');
}

function closeNListCoachingGuide() {
    nListCoachingOverlay.style.display = 'none';
    localStorage.setItem('hasSeenNListCoaching', 'true');
}

function nextNListCoachingStep() {
    const currentStep = document.querySelector('#nListCoachingOverlay .coaching-step.active');
    const currentStepId = currentStep.id;
    
    if (currentStepId === 'nListStep1') {
        document.getElementById('nListStep1').classList.remove('active');
        document.getElementById('nListStep2').classList.add('active');
        document.querySelector('#nListCoachingOverlay .step-dot[data-step="1"]').classList.remove('active');
        document.querySelector('#nListCoachingOverlay .step-dot[data-step="2"]').classList.add('active');
        nListCoachingNext.style.display = 'none';
        nListCoachingDone.style.display = 'block';
    }
} 