(function () {
  let shexc = defaultShExC()
  $(".shexc textarea").val(shexc)
  $(".panel pre")
    .hide()
    .height($(".shexc textarea").height())
    .on("click", evt => {
      $(evt.target).parent().hide()
      $(evt.target).parent().parent().find("textarea").show()
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
      $(".shexj textarea").val(JSON.stringify(shexCore.Util.AStoShExJ(as), null, 2))
      $("#shexj-to-form").click()
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
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX : <http://janeirodigital.com/ns#layout>
# PREFIX solid: <http://www.w3.org/ns/solid/terms#>

<#UserProfile> {
  (   foaf:name xsd:string
        // :key "name"
        // :label "Name"
        // :icon "user" ;
    | vcard:fn xsd:string
        // :key "name"
        // :label "Name"
        // :icon "user"
  )+ ;
  vcard:phone IRI /^tel:\+?[0-9.-]/ ?
    // :key "phone"
    // :label "Phone"
    // :icon "phone" ;
  vcard:role xsd:string ?
    // :key "role"
    // :label "Role"
    // :icon "user-astronaut" ;
  vcard:hasEmail @<#vcard_value> ?
    // :key "email"
    // :label "Email"
    // :icon "envelope"
    // :nodeBlank "vcard:value" ;
  vcard:organization-name xsd:string ?
    // :key "company"
    // :label "Company"
    // :icon "building" ;
  vcard:hasAddress @<#vcard_street-address> ?
    // :key "address"
    // :label "Address"
    // :icon "map-marker-alt" ;
}

<#vcard_value> CLOSED {
  a [vcard:Home vcard:Work] ;
  vcard:value xsd:string
}

<#vcard_street-address> CLOSED {
  a [vcard:StreetAddress] ? ;
  vcard:street-address xsd:string ? ;
  vcard:locality xsd:string ? ;
  vcard:region xsd:string ? ;
  vcard:country-name @<#vcard_country-name> ?
    // :key "country"
    // :label "Country"
    // :icon "flag" ;
  vcard:postal-code xsd:string ?
}

<#vcard_country-name> xsd:string MINLENGTH 2`
  }

})()
