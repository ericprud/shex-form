/** convenience class for dealing with lists.
 * Builds a graph like:
 *   <mom> <hasChild> (<child1>, <child2>)
 * given this invocation:
 *   const children = new ListObject(namedNode("mom"), namedNode("hasChild"), graph)
 *   children.add(namedNode("child1"))
 *   children.add(namedNode("child2"))
 *   children.end()
 *
 * An empty list like:
 *   <mom> <hasChild> ()
 * is constructed like:
 *   const children = new ListObject(namedNode("mom"), namedNode("hasChild"), graph)
 *   children.end()
 */
class ListObject {

  constructor(s, p, graph, termFactory) {
    this.s = s
    this.p = p
    this.graph = graph
    this.termFactory = termFactory
    this.NS_Rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  }

  add (elt, label = undefined) {
    let partLi = this.termFactory.blankNode(label)
    this.graph.addQuad(this.s, this.p, partLi)
    this.graph.addQuad(partLi, this.termFactory.namedNode(this.NS_Rdf + "first"), elt)
    this.s = partLi
    this.p = this.termFactory.namedNode(this.NS_Rdf + "rest")
    return partLi // in case someone wants it.
  }

  end () {
    this.graph.addQuad(this.s, this.p, this.termFactory.namedNode(this.NS_Rdf + "nil"))
  }
}

