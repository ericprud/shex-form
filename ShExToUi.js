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

  const writer = new N3.Writer({ prefixes: { "": IRI_this, ui: NS_Ui, dc: NS_Dc } })
  writer.addQuads(graph.getQuads())
  let ret
  writer.end((error, result) => ret = result)
  console.log(ret)
  return ret

  function walkShape (shape, formTerm, path) {
    let sanitizedPath = path.replace(/[^A-Za-z_-]/g, "_")
    graph.addQuad(formTerm, namedNode(NS_Rdf + "type"), namedNode(NS_Ui + "Form"))
    let label = findTitle(shape);
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
      return blankNode(ld.substr(2));
    } else {
      return namedNode(ld);
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
