ShExToUi = function (schema, termFactory, meta) {

  const NS_Rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  const IRI_RdfType = NS_Rdf + "type"
  const NS_Dc = "http://purl.org/dc/elements/1.1/"
  const IRI_DcTitle = NS_Dc + "title"
  const NS_Ui = "http://www.w3.org/ns/ui#"
  const IRI_UiSize = NS_Ui + "size"
  const IRI_UiLabel = NS_Ui + "label"
  const IRI_UiContents = NS_Ui + "contents"
  const IRI_UiType = IRI_RdfType
  const NS_Layout = "http://janeirodigital.com/layout#"

  const namedNode = termFactory.namedNode
  const blankNode = termFactory.blankNode
  const literal = termFactory.literal

  const graph = new N3.Store()
  const IRI_this = window.location + "#"
  const rootFormTerm = namedNode(IRI_this + "formRoot")

  const start = "start" in schema
        ? derefShapeExpression(schema.start)
        : schema.shapes[0]

  walkShape(start, rootFormTerm, localName(start.id, meta))

  // console.log(sequesterLists(graph))
  const writer = new N3.Writer({ prefixes: { "": IRI_this, ui: NS_Ui, dc: NS_Dc }, listHeads: sequesterLists(graph) })
  writer.addQuads(graph.getQuads())
  let ret
  writer.end((error, result) => ret = result)
  console.log(ret)
  return ret

  function sequesterLists (db) {
    const first = NS_Rdf + "first", rest = NS_Rdf + "rest", nil = NS_Rdf + "nil"
    const nonEmptyLists = new Map()
    const tails = db.getQuads(null, rest, nil, null)
    tails.forEach(tailQuad => {
      let skipList = false // @#%#$ing dogmatic lack of goto in js
      let listQuads = [tailQuad]
      let head = null
      let headPOS = null
      let graph = tailQuad.graph
      let members = []

      let li = tailQuad.subject
      while (li && !skipList) {
        let ins = db.getQuads(null, null, li, null)
        let outs = db.getQuads(li, null, null, null)
        let f = null, r = null, parent = null, others = []
        if (outs.reduce((skip, q) => {
          if (skip) {
            return true
          }
          if (!q.graph.equals(graph)) {
            return fail(li, "list not confined to single graph")
          }
          if (head) {
            return fail(li, "intermediate list element has non-list arcs out")
          }

          // one rdf:first
          if (hasPredicate(q, first)) {
            if (f) {
              return fail(li, "multiple rdf:first arcs")
            }
            f = q
            listQuads.push(q)
            return false
          }

          // one rdf:rest
          if (hasPredicate(q, rest)) {
            if (r) {
              return fail(li, "multiple rdf:rest arcs")
            }
            r = q
            listQuads.push(q)
            return false
          }

          // alien triple
          if (ins.length) {
            return fail(li, "can't be subject and object")
          }
          head = q // e.g. { (1 2 3) :p :o }
          headPOS = "subject"
          return false // all good
        }, false)) {
          skipList = true // we got a skip
          break
        }
        // { :s :p (1 2) } arrives here with no head
        // { (1 2) :p :o } arrives here with head set to the list.

        if (ins.reduce((skip, q) => {
            if (skip) {
              return skip
            }
            if (head) {
              return fail(li, "list item can't have coreferences")
            }

            // one rdf:rest
            if (hasPredicate(q, rest)) {
              if (parent) {
                return fail(li, "multiple incoming rdf:rest arcs")
              }
              parent = q
              return false // all good
            }

            head = q // e.g. { :s :p (1 2) }
            headPOS = "object"
            return false
        }, false)) {
          skipList = true // we got a skip
          break
        }

        members.unshift(f.object)
        li = parent ? parent.subject : null // null means we're done
      }

      if (head && !skipList) {
        db.removeQuads(listQuads)
        // db.removeQuad(head)
        // head[headPOS].members = members
        // head[headPOS].id = "(" + members.map(m => turtleTerm(m, meta)).join(" ") + ")" .. nice try
        // db.addQuad(head)
        nonEmptyLists.set(head[headPOS].value, members)
      }

    })

    return nonEmptyLists
  }

  function fail() { return true } // can use for linting later

  function hasPredicate (q, p) {
    return q.predicate.termType === "NamedNode" && q.predicate.value === p
  }

  function walkShape (shape, formTerm, path) {
    let sanitizedPath = path.replace(/[^A-Za-z_-]/g, "_")
    graph.addQuad(formTerm, namedNode(NS_Rdf + "type"), namedNode(NS_Ui + "Form"))
    let label = findTitle(shape)
    if (label)
      graph.addQuad(formTerm, namedNode(IRI_DcTitle), literal(label.object.value))

    if (!("expression" in shape) || shape.expression.type !== "EachOf")
      // The UI vocabulary accepts only lists of atoms.
      // TODO: This rejects single TC shapes.
      throw Error("expected .expression of type EachOf, got: " + JSON.stringify(shape))

    let parts = new ListObject(formTerm, namedNode(NS_Ui + "parts"), graph, termFactory)
    shape.expression.expressions.forEach((te, i) => {
      const tePath = path + "/[" + i + "]"
      if (te.type !== "TripleConstraint")
        throw Error("expected " + tePath + " of type TripleConstraint, got: " + JSON.stringify(te))

      const fieldTerm = "id" in te
            ? JSONLDtoRDFJS(te.id)
            : blankNode(sanitizedPath + "_parts_" + i + "_field")

      let needFieldType = namedNode(NS_Ui + "SingleLineTextField") // default field type

      // copy annotations
      if ("annotations" in te)
        te.annotations.forEach(a => {
          if (a.predicate === NS_Layout + "ref")
            return
          if (a.predicate === IRI_RdfType)
            needFieldType = null
          if (a.predicate === NS_Ui + "contents") {
            // ui:contents get their own item in the list
            const commentTerm = "id" in te
                  ? JSONLDtoRDFJS(te.id + "Comment") // !! could collide, but easy to debug
                  : blankNode(sanitizedPath + "_parts_" + i + "_comment")
            graph.addQuad(commentTerm, namedNode(IRI_UiType), namedNode(NS_Ui + "Comment"))
            graph.addQuad(commentTerm, namedNode(NS_Ui + "contents"), JSONLDtoRDFJS(a.object))
            // add the parts list entry for comment
            parts.add(commentTerm, sanitizedPath + "_parts_" + i + "_comment")
          } else {
            graph.addQuad(fieldTerm, JSONLDtoRDFJS(a.predicate), JSONLDtoRDFJS(a.object))
          }
        })

      // add the parts list entry for new field
      parts.add(fieldTerm, sanitizedPath + "_parts_" + i)

      // add property arc
      graph.addQuad(fieldTerm, namedNode(NS_Ui + "property"), JSONLDtoRDFJS(te.predicate))

      let valueExpr = typeof te.valueExpr === "string"
          ? derefShapeExpression(te.valueExpr)
          : te.valueExpr

      // add what we can guess from the value expression
      if (valueExpr.type === "Shape") {
        needFieldType = null
        let groupId = blankNode(sanitizedPath + "_parts_" + i + "_group")
        graph.addQuad(fieldTerm, IRI_RdfType, namedNode(NS_Ui + "Multiple"))
        graph.addQuad(fieldTerm, namedNode(NS_Ui + "part"), groupId)
        walkShape(valueExpr, groupId, path + "/@" + localName(te.valueExpr, meta))
      } else if (valueExpr.type === "NodeConstraint") {
        let nc = valueExpr
        if ("maxlength" in nc)
          graph.addQuad(fieldTerm, namedNode(NS_Ui + "maxLength"), JSONLDtoRDFJS({value: nc.maxlength}))
      } else {
        throw Error("Unsupported value expression on " + tePath + ": " + JSON.stringify(valueExpr))
      }

      // if there's no type, assume ui:SingleLineTextField
      if (needFieldType)
        graph.addQuad(fieldTerm, namedNode(IRI_RdfType), needFieldType)
    })
    parts.end()
    
  }

  function turtleTerm (rdfjs, meta) {
    switch (rdfjs.termType) {
    case "NamedNode":
      return localName(rdfjs.value, meta)
    case "BlankNode":
      return "_:" + rdfjs.value
    case "Literal":
      throw Error("didn't write 'cause didn't need")
    }
  }

  /** convert JSON-LD term to an RDFJS term
   * 
   */
  function JSONLDtoRDFJS (ld) {
    if (typeof ld === "object" && "value" in ld) {
      let dtOrLang = ld.language ||
          ld.datatype && ld.datatype !== IRI_XsdString
          ? null // seems to screw up N3.js
          : namedNode(ld.datatype)
      return literal(ld.value, dtOrLang)
    } else if (ld.startsWith("_:")) {
      return blankNode(ld.substr(2))
    } else {
      return namedNode(ld)
    }
  }

  /** Find shape expression with given name in schema.
   * returns: corresponding shape expression or undefined
   */
  function findShapeExpression (goal) {
    return schema.shapes.find(se => se.id === goal)
  }

  function derefShapeExpression (shapeExpr) {
    if (typeof shapeExpr !== "string")
      return shapeExpr
    const ret = findShapeExpression(shapeExpr)
    if (!ret)
      throw Error("unable to find shape expression \"" + shapeExpr + "\" in \n  " + schema.shapes.map(se => se.id).join("\n  "))
    return ret
  }

  /* Shorten a name as much as possible.
   * meta: { base: "...", prefix: { "", "http://some.example/foo#" } }
   * (could use closure meta but you might use this elsewhere.)
   */
  function localName (iri, meta) { // you might want this 
    if (iri.startsWith("_:"))
      return iri
    let p = Object.keys(meta.prefixes).find(p => iri.startsWith(meta.prefixes[p]))
    if (p)
      return p + ":" + iri.substr(meta.prefixes[p].length)
    return "<" + (iri.startsWith(meta.base) ? iri.substr(meta.base.length) : iri) + ">"
  }

  function findLabel (shexpr) {
    return (shexpr.annotations || []).find(a => a.predicate === IRI_UiLabel || a.predicate === IRI_UiContents)
  }

  function findTitle (shexpr) {
    return (shexpr.annotations || []).find(a => a.predicate === IRI_DcTitle)
  }

}
