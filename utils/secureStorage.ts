import CryptoJS from 'crypto-js';

// Generate a unique device-based encryption key
// This ensures each user has a unique encryption key based on their browser
const getDeviceKey = (): string => {
    const storageKey = '_device_fingerprint';
    let deviceKey = localStorage.getItem(storageKey);

    if (!deviceKey) {
        // Generate a new random key for this device
        deviceKey = CryptoJS.lib.WordArray.random(32).toString();
        localStorage.setItem(storageKey, deviceKey);
    }

    return deviceKey;
};

// Additional entropy based on user agent and screen resolution
const getEntropyKey = (): string => {
    const userAgent = navigator.userAgent;
    const screen = `${window.screen.width}x${window.screen.height}`;
    return CryptoJS.SHA256(`${userAgent}${screen}`).toString();
};

// Combined encryption key
const getEncryptionKey = (): string => {
    const deviceKey = getDeviceKey();
    const entropyKey = getEntropyKey();
    return CryptoJS.SHA256(`${deviceKey}${entropyKey}`).toString();
};

/**
 * Securely save encrypted data to localStorage
 * @param key Storage key
 * @param value Plain text value to encrypt
 */
export const secureSetItem = (key: string, value: string): void => {
    if (!value || value.trim().length === 0) {
        throw new Error('Cannot store empty value');
    }

    try {
        const encryptionKey = getEncryptionKey();
        const encrypted = CryptoJS.AES.encrypt(value, encryptionKey).toString();
        localStorage.setItem(key, encrypted);
    } catch (error) {
        console.error('Secure storage encryption failed:', error);
        throw new Error('Failed to securely store data');
    }
};

/**
 * Retrieve and decrypt data from localStorage
 * @param key Storage key
 * @returns Decrypted plain text value or null if not found
 */
export const secureGetItem = (key: string): string | null => {
    try {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;

        const encryptionKey = getEncryptionKey();
        const decrypted = CryptoJS.AES.decrypt(encrypted, encryptionKey);
        const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

        // Validation: ensure decryption was successful
        if (!plaintext || plaintext.trim().length === 0) {
            console.warn('Decryption returned empty string - possible corruption');
            return null;
        }

        return plaintext;
    } catch (error) {
        console.error('Secure storage decryption failed:', error);
        return null;
    }
};

/**
 * Remove item from secure storage
 * @param key Storage key
 */
export const secureRemoveItem = (key: string): void => {
    localStorage.removeItem(key);
};

/**
 * Validate API key format and security
 * @param apiKey API key to validate
 * @param provider Provider name for specific validation
 */
export const validateApiKeyFormat = (apiKey: string, provider: 'GEMINI' | 'FAL' | 'HUGGINGFACE' | 'PRODIA' | 'TOGETHER'): boolean => {
    if (!apiKey || typeof apiKey !== 'string') return false;

    const cleaned = apiKey.trim();

    switch (provider) {
        case 'GEMINI':
            return /^AIza[A-Za-z0-9_-]{35}$/.test(cleaned);

        case 'FAL':
            return cleaned.length >= 1;

        case 'HUGGINGFACE':
            // HF tokens start with hf_
            return /^hf_[A-Za-z0-9]{20,}$/.test(cleaned) || cleaned.length >= 10;

        case 'PRODIA':
            return cleaned.length >= 10;

        case 'TOGETHER':
            return cleaned.length >= 10;

        default:
            return false;
    }
};

/**
 * Sanitize API key input
 * @param apiKey Raw API key input
 */
export const sanitizeApiKey = (apiKey: string): string => {
    if (!apiKey) return '';

    // Remove all whitespace, newlines, and invisible characters
    return apiKey
        .replace(/\s/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
        .trim();
};
