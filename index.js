/* generate HTML forms from ShEx schemas and conformant data
 *
 * TODO: factor SchemaRenderer and ValidationResultsRenderer
 */

(function () {
  const NS_Rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  const IRI_RdfType = NS_Rdf + "type"
  const IRI_RdfLangString = NS_Rdf + "langString"
  const NS_Rdfs = "http://www.w3.org/2000/01/rdf-schema#"
  const IRI_RdfsSubClassOf = NS_Rdfs + "subClassOf"
  const IRI_Xsd = "http://www.w3.org/2001/XMLSchema#"
  const IRI_XsdString = IRI_Xsd + "string"
  const IRI_XsdInteger = IRI_Xsd + "integer"
  const IRI_XsdDecimal = IRI_Xsd + "decimal"
  const IRI_XsdDateTime = IRI_Xsd + "dateTime"
  const NS_Dc = "http://purl.org/dc/elements/1.1/"
  const IRI_DcTitle = NS_Dc + "title"
  const FACETS_string = ["pattern", "length", "minlength", "maxlength"]
  const FACETS_numericRange = ["minexclusive", "mininclusive", "maxexclusive", "maxinclusive"]
  const FACETS_numericLength = ["totaldigits", "fractiondigits"]
  const FACETS_supported = FACETS_string.concat(FACETS_numericRange).concat(FACETS_numericLength)
  const NS_Ui = "http://www.w3.org/ns/ui#"
  const IRI_UiSize = NS_Ui + "size"
  const IRI_UiLabel = NS_Ui + "label"
  const IRI_UiContents = NS_Ui + "contents"
  const IRI_UiFrom = NS_Ui + "from"
  const IRI_UiType = IRI_RdfType
  const IRI_UiType_input = NS_Ui + "SingleLineTextField"
  const IRI_UiType_textarea = NS_Ui + "MultiLineTextField"
  const NS_Layout = "http://janeirodigital.com/layout#"
  const IRI_LayoutReadOnly = NS_Layout + "readonly"
  const F = N3.DataFactory

  const TERM_RdfType = F.namedNode(IRI_RdfType)
  const TERM_LayoutType = F.namedNode(NS_Layout + "Layout")
  const TERM_LayoutAnnotation = F.namedNode(NS_Layout + "annotation")
  const TERM_LayoutPath = F.namedNode(NS_Layout + "path")
  const TERM_LayoutRef = F.namedNode(NS_Layout + "ref")


  /** ShExType -- classify @parm as a ShExJ type or IRIREF or Literal
   */
  function ShExType (parm) {
    switch (typeof parm) {
    case "string": return ShExType.IRIREF
    case "object":
      switch (parm.type) {
      case "": return ShExType.Literal
        // case null: return "null"
        // case "undefined": return undefined
      default:
        const ret = ShExType[parm.type]
        if (ret) return ret
        if ("value" in parm) return ShExType.Literal
        throw Error("unknown object: " + JSON.stringify(parm))
      }
    default: throw Error("unknown term: " + JSON.stringify(parm))
    }
  }
  Object.assign(ShExType,
                [ "IRIREF", "Literal", "Schema",
                  "ShapeOr", "ShapeAnd", "ShapeNot", "ShapeExternal", "NodeConstraint", "Shape",
                  "ObjectLiteral", "IriStem", "IriStemRange", "LiteralStem", "LiteralStemRange",
                  "Language", "LanguageStem", "LanguageStemRange", "Wildcard",
                  "EachOf", "OneOf", "TripleConstraint",
                  "SemAct", "Annotation"].reduce((acc, key) => {
                    acc[key] = "ShExType " + key;
                    return acc;
                  }, {}))
  ShExType.stems = Object.keys(ShExType).filter(t => t.match(/stem/i)).map(k => ShExType[k])

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
      link: "http://rdfshape.weso.es/validate?triggerMode=ShapeMap&" },
    { label: "form", name: "shex-form",
      link: "?" }
  ]

  const SchemaEditor = ace.edit("schema-editor")
  const LayoutEditor = ace.edit("layout-editor")
  const DataEditor =   ace.edit("data-editor")
  const Editables = {
    schema: {type: "editor", parm: "schemaURL", selector: "#schema-editor", parser: parseSchema, root: "shape", mode: "ace/mode/shexc"},
    layout: {type: "editor", parm: "layoutURL", selector: "#layout-editor", parser: parseLayout},
    data  : {type: "editor", parm: "dataURL",   selector: "#data-editor"  , parser: parseData  , root: "node"}
  }
  const InputLoaders = [
    {type: "select", parm: "schemaFormat", selector: "#schemaFormat" , parser: t => {
      console.log(t)
      return t}, val: function (v) {
        $(this.selector).val(v)
      }}
  ].concat(Object.values(Editables))

  // enable ace editors
  Object.values(Editables).forEach(edible => {
    edible.editor = ace.edit($(edible.selector).get(0))
    edible.editor.setTheme("ace/theme/textmate")
    if (edible.mode)
      edible.editor.session.setMode(edible.mode)
    edible.val = v =>
      typeof v === "undefined"
      ? edible.editor.getValue()
      : edible.editor.setValue(v, 1)
  })

  const CGIparms = location.search.substr(1).split(/[,&]/).map(
    pair => pair.split("=").map(decodeURIComponent)
  )

  // load manifest(s)
  CGIparms.forEach(p => {
    if (p[0] === "manifestURL") {
      const mURL = new URL(p[1], location)
      fetch(mURL).
        then(resp => resp.json()).
        then(j => loadManifest(j, mURL))
    } else if (p[0] === "manifest") {
      loadManifest(JSON.parse(p[1]), location.href)
    }
  })

  // load shape, layout, data, etc. from the rest of the CGI parms
  loadManifestEntry(CGIparms.filter(
    p => p[0] !== "manifestURL"
  ).reduce((acc, p) => {
    acc[p[0]] = p[1]
    return acc
  }, {}), location.href);

  // re-generate start shape select whenever clicked
  $("#start-shape").on("mousedown", evt => {
    getSchemaPromises().catch(alert)
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
        paintShapeChoice(null, schema)

        accept(schema)
      } catch (e) {
        alert(e)
      }
    })
  })

  // [↙] button
  $("#shexj-to-form").on("click", evt => {
    // get schema from ShExC
    getSchemaPromises().then(
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
    let schemaPz = getSchemaPromises()
    let graphP = parseData()

    Promise.all([schemaPz, graphP]).then(both => {
      let [[schema, layout], graph] = both
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

  function loadManifest (entries, base) {
    let buttons = []
    entries.forEach(entry => {
      const newButton = $("<button/>").text(entry.title).attr("title", entry.desc).on("click", evt => {
        let target = $(evt.target)
        if (target.hasClass("selected")) {
          Object.values(Editables).forEach(ed => {
            ed.val("")
          })
          target.removeClass("selected")
        } else {
          buttons.forEach(b => b.removeClass("selected"))
          loadManifestEntry(entry, base)
          target.addClass("selected")
        }
      })
      buttons.push(newButton)
      const toAdd = $("<li/>").append(newButton)
      $(".manifest").append(toAdd)
    })
  }

  function loadManifestEntry (entry, baseURL) {
    Promise.all(InputLoaders.map(loader => {
      let isURL = loader.parm.endsWith("URL");
      const direct = isURL ? loader.parm.substr(0, loader.parm.length-3) : null
      let urlOrValue = entry[loader.parm]
      if (isURL && urlOrValue === undefined && direct in entry) {
        isURL = false
        urlOrValue = entry[direct]
      }
      if (urlOrValue == undefined) {
        // wasn't passed; leave it alone
      } else if (isURL) {
        const fromURL = new URL(urlOrValue, baseURL)
        return fetch(fromURL).then(resp => resp.text()).then(text => {
          loader.val(text)
          return loader.parser(loader.root ? new URL(entry[loader.root], fromURL).href : undefined)
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
    const pathResolver = shexPath(schema, Meta.shexc)
    layout.getQuads(null, TERM_RdfType, TERM_LayoutType).forEach(quad => {
      const annotated = layout.getQuads(quad.subject, TERM_LayoutAnnotation, null).map(t => {
        let elt = null
        let quads = layout.getQuads(t.object, TERM_LayoutRef, null)
        if (quads.length) {
          if (!index)
            index = shexCore.Util.index(schema);
          let lookFor = quads[0].object.value
          elt = index.shapeExprs[lookFor] || index.tripleExprs[lookFor]
          // console.log([elt, quads[0].object.value, index])
        } else {
          const pathStr = layout.getQuads(t.object, TERM_LayoutPath, null)[0].object.value
          elt = pathResolver.search(pathStr)[0]
        }
        const newAnnots = layout.getQuads(t.object, null, null).filter(
          t => !t.predicate.equals(TERM_LayoutPath)
        ).map(t => {
          return {
            "type": "Annotation",
            "predicate": t.predicate.value,
            "object": RDFJStoJSONLD(t.object)}
        })
        elt.annotations = newAnnots // @@ merge, overriding same predicate values?
        return elt
      })
    })
    return schema
  }

  function RDFJStoJSONLD (rdfjsTerm) {
    return rdfjsTerm.termType === "Literal"
      ? Object.assign({"value":rdfjsTerm.value},
                      rdfjsTerm.datatypeString !== IRI_XsdString
                      ? {type: rdfjsTerm.datatypeString}
                      : {})
      : rdfjsTerm.termType === "BlankNode"
      ? "_:" + rdfjsTerm.value
      : rdfjsTerm.value
  }

  function getShExApiParms (span) {
    const schemaFormat = $("#schemaFormat").val();
    const schema = Editables.schema.val().replace(/^\n +/, "")
    const data = Editables.data.val().replace(/^\n +/, "")
    const shapeMap = localName($("#focus-node").val() || "", Meta.data)
          + "@"
          + localName($("#start-shape").val() || "", Meta.shexc)
    return { schemaFormat, schema, data, shapeMap }
  }

  function createLink (base, shExApiParms) {
    return base + [
      "interface=minimal",
      "schemaFormat=" + encodeURIComponent(shExApiParms.schemaFormat),
      "schema=" + encodeURIComponent(shExApiParms.schema),
      "data=" + encodeURIComponent(shExApiParms.data),
      "shape-map=" + encodeURIComponent(shExApiParms.shapeMap)
    ].join("&");
  }

  // node and shape selectors

  function paintShapeChoice (root, schema) {
    let selected = root || $("#start-shape").val()
    $("#start-shape").empty().append(schema.shapes.map(
      shape =>
        $("<option/>", Object.assign(
          {value: shape.id},
          shape.id === selected ? { selected: "selected" } : {}
        )).append(localName(shape.id, Meta.shexc))
    ))
    return schema
  }

  function paintNodeChoice (root, graph) {
    let selected = root || $("#focus-node").val()
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

  function parseSchema (root) {
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
        paintShapeChoice(root, schema)

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
    return Promise.all([parseSchema().then(schemaParsed), parseLayout()]).then(pair => {
      $("#a-ui").attr("href", "data:text/turtle;charset=utf-8;base64,"
                      /*+ btoa(ShExToUi(annotateSchema(pair[0], pair[1]), F, Meta.shexc))*/)
      return pair
    })
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

  function parseData (root) {
    return parseTurtle("Data", Meta.data, Editables.data).then(graph => {
      paintNodeChoice(root, graph)
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
    return (shexpr.annotations || []).find(a => a.predicate === IRI_UiLabel || a.predicate === IRI_UiContents)
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
      const facets = Object.keys(nc).filter(f => FACETS_supported.includes(f))

      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc || facets.length > 0))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        return $("<input/>").on("blur", evt => {
          let jElt = $(evt.target)
          let lexicalValue = jElt.val()
          const newTerm = makeTerm(lexicalValue, evt)
          let res = validator._validateShapeExpr(null, newTerm, nc, "", null, {})
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
        // case IRI_XsdString:
        // case IRI_XsdDateTime:
        // case IRI_XsdInteger:
        case IRI_RdfLangString:
          return [$("<span/>").append("\"", validatedInput((s, evt) => {
            return "\"" + s.replace(/"/g, "\\\"") + "\"@" + $(evt.target.nextElementSibling).val()
          }), "\"@", validatedInput(
            (s, evt) => "\""+$(evt.target.previousElementSibling).val()+"\"@" + s
          ).attr("size", 5).val("en"))]
        default:
          return [$("<span/>").append("\"", validatedInput(s => scalarize(s, nc.datatype)), "\"^^"+localName(nc.datatype, Meta.shexc))]
          // throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc)
        if (nc.values.find(v => ShExType.stems.indexOf(ShExType(v)) !== -1)) {
          return [validatedInput(s => s)]
        } else {
          return [$("<select/>").append(nc.values.map(v => {
            const vType = ShExType(v);
            let vStr = vType === ShExType.Literal
                ? v.value      // a string
                : vType === ShExType.IriStem // crappy solution; should it be an input?
                ? v.stem
                : localName(v, Meta.shexc) // an IRI
            return $("<option/>", {value: vStr}).text(vStr)
          }))]
        }
      let list = facets.filter(f => FACETS_numericRange.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, nc[list[0]].datatype))]

      list = facets.filter(f => FACETS_numericLength.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, IRI_XsdDecimal))]

      list = facets.filter(f => FACETS_string.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, IRI_XsdString))]

      throw Error("ProgramFlowError: paintNodeConstraint arrived at bottom")
    }

    function scalarize (s, datatype) {
      return "\"" + s.replace(/"/g, "\\\"") + "\"^^" + datatype
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

    function uuidv4 () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    function paintTripleConstraint (tc) {
      if (tc.max === 0)
        return []
      let label = findLabel(tc);
      let ret = $("<li/>").append($("<span/>", {class: "predicate"}).text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc)))
      if (typeof tc.max !== "undefined" && tc.max !== 1)
        ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      if (tc.valueExpr) {
        let rendered = paintShapeExpression(tc.valueExpr)
        let superClass = (tc.annotations || []).find(a => a.predicate === IRI_UiFrom)
        if (superClass) {
          // If we have a dynamic ValueSet, paint what we have but replace it after the fetch.
          const klass = uuidv4() // Mark everything with a unique class.
          rendered.forEach(v => v.addClass(klass))
          const url = new URL(superClass.object)
          url.protocol = location.protocol
          fetch(url).then(resp => resp.text()).then(
            rdfsText => {
              // Parse the response.
              let graph = new N3.Store()
              let parser = new N3.Parser({format: "application/turtle", baseIRI: superClass.object})
              graph.addQuads(parser.parse(rdfsText))
              // Get all subclasses of the stated suerclass.
              const values = graph.getQuads(null, IRI_RdfsSubClassOf, superClass.object)
                    .map(q => q.subject.value)
              // Re-paint the ValueSet.
              let fetchedRendering = paintShapeExpression(Object.assign({}, tc.valueExpr, {values}))
              fetchedRendering = annotationTweaks(fetchedRendering, tc.annotations)
              // Replace old elements with newly-painted ValueSet.
              const old = $("." + klass)
              old.slice(1).remove()
              old.slice(0,1).replaceWith(fetchedRendering)
            })
        }
        rendered = annotationTweaks(rendered, tc.annotations)
        ret.append(rendered)
      }
      return [ret]
    }

    function annotationTweaks (rendered, annotations) {
      let ro = (annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
      if (ro)
        rendered.forEach(h => h.attr("readonly", "readonly"))
      let size = (annotations || []).find(a => a.predicate === IRI_UiSize)
      if (size)
        rendered.forEach(h => h.attr("size", size.object.value))
      let type = (annotations || []).find(a => a.predicate === IRI_UiType)
      if (type)
        switch (type.object) {
        case (IRI_UiType_input):
        case (NS_Ui + "EmailField"):
        case (NS_Ui + "PhoneField"):
          break
        case (IRI_UiType_textarea):
          rendered.map(h => h.attr("size", 2))
          break
        default:
          throw Error("Unrecognized UI type: " + type.object)
        }
      return rendered
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

    function derefShapeExpression (shapeExpr) {
      return typeof shapeExpr === "string"
        ? findShapeExpression(shexpr)
        : shapeExpr
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
      const facets = Object.keys(nc).filter(f => FACETS_supported.includes(f))

      if (!("datatype" in nc || "nodeKind" in nc || "values" in nc || facets.length > 0))
        throw Error("paintNodeConstraint(" + JSON.stringify(nc, null, 2) + ")")

      function validatedInput (makeTerm) {
        let jElt = $("<input/>").data("triple", tested).on("blur", evt => {
          let lexicalValue = jElt.val()
          let newTerm = makeTerm(lexicalValue, evt)
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
        case IRI_RdfLangString:
          return [$("<span/>").append("\"", validatedInput((s, evt) => {
            return "\"" + s.replace(/"/g, "\\\"") + "\"@" + $(evt.target.nextElementSibling).val()
          }).val(tested.object.value), "\"@", validatedInput(
            (s, evt) => "\""+$(evt.target.previousElementSibling).val()+"\"@" + s
          ).attr("size", 5).val(tested.object.language))]
        default:
          return [$("<span/>").append("\"", validatedInput(s => scalarize(s, nc.datatype)).val(tested.object.value), "\"^^"+localName(nc.datatype, Meta.shexc))]
          // throw Error("paintNodeConstraint({datatype: " + nc.datatype + "})")
        }

      if ("nodeKind" in nc)
        switch (nc.nodeKind) {
        case "iri" : 
          return [validatedInput(s => s).val(tested.object)] // JSON-LD IRIs are expressed directly as strings.
        default:
          throw Error("paintNodeConstraint({nodeKind: " + nc.nodeKind + "})")
        }

      if ("values" in nc) {
        if (nc.values.find(v => ShExType.stems.indexOf(ShExType(v)) !== -1)) {
          return [validatedInput(s => s).val(tested.object)]
        } else {
          let jElt = $("<select/>").append(nc.values.map(v => {
            const vType = ShExType(v);
            let vStr = vType === ShExType.Literal
                ? v.value      // a string
                // : vType === ShExType.IriStem // crappy solution; should it be an input?
                // ? v.stem
                : localName(v, Meta.shexc) // an IRI
            let ret = $("<option/>", {value: vType === ShExType.Literal ? scalarize(v.value, v.datatype) : v }).text(vStr)
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
      }

      let list = facets.filter(f => FACETS_numericRange.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, nc[list[0]].datatype)).val(tested.object.value)]

      list = facets.filter(f => FACETS_numericLength.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, IRI_XsdDecimal)).val(tested.object.value)]

      list = facets.filter(f => FACETS_string.includes(f))
      if (list.length > 0)
        return [validatedInput(s => scalarize(s, IRI_XsdString)).val(tested.object.value)]

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
      let ret = $("<li/>").append($("<span/>", {class: "predicate"}).text(label ? label.object.value : tc.predicate === IRI_RdfType ? "a" : localName(tc.predicate, Meta.shexc)))
      // if (typeof tc.max !== "undefined" && tc.max !== 1)
      //   ret.append([" ", $("<span/>", { class: "add" }).text("+")])
      return [ret.append(tc.solutions.reduce(
        (acc, soln, idx) => {
          if (tc.valueExpr) {
            let valueHtml = paintShapeExpression(tc.valueExpr, soln)
            let ro = (tc.annotations || []).find(a => a.predicate === IRI_LayoutReadOnly)
            if (ro)
              valueHtml.forEach(h => h.attr("readonly", "readonly"))
            let size = (tc.annotations || []).find(a => a.predicate === IRI_UiSize)
            if (size)
              valueHtml.forEach(h => h.attr("size", size.object.value))
            return (idx > 0 ? acc.concat(", ") : acc).concat(valueHtml)
          } else {
            throw Error("PF")
          }
        }, []))]
    }
  }
})()
