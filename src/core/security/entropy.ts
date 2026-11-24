/**
 * Calculates the Shannon entropy of a string.
 * Higher values (> 3.5 - 4.5 depending on alphabet) indicate high randomness (e.g. API keys, hashes).
 */
export function calculateShannonEntropy(str: string): number {
    if (!str || str.length === 0) {
        return 0;
    }

    const freq = new Map<string, number>();
    for (const char of str) {
        freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const len = str.length;

    for (const count of freq.values()) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }

    return entropy;
}

/**
 * Safely redacts a sensitive string, exposing only prefix and suffix if long enough.
 * Never outputs full secret text.
 */
export function redactSecret(value: string): string {
    if (!value || value.length <= 4) {
        return "***REDACTED***";
    }

    if (value.length <= 10) {
        return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }

    const prefixLen = Math.min(6, Math.floor(value.length / 4));
    const suffixLen = Math.min(4, Math.floor(value.length / 6));

    return `${value.slice(0, prefixLen)}...***...${value.slice(-suffixLen)}`;
}
