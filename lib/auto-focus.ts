/**
 * Autofocus on a desktop, never on a touch screen.
 *
 * THE BUG. Pressing + on the schedule opened Add Milestone with `autoFocus` on
 * its Label field. On iOS that opens the keyboard immediately - nobody asked
 * for it - and iOS then scrolls the LAYOUT viewport to bring the field into
 * view. A `position: fixed` dialog is pinned to that viewport, so the whole
 * dialog was dragged around the screen the instant the button was pressed.
 *
 * Sixteen dialogs across thirteen screens had it, so it was not one screen.
 *
 * A coarse pointer is the test rather than a screen width: a small window on a
 * laptop still has a keyboard already out, and an iPad in landscape is wide and
 * still has this problem.
 *
 * SAFE TO CALL DURING RENDER. A dialog is only mounted after a click, so it
 * never exists during server rendering and there is nothing to mismatch on
 * hydration. Do not move this to the top level of a component that DOES render
 * on the server.
 */
export function autoFocusOnDesktop(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !window.matchMedia('(pointer: coarse)').matches
  } catch {
    // An old engine with no matchMedia: err towards not stealing focus.
    return false
  }
}
