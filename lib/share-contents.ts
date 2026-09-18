/**
 * WHAT A SHARE HAS TO CARRY.
 *
 * The Sharing tab used to refuse anything with no documents on it - "Pick at
 * least one document to send" - which meant the only way to tell somebody
 * something about a job was to attach a file to it. Reported as: "why dnt we
 * make it simpler and adjust the sharing tab to be able to share without
 * attaching files".
 *
 * So a share is now documents OR words, and the rule is that it can never be
 * NEITHER. An empty link with no documents and nothing written on it is a page
 * that says nothing to whoever opens it, and it is indistinguishable from a
 * send that went wrong.
 *
 * ASKED BY THE FORM AND BY THE ROUTE, the same shape as `quickAddProblem` and
 * `scopeNoticeProblem`: the guard on the way in stops the next one, and a
 * server's answer can only ever arrive as a message about a whole request that
 * did not happen.
 */

export interface ShareDraft {
  files?: unknown[] | null
  message?: string | null
}

/** The shortest an update can be and still be worth opening a link for. */
export const MIN_UPDATE_MESSAGE = 8

/** What is wrong with this share, in the sender's terms, or null. */
export function shareProblem(draft: ShareDraft): string | null {
  const count = (draft.files ?? []).length
  const message = String(draft.message ?? '').trim()

  if (count > 0) return null
  if (!message) return 'Pick a document to send, or write an update to send instead.'
  if (message.length < MIN_UPDATE_MESSAGE) {
    return 'Say a bit more - with no documents attached, the message is the whole thing they open.'
  }
  return null
}

/** True when this share is words rather than paperwork. */
export function isUpdateOnly(fileCount: number): boolean {
  return fileCount === 0
}

/**
 * How a row describes its contents.
 *
 * "0 documents" is arithmetic, not a description - it reads like a send that
 * lost its attachments rather than one that never had any.
 */
export function shareContentsLabel(fileCount: number): string {
  if (fileCount === 0) return 'Update - no documents'
  return `${fileCount} document${fileCount === 1 ? '' : 's'}`
}

/** What the button says, so the verb matches what pressing it does. */
export function shareActionLabel(fileCount: number): string {
  return fileCount === 0 ? 'Send update' : 'Create link'
}
