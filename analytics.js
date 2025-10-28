/**
 * Analytics Module - Mixpanel Integration
 * Handles all analytics tracking and user identification
 */

class Analytics {
    constructor() {
        this.initialized = false;
        this.retryCount = 0;
        this.maxRetries = 10;
        this.init();
    }
    
    init() {
        // Check if we have both Mixpanel and token
        if (typeof window.mixpanel !== 'undefined' && 
            window.mixpanel && 
            typeof window.mixpanel.init === 'function' && 
            window.MIXPANEL_TOKEN) {
            try {
                window.mixpanel.init(window.MIXPANEL_TOKEN, {
                    debug: false,
                    track_pageview: true,
                    persistence: 'localStorage'
                });
                this.initialized = true;
                console.log('✅ Analytics initialized');
                
                // Set user properties if available
                if (window.currentUserId) {
                    this.identify(window.currentUserId);
                }
            } catch (error) {
                console.error('Analytics init failed:', error);
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    setTimeout(() => this.init(), 500);
                }
            }
        } else if (this.retryCount < this.maxRetries) {
            // Retry initialization after a short delay
            this.retryCount++;
            setTimeout(() => this.init(), 300);
        }
    }
    
    identify(userId, properties = {}) {
        if (this.initialized && userId) {
            try {
                window.mixpanel.identify(userId);
                window.mixpanel.people.set({
                    '$last_seen': new Date(),
                    'user_id': userId,
                    ...properties
                });
                console.log('📊 Analytics identified:', userId);
            } catch (error) {
                console.error('Analytics identify failed:', error);
            }
        }
    }
    
    track(eventName, properties = {}) {
        if (this.initialized) {
            try {
                const commonProps = {
                    timestamp: new Date().toISOString(),
                    user_id: window.currentUserId || 'anonymous',
                    page_url: window.location.href
                };
                
                window.mixpanel.track(eventName, { ...commonProps, ...properties });
            } catch (error) {
                console.error('Analytics track failed:', error);
            }
        }
    }
}

// Initialize analytics
let analytics;

function initAnalytics() {
    if (!analytics) {
        analytics = new Analytics();
    }
}

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
    initAnalytics();
}

// Export for use in main script
window.analytics = analytics;

