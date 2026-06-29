import { createHash } from 'crypto'

// SHA-256 of the trimmed secret delete key. Server-side only.
export const hashKey = (key: string) => createHash('sha256').update(key.trim()).digest('hex')
