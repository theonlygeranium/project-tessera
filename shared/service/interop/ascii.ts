/** SQLite lower() and NOCASE fold only ASCII letters. Keep identity keys identical in both repos. */
export const asciiLower = (value: string): string => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
