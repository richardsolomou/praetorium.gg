/**
 * Browser translation swaps text nodes for its own elements, so a node React still holds has left its parent and the
 * commit throws NotFoundError into the route error page (facebook/react#11538). Translation stays on for players who
 * need it, so these two calls tolerate that.
 */
// oxlint-disable-next-line typescript/unbound-method -- kept to be invoked with `.call` on each node below
const { insertBefore, removeChild } = Node.prototype

Node.prototype.removeChild = function <T extends Node>(this: Node, child: T) {
  return child.parentNode === this ? (removeChild.call(this, child) as T) : child
}

// Appends rather than dropping the node: out of order beats a control missing from the page, and React can still remove it.
Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null) {
  return insertBefore.call(this, node, reference?.parentNode === this ? reference : null) as T
}
