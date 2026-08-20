/** Layout annotations landing where the layout said.
 *
 * `annotateSchema` used to live inside index.js's browser closure, where
 * nothing could reach it.  These are the first tests shex-form has; they
 * exist because the next step is to replace this function with
 * @shexjs/schema-overlay, and you don't swap out untested code.
 */
"use strict";

const {expect} = require("chai");
const N3 = require("n3");
const ShExParser = require("@shexjs/parser");
const ShExUtil = require("@shexjs/util");
const ShapePath = require("shape-path-core");
const {annotateSchema, NS_Layout} = require("../overlay.js");

const B = "http://a.example/";
const UI = "http://www.w3.org/ns/ui#";

const SCHEMA = `PREFIX : <http://a.example/>
<http://a.example/UserProfile> {
  $<http://a.example/UserProfile-webid> :webid IRI ;
  :organization-name . ;
  :address @<http://a.example/Address>
}
<http://a.example/Address> IRI
`;

const parse = () => ShExParser.construct(B, null, {index: true})
      .parse(SCHEMA, B, undefined, "overlay-test");

const layoutOf = turtle => {
  const store = new N3.Store();
  store.addQuads(new N3.Parser({baseIRI: B, format: "text/turtle"}).parse(
    `PREFIX layout: <${NS_Layout}>\nPREFIX ui: <${UI}>\nPREFIX : <http://a.example/>\n` + turtle));
  return store;
};

/** the page passes its own; these are the current libraries */
const DEPS = {
  index: schema => ShExUtil.ShExJtoAS(schema)._index,
  resolvePath: (schema, pathStr) =>
    new ShapePath.Parser.ShapePathParser({base: new URL(B), prefixes: {"": B}})
      .parse(pathStr)
      .evalPathExpr([schema], new ShapePath.Ast.EvalContext(schema)),
};

const apply = turtle => annotateSchema(parse(), layoutOf(turtle), DEPS);
const shapeOf = (schema, id) => schema.shapes.find(s => s.id === B + id).shapeExpr;
const tcOf = (schema, i) => shapeOf(schema, "UserProfile").expression.expressions[i];
/** annotations as "predicate=object" */
const annots = elt => (elt.annotations || []).map(
  a => a.predicate.replace(UI, "ui:") + "=" + (a.object.value || a.object));

describe("layout annotations", function () {

  describe("naming an element", function () {

    it("should annotate a shape named by :ref", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ; ui:label "User Profile" ] .`);
      const decl = schema.shapes.find(s => s.id === B + "UserProfile");
      expect(decl, "a ShapeDecl has no annotations in ShExJ").to.not.have.property("annotations");
      expect(annots(decl.shapeExpr)).to.deep.equal(["ui:label=User Profile"]);
    });

    it("should annotate a triple expression named by :ref", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile-webid ; ui:label "profile webid" ] .`);
      expect(annots(tcOf(schema, 0))).to.deep.equal(["ui:label=profile webid"]);
    });

    it("should annotate an element selected by :path", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:path "@<http://a.example/UserProfile>~<http://a.example/organization-name>" ;
                            ui:label "company" ] .`);
      expect(annots(tcOf(schema, 1))).to.deep.equal(["ui:label=company"]);
    });

    /* $<label> arrived in shape-path-core 0.0.7; before it, a labelled
     * triple expression could only be reached by :ref. */
    it("should take a triple expression label in a :path", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:path "$<http://a.example/UserProfile-webid>" ;
                            ui:label "by label" ] .`);
      expect(annots(tcOf(schema, 0))).to.deep.equal(["ui:label=by label"]);
    });
  });

  /* The addressing terms say *which* element; they are not things to say
   * about it.  :path was filtered out before, :ref was not, so every
   * :ref-addressed element grew a spurious layout:ref annotation. */
  it("should not turn the addressing terms into annotations", function () {
    const schema = apply(`<#l> a layout:Layout ;
      layout:annotation [ layout:ref :UserProfile ; ui:label "x" ] .`);
    expect(annots(shapeOf(schema, "UserProfile"))).to.deep.equal(["ui:label=x"]);
  });

  it("should keep every annotation on one element", function () {
    const schema = apply(`<#l> a layout:Layout ;
      layout:annotation [ layout:ref :UserProfile-webid ;
                          ui:label "profile webid" ; layout:readonly true ] .`);
    expect(annots(tcOf(schema, 0)).sort()).to.deep.equal(
      [NS_Layout + "readonly=true", "ui:label=profile webid"]);
  });

  /* Two layouts over one schema, or a schema that already said something:
   * overwriting lost whichever came first. */
  it("should add to the annotations already there", function () {
    const schema = apply(`<#a> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ; ui:label "from a" ] .
      <#b> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ; ui:size 20 ] .`);
    expect(annots(shapeOf(schema, "UserProfile")).sort())
      .to.deep.equal(["ui:label=from a", "ui:size=20"]);
  });

  it("should leave the schema it read alone", function () {
    const original = parse();
    const before = JSON.stringify(original);
    const schema = annotateSchema(original, layoutOf(`<#l> a layout:Layout ;
      layout:annotation [ layout:ref :UserProfile ; ui:label "x" ] .`), DEPS);
    expect(JSON.stringify(original)).to.equal(before);
    expect(annots(shapeOf(schema, "UserProfile")).length).to.equal(1);
  });

  describe("a layout that doesn't fit the schema", function () {

    /* It used to read `elt.annotations = ...` straight off whatever the
     * lookup returned, so a name the schema didn't have was a TypeError
     * about `undefined` rather than a word about the name. */
    it("should say what labels there are when the :ref isn't one", function () {
      expect(() => apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :Nope ; ui:label "x" ] .`))
        .to.throw(/:ref <http:\/\/a.example\/Nope> is not a label/);
      expect(() => apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :Nope ; ui:label "x" ] .`))
        .to.throw(/UserProfile-webid/);
    });

    it("should say so when a :path selects nothing", function () {
      expect(() => apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:path "@<http://a.example/Nope>" ; ui:label "x" ] .`))
        .to.throw(/selected 0 elements/);
    });

    it("should refuse an annotation that names its element twice", function () {
      expect(() => apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ;
                            layout:path "@<http://a.example/UserProfile>" ; ui:label "x" ] .`))
        .to.throw(/exactly one of :ref or :path/);
    });

    it("should refuse one that names none", function () {
      expect(() => apply(`<#l> a layout:Layout ;
        layout:annotation [ ui:label "x" ] .`))
        .to.throw(/exactly one of :ref or :path/);
    });
  });

  describe("the objects it writes", function () {

    it("should keep an IRI an IRI and a plain string a string", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ; ui:from :Type ; ui:label "plain" ] .`);
      const by = p => shapeOf(schema, "UserProfile").annotations
            .find(a => a.predicate === UI + p).object;
      expect(by("from"), "an IRI").to.equal(B + "Type");
      expect(by("label"), "a plain literal").to.deep.equal({value: "plain"});
    });

    it("should keep a datatype and a language", function () {
      const schema = apply(`<#l> a layout:Layout ;
        layout:annotation [ layout:ref :UserProfile ;
                            ui:size 20 ; ui:label "bonjour"@fr ] .`);
      const by = p => shapeOf(schema, "UserProfile").annotations
            .find(a => a.predicate === UI + p).object;
      expect(by("size").type).to.equal("http://www.w3.org/2001/XMLSchema#integer");
      expect(by("label")).to.deep.equal({value: "bonjour", language: "fr"});
    });
  });
});
