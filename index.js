(function () {
  function paintShape (schema, shexpr) {
    let div = $("<div/>", { class: "form" })
    let label = findLabel(shexpr)
    if (label)
      div.append($("<h3>").text(label.object.value))
    let ul = $("<ul/>").append(paintTripleExpression(schema, shexpr.expression))
    div.append(ul)
    return [div]
  }

  function paintTripleConstraint (schema, tc) {
    let label = findLabel(tc);
    return [$("<li/>").text(label ? label.object.value : tc.predicate)]
  }

  function paintTripleExpression (schema, texpr) {
    if (typeof texpr === "string")
      return paintTripleExpression(schema, findTripleExpression(schema, texpr)) // @@ later
    switch (texpr.type) {
    case "TripleConstraint":
      return paintTripleConstraint(schema, texpr)
    case "EachOf":
      return texpr.expressions.reduce(
        (acc, nested) =>
          acc.concat(paintTripleExpression (schema, nested)), []
      )
    case "OneOf":
      return $("<li/>", { class: "disjunction" }).append(
        $("<ul/>").append(
          texpr.expressions.reduce(
            (acc, e, idx) =>
              (idx > 0
               ? acc.concat($("<li/>", {class: "separator"}).append("<hr/>"))
               : acc)
              .concat(paintTripleExpression(schema, e)),
            []
          )
        )
      )
    default: throw Error("paintTripleExpression(" + texpr.type + ")")
    }
  }

  function paintShapeExpression (schema, shexpr) {
    if (typeof shexpr === "string")
      return paintShapeExpression(schema, findShapeExpression(schema, shexpr))
    switch (shexpr.type) {
    case "Shape": return paintShape(schema, shexpr)
    default: throw Error("paintShapeExpression(" + shexpr.type + ")")
    }
  }

  function findShapeExpression (schema, goal) {
    return schema.shapes.find(se => se.id === goal)
  }

  function findLabel (shexpr) {
    return (shexpr.annotations || []).find(a => a.predicate === IRI_rdfs)
  }

  const IRI_UserProfile = location.href + "#UserProfile"
  const IRI_rdfs = "http://www.w3.org/2000/01/rdf-schema#label"
  let Prefixes = {}

  // populate default ShExC
  $(".shexc textarea").val(defaultShExC())
  $(".panel pre")
    .hide()
    .height($(".shexc textarea").height())
    .on("click", evt => {
      let panel = $(evt.target).parents(".panel")
      panel.find("pre").hide()
      panel.find("textarea").show()
  })
  $("#shexc-to-shexj").on("click", evt => {
    let shexcText = $(".shexc textarea").val()
    let result = hljs.highlight("shexc", shexcText, true)
    $(".shexc .hljs").html(result.value)
    $(".shexc textarea").hide()
    $(".shexc pre").show()
    let parser = shexParser.construct(location.href)
    try {
      let as = parser.parse($(".shexc textarea").val())
      Prefixes = as.prefixes
      let shexjText = JSON.stringify(shexCore.Util.AStoShExJ(as), null, 2)
      $(".shexj textarea").val(shexjText)
      // $("#shexj-to-form").click() // -- causes .shexj to blank when clicked.
    } catch (e) {
      alert(e)
    }
  })
  $("#shexj-to-form").on("click", evt => {
    let result = hljs.highlight("json", $(".shexj textarea").val(), true)
    $(".shexj .hljs").html(result.value)
    $(".shexj textarea").hide()
    $(".shexj pre").show()
    try {
      let schema = JSON.parse($(".shexj textarea").val())
      $("#form").replaceWith(
        paintShapeExpression(schema, IRI_UserProfile)[0]
          .attr("id", "form")
          .addClass("panel")
      )
    } catch (e) {
      alert(e)
    }
  })

  function defaultShExC () {
    return `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vc: <http://www.w3.org/2006/vcard/ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <http://janeirodigital.com/ns#layout>
PREFIX solid: <http://www.w3.org/ns/solid/terms#>

<#UserProfile> {
  solid:webid IRI
    // rdfs:label "profile webid"
    // :readonly true ;
  (   foaf:name xsd:string
    | foaf:givenName xsd:string ;
      foaf:familyName xsd:string
  )+ ;
  foaf:homepage IRI /^tel:+?[0-9.-]/ ? ;
  vc:hasAddress @<#vcard_street-address> ? ;
  vc:organization-name xsd:string ?
    // rdfs:label "company" ;
} // rdfs:label "User Profile"

<#vcard_street-address> CLOSED {
  a [vc:StreetAddress] ? ;
  vc:street-address xsd:string ? // rdfs:label "street" ;
  (   vc:locality xsd:string ? ;
    | vc:region xsd:string ?
  ) ;
  vc:country-name @<#vcard_country-name> ?
    // rdfs:label "country" ;
  vc:postal-code xsd:string ?
} // rdfs:label "Address"

<#vcard_country-name> [
  "Afghanistan"
  "Belgium"
  "CR"
  "France"
  "United Kingdom"
  "United States"
  "Zimbabwe"
]`
  }

})()
