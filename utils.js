/**
 * Utilities Module - Common helper functions
 */

const Utils = {
    /**
     * Normalize answer string for comparison
     */
    normalizeAnswer(value) {
        if (!value) return '';
        return String(value).trim().toLowerCase().replace(/\s+/g, '');
    },

    /**
     * Generate storage key with user ID
     */
    storageKey(base, userId = window.currentUserId) {
        const uid = userId || 'anon';
        return `${base}::${uid}`;
    },

    /**
     * Simple hash function for strings
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    },

    /**
     * Convert base64 to Uint8Array
     */
    base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    },

    /**
     * Convert DataURL to Blob
     */
    dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        if (parts.length !== 2) {
            throw new Error('Invalid dataUrl format');
        }
        
        const mimeMatch = parts[0].match(/:(.*?);/);
        if (!mimeMatch) {
            throw new Error('Cannot extract mime type');
        }
        
        const mime = mimeMatch[1];
        const base64 = parts[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        
        return new Blob([array], { type: mime });
    },

    /**
     * Compute SHA-256 hash from DataURL
     */
    async computeSHA256FromDataUrl(dataUrl) {
        try {
            const base64Data = dataUrl.split(',')[1];
            const bytes = this.base64ToUint8Array(base64Data);
            const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error('Hash computation error:', error);
            return this.simpleHash(dataUrl);
        }
    },

    /**
     * Compute SHA-256 hash from string
     */
    async computeSHA256FromString(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Compress image DataURL
     */
    async compressDataUrl(dataUrl, maxSize = 800, quality = 0.75) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#00C851' : '#ff1744'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            animation: slideDown 0.3s ease;
            font-weight: 500;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Get base URL for API calls
     */
    getBaseUrl() {
        return (location.protocol === 'http:' || location.protocol === 'https:') 
            ? '' 
            : 'http://localhost:3000';
    },

    /**
     * Format date to Korean locale
     */
    formatDate(date) {
        return new Date(date).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

// Export for use in main script
window.Utils = Utils;

