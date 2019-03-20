(function () {
  let shexc = defaultShExC()
  $(".shexc textarea").val(shexc)
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
}

<#vcard_street-address> CLOSED {
  a [vc:StreetAddress] ? ;
  vc:street-address xsd:string ? // rdfs:label "street" ;
  (   vc:locality xsd:string ? ;
    | vc:region xsd:string ?
  ) ;
  vc:country-name @<#vcard_country-name> ?
    // rdfs:label "country" ;
  vc:postal-code xsd:string ?
}

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
