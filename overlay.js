/** Layout annotations, applied to a schema from outside it.
 *
 * A layout document names elements of a schema and says what to hang on
 * them, so the schema itself stays the thing other tools can read:
 *
 *   <#byRef> a :Layout ; :annotation
 *     [ :ref <#UserProfile> ; ui:label "User Profile" ] ,
 *     [ :path "@<#UserProfile>~<...#webid>" ; ui:label "profile webid" ] .
 *
 * `:ref` names an element by its ShExJ id; `:path` selects one with a
 * ShapePath, which is how you reach the elements nobody labelled.  Every
 * other predicate on the annotation node becomes a ShExJ Annotation.
 *
 * This was inline in index.js.  It is out here so it can be tested without a
 * browser, and so it can be swapped for @shexjs/schema-overlay -- which does
 * the same job for SemActs and Annotations both -- when that is published.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && typeof exports !== 'undefined')
    module.exports = factory()
  else
    root.Overlay = factory()
})(this, function () {

  const NS_Layout = "http://janeirodigital.com/layout#"
  const IRI_LayoutType = NS_Layout + "Layout"
  const IRI_LayoutAnnotation = NS_Layout + "annotation"
  const IRI_LayoutRef = NS_Layout + "ref"
  const IRI_LayoutPath = NS_Layout + "path"
  const IRI_RdfType = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
  const IRI_XsdString = "http://www.w3.org/2001/XMLSchema#string"

  /** the terms that address an element, rather than saying something about it */
  const ADDRESSING = [IRI_LayoutRef, IRI_LayoutPath]

  /**
   * A copy of `schema` with the layout's annotations on it.
   *
   * The schema is copied, not written on: a layout is a reading of a schema,
   * and the next reading should get the same schema to work from.
   *
   * `deps` keeps this free of the page's globals:
   *   index(schema)             -> {shapeExprs, tripleExprs}
   *   resolvePath(schema, path) -> [element, ...]
   */
  function annotateSchema (schema, layout, deps) {
    const copy = JSON.parse(JSON.stringify(schema))
    delete copy._index                  // stale: it points into the original
    const index = deps.index(copy)

    layout.getQuads(null, IRI_RdfType, IRI_LayoutType).forEach(root => {
      layout.getQuads(root.subject, IRI_LayoutAnnotation, null).forEach(q => {
        const elt = resolve(q.object, copy, index, layout, deps)
        const annotations = layout.getQuads(q.object, null, null)
          .filter(t => ADDRESSING.indexOf(t.predicate.value) === -1)
          .map(t => ({
            type: "Annotation",
            predicate: t.predicate.value,
            object: toJsonLd(t.object),
          }))
        // add to what the schema already said, rather than replacing it: two
        // layouts on one element should both be heard
        elt.annotations = (elt.annotations || []).concat(annotations)
      })
    })
    return copy
  }

  function resolve (annotation, schema, index, layout, deps) {
    const refs = layout.getQuads(annotation, IRI_LayoutRef, null)
    const paths = layout.getQuads(annotation, IRI_LayoutPath, null)
    if (refs.length + paths.length !== 1)
      throw Error(`an annotation wants exactly one of :ref or :path; this one has `
                  + `${refs.length} and ${paths.length}`)

    if (refs.length) {
      const label = refs[0].object.value
      const found = index.shapeExprs[label] || index.tripleExprs[label]
      if (found === undefined)
        throw Error(`:ref <${label}> is not a label in this schema; it has `
                    + Object.keys(index.shapeExprs).concat(Object.keys(index.tripleExprs))
                      .map(l => `\n  ${l}`).join(""))
      // a ShapeDecl is a label wrapped around a shape expression, and ShExJ
      // puts annotations on the expression rather than on the wrapper
      return found.type === "ShapeDecl" ? found.shapeExpr : found
    }

    const path = paths[0].object.value
    const found = deps.resolvePath(schema, path)
    if (found.length !== 1)
      throw Error(`:path "${path}" selected ${found.length} elements; an annotation `
                  + `goes on one`)
    return found[0]
  }

  function toJsonLd (term) {
    if (term.termType !== "Literal")
      return term.value
    const ret = {value: term.value}
    if (term.language)
      ret.language = term.language
    else if (term.datatype && term.datatype.value !== IRI_XsdString)
      ret.type = term.datatype.value
    return ret
  }

  return {annotateSchema, NS_Layout}
})
