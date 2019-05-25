/* generate HTML forms from ShEx schemas and conformant data
 *
 * TODO: factor SchemaRenderer and ValidationResultsRenderer
 */

(function () {
  const IRI_Rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  const IRI_RdfType = IRI_Rdf + "type"
  const IRI_Xsd = "http://www.w3.org/2001/XMLSchema#"
  const IRI_XsdString = IRI_Xsd + "string"
  const IRI_XsdInteger = IRI_Xsd + "integer"
  const IRI_RdfsLabel = "http://www.w3.org/2000/01/rdf-schema#label"
  const IRI_Layout = "http://janeirodigital.com/layout#"
  const IRI_LayoutReadOnly = IRI_Layout + "readonly"
  const F = N3.DataFactory

  const RDF_TYPE = F.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
  const LAYOUT = F.namedNode("http://janeirodigital.com/layout#Layout")
  const ANNOTATION = F.namedNode("http://janeirodigital.com/layout#annotation")
  const PATH = F.namedNode("http://janeirodigital.com/layout#path")
  const REF = F.namedNode("http://janeirodigital.com/layout#ref")
  const XSD_STRING = F.namedNode("http://www.w3.org/2001/XMLSchema#string")

  let Meta = {
    shexc: {
      prefixes: {},
      base: location.href
    },
    data: {
      prefixes: {},
      base: location.href
    },
    layout: {
      prefixes: {},
      base: location.href
    }
  }
  Interfaces = [
    // { label: "local",
    //   link: "http://localhost/tmp/checkouts/shexSpec/shex.js/packages/shex-webapp/doc/shex-simple.html?" },
    { label: "js", name: "shex.js",
      link: "http://rawgit.com/shexSpec/shex.js/extends/packages/shex-webapp/doc/shex-simple.html?" },
    { label: "scala", name: "rdfshape",
      link: "http://rdfshape.weso.es/validate?triggerMode=ShapeMap&" }
  ]

  const SchemaEditor = ace.edit("schema-editor")
  const LayoutEditor = ace.edit("layout-editor")
  const DataEditor =   ace.edit("data-editor")
  const Editables = {
    schema: {type: "editor", parm: "schemaURL", selector: "#schema-editor", parser: parseSchema, mode: "ace/mode/shexc"},
    layout: {type: "editor", parm: "layoutURL", selector: "#layout-editor", parser: parseLayout},
    data  : {type: "editor", parm: "dataURL",   selector: "#data-editor"  , parser: parseData  }
  }
  const InputLoaders = [
    {type: "select", parm: "schemaFormat", selector: "#schemaFormat" , parser: t => {
      debugger
      console.log(t)
      t}, val: function (v) {
        $(this.selector).val(v)
      }}
  ].concat(Object.values(Editables))

  Object.values(Editables).forEach(edible => {
    edible.editor = ace.edit($(edible.selector).get(0))
    edible.editor.setTheme("ace/theme/dawn")
    if (edible.mode)
      edible.editor.session.setMode(edible.mode)
    edible.val = v => v ? edible.editor.setValue(v, 1) : edible.editor.getValue()
  })

  const CGIparms = location.search.substr(1).split(/[,&]/).map(
    pair => pair.split("=").map(decodeURIComponent)
  )

  CGIparms.filter(
    p => p[0] === "manifestURL"
  ).map(
    p => new URL(p[1], location) // just the value
  ).forEach(loadManifest)

  // re-generate start shape select whenever clicked
  $("#start-shape").on("mousedown", evt => {
    Promise.all(getSchemaPromises()).catch(alert)
  }).on("change", clearCurrentForm)

  // re-generate focus node select whenever clicked
  $("#focus-node").on("mousedown", evt => {
    parseData().catch(alert)
  }).on("change", clearCurrentForm)

  // [⟲] button
  $("#shexc-to-shexj").on("click", evt => { // !!! largely duplicates parseSchema()
    const format = $("#schemaFormat").val()
    const nowDoing = "Parsing " + format
    console.log(nowDoing)
    return new Promise((accept, reject) => {
      let schemaText = Editables.schema.val()
      let schema
      try {
        if (format === "ShExC") {
          let parser = shexParser.construct(location.href, null, {index: true})
          schema = parser.parse(schemaText)
          schemaText = JSON.stringify(schema, null, 2)
          $("#schemaFormat").val("ShExJ")
        } else {
          schema = JSON.parse(schemaText)
          schema = relativeize(schema, schema._base || location.href)
          let w = new shexCore.Writer(null, {
            simplifyParentheses: true,
            prefixes: schema._prefixes || {},
            base: schema._base || location.href
          })
          w.writeSchema(schema, function (error, text, prefixes) {
            if (error) throw error;
            else schemaText = text;
          })
          $("#schemaFormat").val("ShExC")
        }
        Editables.schema.val(schemaText)

        // keep track of prefixes for painting shape menu
        Meta.shexc.prefixes = schema._prefixes || {}
        Meta.shexc.base = schema._base || location.href
        paintShapeChoice(schema)

        accept(schema)
      } catch (e) {
        alert(e)
      }
    })
  })

  // [↙] button
  $("#shexj-to-form").on("click", evt => {
    // get schema from ShExC
    Promise.all(getSchemaPromises()).then(
      pair => {
        let [schema, layout] = pair
        updateTryItLink()
        const r = new SchemaRenderer(annotateSchema(schema, layout))
        $("#form").empty().append( // @@ assumes only one return
          r.paintShapeExpression($("#start-shape").val())
        )
      },
      alert
    )
  })

  // [←] button
  $("#data-to-form").on("click", evt => {
    let [schemaP, layoutP] = getSchemaPromises()
    let graphP = parseData()

    Promise.all([schemaP, layoutP, graphP]).then(both => {
      let [schema, layout, graph] = both
      updateTryItLink(); 
      const annotated = annotateSchema(schema, layout)
      annotated._index = shexCore.Util.index(annotated);
      nowDoing = "validating data"
      let validator = shexCore.Validator.construct(annotated)
      let db = shexCore.Util.makeN3DB(graph)
      let focus = $("#focus-node").val()
      let results = validator.validate(db, focus, $("#start-shape").val())
      if ("errors" in results) {
        alert("failed to validate, see console")
        console.warn(results)
      } else {
        const r = new ValidationResultsRenderer(annotated)
        $("#form").empty().append(
          r.paintShapeExpression(results),
          [$("<input/>", { type: "submit", value: "Update" })]
        ).on("submit", evt => {
          evt.preventDefault()
          console.log(r.edits())
        })
      }
    }, alert)
  })

  return

  function loadManifest (mURL) {
    let buttons = []
    fetch(mURL).then(
      resp => resp.json()
    ).then(
      j => j.forEach(entry => {
        const newButton = $("<button/>").text(entry.title).attr("title", entry.desc).on("click", evt => {
          let target = $(evt.target)
          if (target.hasClass("selected")) {
            Object.values(Editables).forEach(ed => {
              ed.val("")
            })
            target.removeClass("selected")
          } else {
            buttons.forEach(b => b.removeClass("selected"))
            loadManifestEntry(entry, mURL)
            target.addClass("selected")
          }
        })
        buttons.push(newButton)
        const toAdd = $("<li/>").append(newButton)
        $(".manifest").append(toAdd)
      })
    )
  }

  function loadManifestEntry (entry, baseURL) {
    Promise.all(InputLoaders.map(loader => {
      const urlOrValue = entry[loader.parm]
      if (loader.parm.endsWith("URL")) {
        return fetch(new URL(urlOrValue, baseURL)).then(resp => resp.text()).then(text => {
          loader.val(text)
          return loader.parser()
        })
      } else {
        loader.val(urlOrValue)
        return Promise.resolve(urlOrValue)
      }
    })).then(all => {
      updateTryItLink()
      clearCurrentForm()
    })
  }

  // try it link

  function updateTryItLink () {
    const span = $(".tryit")
    const parms = getShExApiParms(span)
    span.empty().append(
      Interfaces.reduce(
        (toAdd, iface, idx) => toAdd.concat(
          (idx === 0 ?
           $("<span/>").text("try it: ") :
           " | "),
          $("<a/>", { href: createLink(iface.link, parms) }).text(iface.label),
        ), []
      )
    )
  }

  function annotateSchema (schema, layout) {
    schema = JSON.parse(JSON.stringify(schema)) // modify copy, not original.
    let index = shexCore.Util.index(schema); // update index to point at copy.
    const shexPath = shexCore.Util.shexPath(schema, Meta.shexc)
    layout.getQuads(null, RDF_TYPE, LAYOUT).forEach(quad => {
      const annotated = layout.getQuads(quad.subject, ANNOTATION, null).map(t => {
        let elt = null
        let quads = layout.getQuads(t.object, REF, null)
        if (quads.length) {
          if (!index)
            index = shexCore.Util.index(schema);
          let lookFor = quads[0].object.value
          elt = index.shapeExprs[lookFor] || index.tripleExprs[lookFor]
          // console.log([elt, quads[0].object.value, index])
        } else {
          const pathStr = layout.getQuads(t.object, PATH, null)[0].object.value
          elt = shexPath.search(pathStr)[0]
        }
        const newAnnots = layout.getQuads(t.object, null, null).filter(
          t => !t.predicate.equals(PATH)
        ).map(t => {
          return {
            "type":"Annotation",
            "predicate":t.predicate.value,
            "object":Object.assign({"value":t.object.value}, t.object.datatypeString !== XSD_STRING.value ? {type: t.object.datatypeString} : {})}
        })
        elt.annotations = newAnnots // @@ merge, overriding same predicate values?
        return elt
      })
    })
    return schema
  }

  function getShExApiParms (span) {
    const schema = Editables.schema.val().replace(/^\n +/, "")
    const data = Editables.data.val().replace(/^\n +/, "")
    const shapeMap = localName($("#focus-node").val(), Meta.data)
          + "@"
          + localName($("#start-shape").val(), Meta.shexc)
    return { schema, data, shapeMap }
  }

  function createLink (base, shExApiParms) {
    return base + [
      "interface=minimal",
      "schema=" + encodeURIComponent(shExApiParms.schema),
      "data=" + encodeURIComponent(shExApiParms.data),
      "shape-map=" + encodeURIComponent(shExApiParms.shapeMap)
    ].join("&");
  }

  // node and shape selectors

  function paintShapeChoice (schema) {
    let selected = $("#start-shape").val()
    $("#start-shape").empty().append(schema.shapes.map(
      shape =>
        $("<option/>", Object.assign(
          {value: shape.id},
          shape.id === selected ? { selected: "selected" } : {}
        )).append(localName(shape.id, Meta.shexc))
    ))
    return schema
  }

  function paintNodeChoice (graph) {
    let selected = $("#focus-node").val()
    let nodes = graph.getQuads().reduce(
      (nodes, q) => nodes.find(
        known => known.equals(q.subject)
      )
        ? nodes
        : nodes.concat(q.subject)
      , []
    ).map(
      q => q.termType === "BlankNode"
        ? "_:" + q.value
        : q.value)
    $("#focus-node").empty().append(nodes.map(
      node =>
        $("<option/>", Object.assign(
          {value: node},
          node === selected ? { selected: "selected" } : {}
        )).text(localName(node, Meta.data))
    ))
    return graph
  }

  function clearCurrentForm () {
    $("#form").empty().append(" no generated form", $("<br/>"),
                              "   ↙ to create from schema", $("<br/>"),
                              "   ← to create from data")
  }

  // parser wrappers

  function parseSchema () {
    const format = $("#schemaFormat").val()
    const nowDoing = "Parsing " + format
    return new Promise((accept, reject) => {
      const schemaText = Editables.schema.val()
      let schema
      try {
        if (format === "ShExC") {
          let parser = shexParser.construct(location.href, null, {index: true})
          schema = parser.parse(schemaText)
        } else if (format === "ShExJ") {
          schema = relativeize(JSON.parse(schemaText), location.href)
          Editables.schema.val(JSON.stringify(schema, null, 2)) // overwrite with abs links
        } else {
          let graph = new N3.Store()
          let parser = new N3.Parser({format: "application/turtle", baseIRI: location.href})
          graph.addQuads(parser.parse(schemaText))
          let shexRSchemaObj = shexParser.construct(location.href, null, {index: true}).parse(ShExRSchema);
          let graphParser = shexCore.Validator.construct(shexRSchemaObj, {})
          let schemaRoot = graph.getQuads(null, shexCore.Util.RDF.type, "http://www.w3.org/ns/shex#Schema")[0].subject; // !!check
          let val = graphParser.validate(shexCore.Util.makeN3DB(graph), schemaRoot, shexCore.Validator.start); // start shape
          schema = shexCore.Util.ShExRtoShExJ(shexCore.Util.valuesToSchema(shexCore.Util.valToValues(val)));
        }
        // keep track of prefixes for painting shape menu
        Meta.shexc.prefixes = schema._prefixes || {}
        Meta.shexc.base = schema._base || location.href
        paintShapeChoice(schema)

        accept(schema)
      } catch (e) {
        alert(e)
      }
    })
  }

  function relativeize(object, base) {
    "use strict";
    for (var key in object) {
      var item = object[key];
      if (key === "id" || (key === "valueExpr" && typeof object[key] === "string")) {
        object[key] = new URL(object[key], base).href;
      } else if (typeof item === "object") {
        relativeize(item, base);
      }
    }
    return object;
  }

  function getSchemaPromises () {
    return [parseSchema().then(schemaParsed), parseLayout()]
  }

  function schemaParsed (schema) {
    updateTryItLink()
    // let shexjText = JSON.stringify(schema, null, 2)
    // $(".shexj pre").hide()
    // $(".shexj textarea").val(shexjText).show()
    return schema
  }

  function parseLayout () {
    return parseTurtle("Layout", Meta.layout, Editables.layout)
  }

  function parseData () {
    return parseTurtle("Data", Meta.data, Editables.data).then(graph => {
      paintNodeChoice(graph)
      return graph
    })
  }

  function parseTurtle (label, meta, editable) {
    let nowDoing = "Parsing " + label
    return new Promise((accept, reject) => {
      N3.Parser._resetBlankNodeIds()
      const parser = new N3.Parser({ baseIRI: location.href })
      const graph = new N3.Store()
      parser.parse(
        editable.val(),
        (error, quad, prefixes) => {
          if (error)
            reject(error)
          if (quad)
            graph.addQuad(quad)
          else {
            // keep track of prefixes for painting focus menu
            meta.prefixes = prefixes
            meta.base = parser._base

            accept(graph)
          }
        }
      )
    })
  }

  // convenience functions

  function findLabel (shexpr) {
    return (shexpr.annotations || []).find(a => a.predicate === IRI_RdfsLabel)
  }

  function localName (iri, meta) {
    if (iri.startsWith("_:"))
      return iri
    let p = Object.keys(meta.prefixes).find(p => iri.startsWith(meta.prefixes[p]))
    if (p)
      return p + ":" + iri.substr(meta.prefixes[p].length)
    return "<" + (iri.startsWith(meta.base) ? iri.substr(meta.base.length) : iri) + ">"
  }

  // Renderers

  // Walk ShExJ to generate a form.
  function SchemaRenderer (schema) {
    const validator = shexCore.Validator.construct(
      // JtoAS modifies original; +1 to working with native ShExJ.
      shexCore.Util.ShExJtoAS(JSON.parse(JSON.stringify(schema)))
    )

    return {
      findShapeExpression: findShapeExpression,

      // get the painters in here.
      paintShapeExpression: paintShapeExpression,
      paintShape: paintShape,
      paintNodeConstraint: paintNodeConstraint,
      paintTripleExpression: paintTripleExpression,
      paintTripleConstraint: paintTripleConstraint,
    }

    function findShapeExpression (goal) {
      return schema.shapes.find(se => se.id === goal)
    }

    /* All paint* functions return an array of jquery nodes.
     */

    function paintShapeExpression (shexpr) {
      if (typeof shexpr === "string") // ShapeRef
        return paintShapeExpression(findShapeExpression(shexpr))
      switch (shexpr.type) {
      case "Shape":
        return paintShape(shexpr)
      case "NodeConstraint":
        return paintNodeConstraint(shexpr)
      default: throw Error("paintShapeExpression(" + shexpr.type + ")")
      }
    }

    function paintShape (shexpr) {
      let div = $("<div/>", { class: "shape" })
      let label = findLabel(shexpr)
      if (label)
        div.append($("<h3>").text(label.object.value))
      let ul = $("<ul/>").append(paintTripleExpression(shexpr.expression))
      div.append(ul)
      return [div]
    }

    function paintNodeConstraint (nc) {
      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        return $("<input/>").on("blur", evt => {
          let jElt = $(evt.target)
          let lexicalValue = jElt.val()
          let res = validator._validateShapeExpr(null, makeTerm(lexicalValue), nc, "", null, {})
          if ("errors" in res) {
            console.warn(res)
            jElt.addClass("error").attr("title", res.errors.map(e => e.error).join("\n--\n"))
          } else {
            jElt.removeClass("error").removeAttr("title")
          }
        })
      }

      if ("datatype" in nc)
        switch (nc.datatype) {
        case IRI_XsdString:
        case IRI_XsdInteger:
          return [validatedInput(s => "\"" + s.replace(/"/g, "\\\"") + "\"^^" + nc.datatype)]
        default:
          throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc)
        return [$("<select/>").append(nc.values.map(v => {
          let vStr = typeof v === "object"
              ? v.value      // a string
              : localName(v, Meta.shexc) // an IRI
          return $("<option/>", {value: vStr}).text(vStr)
        }))]

      throw Error("ProgramFlowError: paintNodeConstraint arrived at bottom")
    }

    function paintTripleExpression (texpr) {
      if (typeof texpr === "string")
        return paintTripleExpression(findTripleExpression(texpr)) // @@ later
      switch (texpr.type) {
      case "TripleConstraint":
        return paintTripleConstraint(texpr)
      case "EachOf":
        return texpr.expressions.reduce(
          (acc, nested) =>
            acc.concat(paintTripleExpression (nested)), []
        )
      case "OneOf":
        return $("<li/>", { class: "disjunction" }).append(
          $("<ul/>").append(
            texpr.expressions.reduce(
              (acc, e, idx) =>
                (idx > 0
                 ? acc.concat($("<li/>", {class: "separator"}).append("<hr/>"))
                 : acc
                ).concat(paintTripleExpression(e)),
              []
            )
          )
        )
      default: throw Error("paintTripleExpression(" + texpr.type + ")")
      }
    }

    function paintTripleConstraint (tc) {
      let label = findLabel(tc);
      let ret = $("<li/>").text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc))
      if (typeof tc.max !== "undefined" && tc.max !== 1)
        ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      if (tc.valueExpr) {
        let valueHtml = paintShapeExpression(tc.valueExpr)
        let ro = (tc.annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
        if (ro)
          valueHtml.forEach(h => h.attr("readonly", "readonly"))
        ret.append(valueHtml)
      }
      return [ret]
    }
  }

  // Walk a validation result to generate a form.
  function ValidationResultsRenderer (schema) {
    const changes = new Map() // jQuery elt -> new value
    const validator = shexCore.Validator.construct(
      // JtoAS modifies original; +1 to working with native ShExJ.
      JSON.parse(JSON.stringify(schema))
    )

    return {
      // get the painters in here.
      paintShapeExpression: paintShapeExpression,
      paintShape: paintShape,
      paintNodeConstraint: paintNodeConstraint,
      paintTripleExpression: paintTripleExpression,
      paintTripleConstraint: paintTripleConstraint,
      edits: edits
    }

    function edits () {
      return Array.from(changes.values())
    }

    function markChange (jElt, triple, newTerm) {
      // if (newTerm.equals(triple.object)) {
      if (shexCore.RdfTerm.isLiteral(newTerm)
          ? shexCore.RdfTerm.getLiteralValue(newTerm) === triple.object.value
          : newTerm === triple.object) {
        changes.delete(jElt)
        return false
      } else {
        changes.set(jElt, {"-": triple, "+": newTerm} )
        return true
      }
    }

    function findShapeExpression (goal) {
      return schema.shapes.find(se => se.id === goal)
    }

    /* All paint* functions return an array of jquery nodes.
     */

    function paintShapeExpression (shexpr, tested) {
      if (typeof shexpr === "string") // ShapeRef
        return tested.referenced
        ? paintShapeExpression(tested.referenced)
        : paintNodeConstraint(findShapeExpression(shexpr), tested)
      switch (shexpr.type) {
      case "ShapeTest":
        return paintShape(shexpr, tested)
      case "NodeConstraint":
        return paintNodeConstraint(shexpr, tested)
      default: throw Error("paintShapeExpression(" + shexpr.type + ")")
      }
    }

    function paintShape (shexpr) {
      let div = $("<div/>", { class: "shape" })
      let label = findLabel(shexpr)
      if (label)
        div.append($("<h3>").text(label.object.value))
      let ul = $("<ul/>").append(paintTripleExpression(shexpr.solution))
      div.append(ul)
      return [div]
    }

    function paintNodeConstraint (nc, tested) {
      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        let jElt = $("<input/>").data("triple", tested).on("blur", evt => {
          let lexicalValue = jElt.val()
          let newTerm = makeTerm(lexicalValue)
          let res = validator._validateShapeExpr(null, newTerm, nc, "", null, {})
          if ("errors" in res) {
            console.warn(res)
            jElt.addClass("error").attr("title", res.errors.map(e => e.error).join("\n--\n"))
          } else {
            jElt.removeClass("error").removeAttr("title")
            markChange(jElt, tested, newTerm)
          }
        })
        return jElt
      }

      if ("datatype" in nc)
        switch (nc.datatype) {
        case IRI_XsdString:
        case IRI_XsdInteger:
          return [validatedInput(s => scalarize(s, nc.datatype)).val(tested.object.value)]
        default:
          throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s).val(tested.object)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc) {
        let jElt = $("<select/>").append(nc.values.map(v => {
          let vStr = typeof v === "object"
              ? v.value      // a string
              : localName(v, Meta.shexc) // an IRI
          let ret = $("<option/>", {value: typeof v === "object" ? scalarize(v.value, v.datatype) : v }).text(vStr)
          let mStr = typeof tested.object === "object"
              ? tested.object.value      // a string
              : localName(tested.object, Meta.shexc) // an IRI
          if (mStr === vStr)
            ret.attr("selected", "selected")
          return ret
        })).data("triple", tested).on("blur", evt => {
          markChange(jElt, tested, jElt.val())
        })
        return [jElt]
      }

      throw Error("ProgramFlowError: paintNodeConstraint arrived at bottom")
    }

    function scalarize (s, datatype) {
      return "\"" + s.replace(/"/g, "\\\"") + "\"^^" + datatype
    }

    function paintTripleExpression (texpr) {
      // if (typeof texpr === "string")
      //   return paintTripleExpression(findTripleExpression(texpr)) // @@ later
      switch (texpr.type) {
      case "TripleConstraintSolutions":
        return paintTripleConstraint(texpr)
      case "EachOfSolutions":
        return texpr.solutions.reduce(
          (acc, nested) =>
            acc.concat(nested.expressions.reduce(
              (acc2, n2) =>
                acc2.concat(paintTripleExpression(n2)), []
            )), []
        )
      case "OneOfSolutions":
        return $("<li/>", { class: "disjunction" }).append(
          $("<ul/>").append(
            texpr.solutions.reduce(
              (acc, e, idx) =>
                (idx > 0
                 ? acc.concat($("<li/>", {class: "separator"}).append("<hr/>"))
                 : acc
                ).concat(e.expressions.reduce(
                  (acc2, n2) =>
                    acc2.concat(paintTripleExpression(n2)), []
                )),
              []
            )
          )
        )
      default: throw Error("paintTripleExpression(" + texpr.type + ")")
      }
    }

    function paintTripleConstraint (tc) {
      let label = findLabel(tc);
      let ret = $("<li/>").text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc))
      // if (typeof tc.max !== "undefined" && tc.max !== 1)
      //   ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      return [ret.append(tc.solutions.reduce(
        (acc, soln) => {
          if (tc.valueExpr) {
            let valueHtml = paintShapeExpression(tc.valueExpr, soln)
            let ro = (tc.annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
            if (ro)
              valueHtml.forEach(h => h.attr("readonly", "readonly"))
            return acc.concat(valueHtml)
          } else {
            throw Error("PF")
          }
        }, []))]
    }
  }
})()
