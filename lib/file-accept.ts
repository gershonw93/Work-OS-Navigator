/**
 * What the OS file picker should offer.
 *
 * An input with no `accept` opens the picker unfiltered, which means the dialog
 * enumerates and previews everything in whatever folder it lands in. On a
 * machine with iCloud Drive, OneDrive or a network volume mounted, that dialog
 * can sit there spinning - and because it is a SYSTEM MODAL, the whole machine
 * feels frozen rather than just the tab.
 *
 * Deliberately generous. A filter that blocks a file someone legitimately needs
 * to upload is a worse bug than a slow dialog, so this lists everything a
 * construction job actually carries rather than a tidy short list.
 */
export const ACCEPT_DOCS = [
  '.pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.csv', '.txt', '.rtf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif',
  '.dwg', '.dxf', '.svg',
  '.zip',
].join(',')

/** Drawings and the images people photograph them with. */
export const ACCEPT_PLANS = '.pdf,.dwg,.dxf,.png,.jpg,.jpeg,.heic,.heif,.svg'

/** A scan or a photo of a piece of paper. */
export const ACCEPT_SCAN = 'application/pdf,image/*'
