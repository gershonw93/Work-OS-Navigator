// ─────────────────────────────────────────────────────────────────────────────
// The desktop sidebar collapses to a rail of icons, and remembers.
//
// WHY THE STATE LIVES ON <html> AND NOT IN REACT. Two reasons, and both are
// mistakes this repo has already made once.
//
//   1. The rail's width and the content column's left padding are ONE NUMBER.
//      It used to be written twice - `w-60` on the aside, `lg:pl-60` on the
//      column - and (dashboard)/layout.tsx is a Server Component, so a piece of
//      React state in the sidebar can never reach it. A class on the document
//      element reaches both, through one CSS variable.
//
//   2. Anything read from localStorage AFTER mount flashes. The theme solved
//      this years ago with a pre-paint script; this is the same door. Read
//      during hydration instead and the app paints a 240px sidebar, then snaps
//      to 72px on the first frame after - which reads as a glitch, not a
//      preference.
//
// So: the script below runs before first paint, and the toggle writes the same
// class and the same key. One definition each, imported by both, because a
// string literal typed in two files is a drift waiting to happen.
// ─────────────────────────────────────────────────────────────────────────────

export const SIDEBAR_COLLAPSED_KEY = 'sytenav-sidebar-collapsed'
export const SIDEBAR_COLLAPSED_CLASS = 'sidebar-collapsed'

/** Stored as '1' / '0' rather than present/absent, so "expanded" is a choice. */
export const SIDEBAR_COLLAPSED_ON = '1'

/**
 * Runs in <head>, before anything is painted. Deliberately tiny and deliberately
 * wrapped in try/catch: localStorage throws outright in some privacy modes, and
 * a thrown error here is a blank page rather than a wide sidebar.
 *
 * NOT A TEMPLATE LITERAL, AND THAT IS THE BUG THIS USED TO BE. It was written
 * `...==='${SIDEBAR_COLLAPSED_ON}'){` and the source was perfect. The
 * production minifier constant-folds a template whose substitutions are known
 * strings, and in folding this one it DROPPED the `'){` after the '1' - so
 * every page shipped `==='1document.documentElement...`, a SyntaxError that
 * the try/catch inside cannot catch (it never parses), logged on every load,
 * and the collapsed rail never applied. Nothing in `npm test` could see it:
 * the module's own string was right, and only the BUILT html was wrong.
 * `JSON.stringify` is a call the minifier will not evaluate, so the pieces are
 * joined at runtime, and it also quotes each value properly. Pinned in
 * `sidebar-collapse.ts`, which parses the script and bans the template.
 */
const js = (s: string) => JSON.stringify(s)

export const sidebarCollapseScript =
  '(function(){try{if(localStorage.getItem(' + js(SIDEBAR_COLLAPSED_KEY) + ')===' + js(SIDEBAR_COLLAPSED_ON) + '){'
  + 'document.documentElement.classList.add(' + js(SIDEBAR_COLLAPSED_CLASS) + ');}}catch(e){}})();'
