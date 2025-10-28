// Reward Level System
// Level progression: 1->2 = 5 cards, each subsequent level = 1.5x previous (rounded)

const REWARD_LEVELS = [
    { level: 1, required: 0, title: '🌱 씨앗', badge: '새싹 학습자' },
    { level: 2, required: 5, title: '🌿 새싹', badge: '성실한 학습자' },
    { level: 3, required: 12, title: '🌳 나무', badge: '꾸준한 학습자' }, // 5 + 7
    { level: 4, required: 22, title: '🏆 달인', badge: '열정적인 학습자' }, // 12 + 10
    { level: 5, required: 37, title: '⭐ 스타', badge: '헌신적인 학습자' }, // 22 + 15
    { level: 6, required: 60, title: '💎 다이아', badge: '뛰어난 학습자' }, // 37 + 23
    { level: 7, required: 95, title: '👑 마스터', badge: '탁월한 학습자' }, // 60 + 35
    { level: 8, required: 148, title: '🔥 전설', badge: '전설적인 학습자' }, // 95 + 53
    { level: 9, required: 228, title: '⚡ 신화', badge: '신화적인 학습자' }, // 148 + 80
    { level: 10, required: 348, title: '🌟 초월', badge: '초월적인 학습자' } // 228 + 120
];

// Calculate level increment: 5 * (1.5^(n-1)) rounded
// Level 1->2: 5
// Level 2->3: 5 * 1.5 = 7.5 → 7 (rounded down in progression, but let me recalculate)
// Level 3->4: 7 * 1.5 = 10.5 → 10
// Level 4->5: 10 * 1.5 = 15
// Level 5->6: 15 * 1.5 = 22.5 → 23
// Level 6->7: 23 * 1.5 = 34.5 → 35
// Level 7->8: 35 * 1.5 = 52.5 → 53
// Level 8->9: 53 * 1.5 = 79.5 → 80
// Level 9->10: 80 * 1.5 = 120

function getCurrentLevel(achievementCount) {
    for (let i = REWARD_LEVELS.length - 1; i >= 0; i--) {
        if (achievementCount >= REWARD_LEVELS[i].required) {
            return REWARD_LEVELS[i];
        }
    }
    return REWARD_LEVELS[0];
}

function getNextLevel(currentLevel) {
    const currentIndex = REWARD_LEVELS.findIndex(l => l.level === currentLevel.level);
    if (currentIndex === -1 || currentIndex === REWARD_LEVELS.length - 1) {
        return null; // Max level reached
    }
    return REWARD_LEVELS[currentIndex + 1];
}

function getProgressToNextLevel(achievementCount) {
    const current = getCurrentLevel(achievementCount);
    const next = getNextLevel(current);
    
    if (!next) {
        return { current, next: null, progress: 100, remaining: 0 };
    }
    
    const currentRequired = current.required;
    const nextRequired = next.required;
    const progressInLevel = achievementCount - currentRequired;
    const totalNeeded = nextRequired - currentRequired;
    const progress = Math.min(100, Math.round((progressInLevel / totalNeeded) * 100));
    const remaining = Math.max(0, nextRequired - achievementCount);
    
    return { current, next, progress, remaining };
}

console.log('✅ Reward levels loaded successfully');

