/**
 * Storage Module - LocalStorage Abstraction
 * Centralized storage operations with error handling
 */

const Storage = {
    // Storage keys
    KEYS: {
        QUESTIONS: 'questions',
        POP_QUIZ: 'popQuizItems',
        ACHIEVEMENTS: 'achievements',
        ANSWERS: 'answersByHash',
        TUTORIAL_SEEN: 'tutorialSeen',
        WORK_PROCESS: 'workProcessImages'
    },

    /**
     * Get item from localStorage with JSON parsing
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Storage get error for ${key}:`, error);
            return defaultValue;
        }
    },

    /**
     * Set item in localStorage with JSON stringification
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Storage set error for ${key}:`, error);
            return false;
        }
    },

    /**
     * Remove item from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Storage remove error for ${key}:`, error);
            return false;
        }
    },

    /**
     * Clear all localStorage
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    },

    // Convenience methods for specific data
    getQuestions() {
        return this.get(this.KEYS.QUESTIONS, []);
    },

    setQuestions(questions) {
        return this.set(this.KEYS.QUESTIONS, questions);
    },

    getPopQuiz() {
        return this.get(this.KEYS.POP_QUIZ, []);
    },

    setPopQuiz(items) {
        return this.set(this.KEYS.POP_QUIZ, items);
    },

    getAchievements() {
        return this.get(this.KEYS.ACHIEVEMENTS, []);
    },

    setAchievements(achievements) {
        return this.set(this.KEYS.ACHIEVEMENTS, achievements);
    },

    getAnswers() {
        return this.get(this.KEYS.ANSWERS, {});
    },

    setAnswers(answers) {
        return this.set(this.KEYS.ANSWERS, answers);
    },

    getTutorialSeen() {
        return this.get(this.KEYS.TUTORIAL_SEEN, false);
    },

    setTutorialSeen(seen = true) {
        return this.set(this.KEYS.TUTORIAL_SEEN, seen);
    },

    getWorkProcessImages() {
        return this.get(this.KEYS.WORK_PROCESS, {});
    },

    setWorkProcessImages(images) {
        return this.set(this.KEYS.WORK_PROCESS, images);
    }
};

// Export for use in main script
window.Storage = Storage;

