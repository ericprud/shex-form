ace.define("ace/mode/doc_comment_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var DocCommentHighlightRules = function() {
    this.$rules = {
        "start" : [ {
            token : "comment.doc.tag",
            regex : "@[\\w\\d_]+" // TODO: fix email addresses
        }, 
        DocCommentHighlightRules.getTagRule(),
        {
            defaultToken : "comment.doc",
            caseInsensitive: true
        }]
    };
};

oop.inherits(DocCommentHighlightRules, TextHighlightRules);

DocCommentHighlightRules.getTagRule = function(start) {
    return {
        token : "comment.doc.tag.storage.type",
        regex : "\\b(?:TODO|FIXME|XXX|HACK)\\b"
    };
};

DocCommentHighlightRules.getStartRule = function(start) {
    return {
        token : "comment.doc", // doc comment
        regex : "\\/\\*(?=\\*)",
        next  : start
    };
};

DocCommentHighlightRules.getEndRule = function (start) {
    return {
        token : "comment.doc", // closing comment
        regex : "\\*\\/",
        next  : start
    };
};


exports.DocCommentHighlightRules = DocCommentHighlightRules;

});

ace.define("ace/mode/shexc_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/doc_comment_highlight_rules","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

  var oop = require("../lib/oop");
  var DocCommentHighlightRules = require("./doc_comment_highlight_rules").DocCommentHighlightRules;
  var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;
  var HEX_RE = '[0-9a-fA-F]'
  var UCHAR_RE = '\\\\(?:u' + HEX_RE + '{4}|U' + HEX_RE + '{8})'
  var UCHAR_BAD_RE = '\\\\(?:u' + HEX_RE + '{0,4}|U' + HEX_RE + '{0,8})'
  var ECHAR_RE = '\\\\[tbnrf\\\\"\']'
  var ECHAR_BAD_RE = '\\\\[^tbnrf\\\\"\']'
  var STRING_ESCAPE_RE = '(' + ECHAR_RE + '|' + UCHAR_RE + ')'
  var STRING_ESCAPE_BAD_RE = '(' + ECHAR_BAD_RE + '|' + UCHAR_BAD_RE + ')'
  var PN_CHARS_BASE_RE = '(?:[a-zA-Z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDCFF])' // last is UTF16 for \U00010000-\U000EFFFF
  var PN_CHARS_U_RE = [PN_CHARS_BASE_RE, '_'].join('|')
  var PN_CHARS_RE = '(' + [PN_CHARS_U_RE, '-', '[0-9\u00B7\u0300-\u036F\u203F-\u2040]'].join('|') + ')'
  var PN_PREFIX_RE = PN_CHARS_BASE_RE + '((' + PN_CHARS_RE + '|\\.)*' + PN_CHARS_RE + ')?'
  var PNAME_NS_RE = '(' + PN_PREFIX_RE + ')?:'
  var LANGTAG_RE = "@[a-zA-Z]+(-[a-zA-Z0-9]+)*"
  var INTEGER_RE = /[0-9]+/
  var DECIMAL_RE = /[+-]?[0-9]*\.[0-9]+/
  var DOUBLE_RE = /[+-]?([0-9]+\.[0-9]*[eE][+-]?[0-9]+|\.?[0-9]+[eE][+-]?[0-9]+)/
  var PN_LOCAL_ESC_RE = '\\\\[_~.!$&\'()*+,;=/?#@%-]'
  var PERCENT_RE = '%' + HEX_RE + HEX_RE
  var PERCENT_BAD_RE = '%' + HEX_RE + '{0,2}'
  var PLX_RE = [PERCENT_RE, PN_LOCAL_ESC_RE].join('|')
  var PN_LOCAL_RE = // '(' + "[a-zA-Z0-9-]" + ')' + '(' + "[a-zA-Z0-9-]" + ')*'
      '(' + [PN_CHARS_U_RE, ':', '[0-9]', PLX_RE].join('|') + ')'
      + '(' + '(' + [PN_CHARS_RE, '\\.', ':', PLX_RE].join('|') + ')' + ')*'
  var PNAME_LN_RE = PNAME_NS_RE + PN_LOCAL_RE
  var PERCENT = { className: 'meta-keyword', begin: PERCENT_RE }
  var UCHAR = { className: 'meta-keyword', begin: UCHAR_RE }
  var PN_LOCAL_ESC = { className: 'meta-keyword', begin: PN_LOCAL_ESC_RE }

  var LANGTAG_RE = /@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/
  var cardinality_RE = /[*+?]|\{[0-9]+(?:,(?:[0-9]+|\*)?)?\}/
  var booleanLiteral_RE = /true|false/


  var ShExCHighlightRules = function(options) {

    const allInvalid = [ { regex: /\s+/, token: "whiteSpace" }, { regex: /./, token: "invalid" } ]

    const iri_LA = lookAhead('<', PNAME_NS_RE)
    const valueSet_RE = '\\['
    const litNodeKind = anyCase("LITERAL")
    const nonLitNodeKind = anyCase("IRI", "BNODE", "NONLITERAL")
    const stringLength = anyCase("Length", "MinLength", "MaxLength")
    const numericRange = anyCase("MinInclusive", "MinExclusive", "MaxInclusive", "MaxExclusive")
    const numericLength = anyCase("TotalDigits", "FractionDigits")

    const nonLitNodeConstraint_LA = lookAhead(nonLitNodeKind, stringLength, "\\/(?!/)")
    const litNodeConstraint_LA = lookAhead(litNodeKind, iri_LA, valueSet_RE, numericRange, numericLength)
    const shapeDefinition_LA = lookAhead(anyCase("EXTRA", "CLOSED"), '\\{')
    const shapeOrRef_LA = lookAhead(shapeDefinition_LA, "@")
    function nottableAtom (leader = "") {
      const ret = {  }
      ret[leader + "shapeNot"] = [
        { regex: /\s/, token: "whiteSpace" },
        { regex: anyCase("NOT"), token: "keyword", next: leader + "shapeAtom" },
        { regex: /(?:)/, next: leader + "shapeAtom" }
      ]
      ret[leader + "shapeAtom"] = [
        { regex: nonLitNodeConstraint_LA, token: "keyword", push: leader + "nonLitNodeConstraint", next: leader + "shapeOrRefOpt" },
        { regex: litNodeConstraint_LA, token: "keyword", push: leader + "litNodeConstraint", next: leader + "andOrOpt" },
        { regex: shapeDefinition_LA, token: "keyword", push: "shape", next: leader + "nonLitNodeConstraintOpt" },
        { regex: /@/, token: "operator", push: "shapeRef", next: leader + "nonLitNodeConstraintOpt" },
        { regex: /\(/, token: "lparen", push: "nested_shapeNot", next: leader + "andOrOpt" },
        { regex: /\./, token: "keyword.atom", next: leader + "andOrOpt" },
        allInvalid
      ]
      ret[leader + "nonLitNodeConstraint"] = [
        { regex: nonLitNodeKind, token: "keyword", next: leader + "stringFacetStar" },
        { regex: stringLength, token: "keyword", push: "integer", next: leader + "shapeOrRefOpt" },
        { regex: "\\/(?!/)", token: "string.regexp", push: "regex", next: leader + "shapeOrRefOpt" },
        allInvalid
      ]
      ret[leader + "nonLitNodeConstraintOpt"] = [
        { regex: nonLitNodeKind, token: "keyword", next: leader + "andOrOpt" },
        { regex: stringLength, token: "keyword", push: "integer", next: leader + "andOrOpt" },
        { regex: "\\/(?!/)", token: "string.regexp", push: "regex", next: leader + "andOrOpt" },
        { regex: /(?:)/, next: leader + "andOrOpt" }
      ]
      ret[leader + "litNodeConstraint"] = [
        { regex: nonLitNodeKind, token: "keyword", next: leader + "xsFacetStar" },
        iri(".atom.datatype", { next: leader + "xsFacetStar" }),
        { regex: /\[/, token: "operator", push: "valueSet", next: leader + "xsFacetStar" },
        { regex: numericRange, token: "keyword", push: "numeric" },
        { regex: numericLength, token: "keyword", push: "integer", next: "pop" },
        allInvalid
      ]
      ret[leader + "shapeOrRefOpt"] = [
        { regex: shapeDefinition_LA, token: "keyword", push: "shape", next: leader + "andOrOpt" },
        { regex: /@/, token: "operator", push: "shapeRef", next: leader + "andOrOpt" },
        { regex: /(?:)/, next: leader + "andOrOpt" }
      ]
      ret[leader + "stringFacetStar"] = [
        { regex: /\s/, token: "whiteSpace" },
        { regex: stringLength, token: "keyword", push: "integer", next: leader + "stringFacetStar" },
        { regex: "\\/(?!/)", token: "string.regexp", push: "regex", next: leader + "stringFacetStar" },
        { regex: /(?:)/, next: leader + "shapeOrRefOpt" }
      ]
      ret[leader + "xsFacetStar"] = [
        { regex: /\s/, token: "whiteSpace" },
        { regex: stringLength, token: "keyword", push: "integer", next: leader + "xsFacetStar" },
        { regex: numericRange, token: "keyword", push: "numeric", next: leader + "xsFacetStar" },
        { regex: numericLength, token: "keyword", push: "integer", next: leader + "xsFacetStar" },
        { regex: /(?:)/, next: "pop" }
      ]
      return ret
    }

    this.$rules = Object.assign(
      { start: [ { regex: /(?:)/, token: "keyword", next: "shexDoc" } ],
        shexDoc: [
          { regex: anyCase("PREFIX"), token: "keyword", push: "prefix_PNAME_NS" }, // IRIREF will pop
          { regex: anyCase("BASE", "IMPORT"), token: "keyword", push: "IRIREF" },
          { regex: anyCase("START"), token: "keyword", push: "start_equals" },
          iri(".function.shapeExprLabel", {next: "shexDoc", push: "shapeNot" }),
          allInvalid
        ],
        start_equals: [
          { regex: /=/, token: "constant", next: "shapeNot" },
          allInvalid
        ],
        prefix_PNAME_NS: [
          { regex: PNAME_NS_RE, token: "constant.library", next: "IRIREF" },
          allInvalid
        ],
        IRIREF: IRIREF(""), // for PREFIX decls
      },
      nottableAtom(""),
      { andOrOpt: [
        { regex: /\/\//, token: "annotation.meta.shapeExpr", push: "annotationPredicate", next: "andOrOpt" },
        { regex: anyCase("AND", "OR"), token: "keyword", next: "shapeNot" },
        { regex: /\s+/, token: "whiteSpace" },
        { regex: /(?:)/, next: "pop" }
      ] },
      nottableAtom("nested_"),
      { nested_andOrOpt: [
        { regex: /\/\//, token: "annotation.meta.shapeExpr", push: "annotationPredicate", next: "nested_andOrOpt" },
        { regex: anyCase("AND", "OR"), token: "keyword", next: "nested_shapeNot" },
        { regex: /\)/, token: "rparen", next: "pop" },
        allInvalid
      ] },

      { shapeRef: [
        iri(".atom.shapeExprRef", {next: "pop" }),
        allInvalid
      ] },


      { shape: [
        { regex: anyCase("CLOSED"), token: "keyword"},
        { regex: anyCase("EXTRA"), token: "keyword", next: "extra" },
        { regex: /\{/, token: "lcurly", next: "tripleExpression" },
        allInvalid
      ],
        extra: [ // TODO: EXTRA { ... } is illegal but what should we mark invalid?
          { regex: "(?=" + anyCase("CLOSED") + ")", next: "shape" },
          { regex: "(?=\{)", next: "shape" },
          iri("", { next: "extra" }),
          allInvalid
        ] },

      {
        tripleExpression: [
          iri(".atom.predicate", { push: "shapeNot", next: "eachOneOpt" }),
          { regex: /\ba\b/, token: "constant.language.atom.predicate", push: "shapeNot", next: "eachOneOpt" },
          { regex: /\$/, token: "operator", push: "tripleExprLabel", next: "tripleExpression" },
          { regex: /&/, token: "operator", push: "inclusion", next: "eachOneOpt" },
          { regex: /\(/, token: "lparen", push: "bracketedTripleExpr", next: "eachOneOpt" },
          { regex: /\}/, token: "rcurly", next: "pop" },
          allInvalid
        ],
        eachOneOpt: [
          { regex: cardinality_RE, token: "constant", next: "eachOneOpt" },
          { regex: /\/\//, token: "annotation.meta.shapeExpr", push: "annotationPredicate", next: "eachOneOpt" },
          { regex: /;/, token: "operator", next: "orOpt" },
          { regex: /\|/, token: "operator", next: "tripleExpr" },
          { regex: /\s+/, token: "whiteSpace" },
          { regex: /\}/, token: "rcurly", next: "pop" },
          allInvalid
        ],
        orOpt: [
          { regex: /\s+/, token: "whiteSpace" },
          { regex: /\|/, token: "operator", next: "tripleExpression" },
          { regex: /(?:)/, next: "tripleExpression" }
        ],

        bracketedTripleExpr: [
          iri(".atom.predicate", { push: "shapeNot", next: "bracketedEachOneOpt" }),
          { regex: /\ba\b/, token: "constant.language.atom.predicate", push: "shapeNot", next: "bracketedEachOneOpt" },
          { regex: /\$/, token: "operator", push: "tripleExprLabel", next: "bracketedTripleExpr" },
          { regex: /&/, token: "operator", push: "inclusion", next: "bracketedEachOneOpt" },
          { regex: /\(/, token: "lparen", push: "bracketed_tripleExpression", next: "bracketedEachOneOpt" },
          { regex: /\}/, token: "invalid", next: "pop" }, // error state. TODO: pop all the way to "shape"
          allInvalid
        ],
        bracketedEachOneOpt: [
          { regex: cardinality_RE, token: "constant", next: "bracketedEachOneOpt" },
          { regex: /\/\//, token: "annotation.meta.shapeExpr", push: "annotationPredicate", next: "bracketedEachOneOpt" },
          { regex: /;/, token: "operator", next: "bracketedOrOpt" },
          { regex: /\|/, token: "operator", next: "bracketedTripleExpr" },
          { regex: /\)/, token: "rparen", next: "pop" },
          allInvalid
        ],
        bracketedOrOpt: [
          { regex: /\s+/, token: "whiteSpace" },
          { regex: /\|/, token: "operator", next: "bracketedTripleExpr" },
          { regex: /(?:)/, next: "bracketedTripleExpr" }
        ],

        tripleExprLabel: [
          iri(".atom.tripleExprLabel", { next: "pop" } ),
          allInvalid
        ],

        inclusion: [
          iri(".atom.tripleExprRef", { next: "pop" } ),
          allInvalid
        ],

        valueSet: [
          { regex: /\]/, token: "operator", next: "pop" },
          { regex: /\./, token: "keyword", next: "valueSet" },
          { regex: /[~-]/, token: "operator", next: "valueSet" },
          iri(".valueSetValue", { next: "valueSet" } ),
          literal("value.string.valueSetValue", { next: "valueSet" } ),
          { regex: LANGTAG_RE, token: "meta.langtag", next: "valueSet" },
          allInvalid
        ],

        annotationPredicate: [
          { regex: /\s+/, token: "whiteSpace.annotation" },
          iri(".annotation.predicate", { next: "annotationObject" }),
          allInvalid
        ],
        annotationObject: [
          { regex: /\s+/, token: "whiteSpace.annotation" },
          iri(".annotation.object", { next: "pop" }),
          literal(".annotation.object", { next: "pop" } ),
          allInvalid
        ],

        integer: [
          { regex: INTEGER_RE, token: "constant", next: "pop" },
          allInvalid
        ],
        numeric: [
          { regex: INTEGER_RE, token: "constant", next: "pop" },
          { regex: DECIMAL_RE, token: "constant", next: "pop" },
          { regex: DOUBLE_RE, token: "constant", next: "pop" },
          allInvalid
        ],
        regex: [
          {
            token: "regexp.keyword.operator",
            regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
          }, {
            token: "string.regexp",
            regex: "/[sxngimy]*",
            next: "pop"
          }, {
            token : "invalid",
            regex: /\{\d+\b,?\d*\}[+*]|[+*$^?][+*]|[$^][?]|\?{3,}/
          }, {
            token : "constant.language.escape",
            regex: /\(\?[:=!]|\)|\{\d+\b,?\d*\}|[+*]\?|[()$^+*?.]/
          }, {
            token : "constant.language.delimiter",
            regex: /\|/
          }, {
            token: "constant.language.escape",
            regex: /\[\^?/,
            next: "regex_character_class"
          }, {
            token: "empty",
            regex: "$",
            next: "pop"
          }, {
            defaultToken: "string.regexp"
          }
        ],
        regex_character_class: [
          {
            token: "regexp.charclass.keyword.operator",
            regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
          }, {
            token: "constant.language.escape",
            regex: "]",
            next: "regex"
          }, {
            token: "constant.language.escape",
            regex: "-"
          }, {
            token: "empty",
            regex: "$",
            next: "pop"
          }, {
            defaultToken: "string.regexp.charachterclass"
          }
        ],

      },

    )
    Object.values(this.$rules).forEach(addComments)

    this.normalizeRules()

    function addComments (rules) {
      let docTagRegex
      try {
        // e.g. Chrome
        docTagRegex = new RegExp("(?<![a-zA-Z0-9_+])@[\\w\\d_]+")
      } catch (e) {
        // e.g. Firefox
        docTagRegex = new RegExp("@[\\w\\d_]+")
      }
      rules.unshift([
        {
          token : "comment.doc",
          regex : "\\/\\*(?=\\*)",
          push: [
            {
              regex : docTagRegex, // TODO: all email chars before '@'
              token : "comment.doc.tag",
            },
            DocCommentHighlightRules.getTagRule(),
            {
              regex : "\\*\\/",
              token : "comment.doc",
              next  : "pop"
            },
            {
              defaultToken : "comment.doc",
              caseInsensitive: true
            }
          ]
        }, {
          token : "comment", // multi line comment
          regex : /\/\*/,
          push: [
            DocCommentHighlightRules.getTagRule(),
            {token : "comment", regex : "\\*\\/", next : "pop"},
            {defaultToken : "comment", caseInsensitive: true}
          ]
        }, {
          token : "comment",
          regex : "#",
          push: [
            DocCommentHighlightRules.getTagRule(),
            {token : "comment", regex : "$|^", next : "pop"},
            {defaultToken : "comment", caseInsensitive: true}
          ]
        }
      ])
    }
    function iri (token, next) {
      return [
        { regex: '<', token: "constant.language" + token, next: [ // TODO: use IRIREF(token)
          { regex : UCHAR_RE, token: "constant.language" + token + ".escape" },
          { regex : UCHAR_BAD_RE, token: "constant.language" + token + ".invalid", },
          Object.assign({ regex : ">", token: "constant.language" + token }, next),
          { defaultToken: "constant.language" + token }
        ] },
        { regex: PNAME_NS_RE, token: "constant.library" + token, next: [
          { regex : PN_LOCAL_ESC_RE, token: "variable" + token + '.escape' },
          { regex : PERCENT_RE, token: "variable" + token + '.escape' },
          { regex : /-/, token: "variable" + token }, // 'cause (?!PN_LOCAL_RE) doesn't work so well
          Object.assign({ regex : "(?!" + PN_LOCAL_RE + ")", token: "variable" + token }, next), // TODO: is this sound and complete?
          { defaultToken: "variable" + token }
        ] },
      ]
    }

    function IRIREF (token) {
      return [
        { regex: '<', token: "constant.language" + token, next: [
          { regex : UCHAR_RE, token: "constant.language" + token + ".escape" },
          { regex : UCHAR_BAD_RE, token: "constant.language" + token + ".invalid", },
          { regex : ">", token: "constant.language" + token, next : "pop" },
          { defaultToken: "constant.language" + token }
        ] },
        allInvalid
      ]
    }
    function literal (token, next) {
      return [
        { regex: /"/, token: token, next: [
          { regex: STRING_ESCAPE_RE, token : token + ".escape" },
          { regex: STRING_ESCAPE_BAD_RE, token : "invalid" },
          { regex: /"/, token: token, next: [
            Object.assign({ regex: LANGTAG_RE, token: token}, next),
            { regex: /\^\^/, token: token, next: [
              iri(token + ".datatype", next ),
              allInvalid
            ] },
            Object.assign({ regex : "(?:)", token: "constant.language" + token }, next),
          ] },
          { defaultToken: "constant.language" + token }
        ] },
        { regex: /'/, token: token, next: [
          { regex: STRING_ESCAPE_RE, token : token + ".escape" },
          { regex: STRING_ESCAPE_BAD_RE, token : "invalid" },
          { regex: /'/, token: token, next: [
            Object.assign({ regex: LANGTAG_RE, token: token}, next),
            { regex: /\^\^/, token: token, next: [
              iri(token + ".datatype", next ),
              allInvalid
            ] },
            Object.assign({ regex : "(?:)", token: "constant.language" + token }, next),
          ] },
          { defaultToken: "constant.language" + token }
        ] },
        Object.assign({ regex: DOUBLE_RE, token: "constant" }, next),
        Object.assign({ regex: DECIMAL_RE, token: "constant" }, next),
        Object.assign({ regex: INTEGER_RE, token: "constant" }, next),
        Object.assign({ regex: booleanLiteral_RE, token: "constant" }, next),
      ]
    }
    function anyCase () {
      const args = Array.from(arguments)
      return "\\b(?:"+args.map(
        arg => [].map.call(
          arg, ch => "[" + ch.toUpperCase() + ch.toLowerCase() + "]"
        ).join("")
      ).join("|")+")\\b"
    }
    function lookAhead () {
      const args = Array.from(arguments)
      return "(?="+args.join("|")+")"
    }
  }

  oop.inherits(ShExCHighlightRules, TextHighlightRules)
  exports.ShExCHighlightRules = ShExCHighlightRules
})

ace.define("ace/mode/matching_brace_outdent",["require","exports","module","ace/range"], function(require, exports, module) {
"use strict";

var Range = require("../range").Range;

var MatchingBraceOutdent = function() {};

(function() {

    this.checkOutdent = function(line, input) {
        if (! /^\s+$/.test(line))
            return false;

        return /^\s*\}/.test(input);
    };

    this.autoOutdent = function(doc, row) {
        var line = doc.getLine(row);
        var match = line.match(/^(\s*\})/);

        if (!match) return 0;

        var column = match[1].length;
        var openBracePos = doc.findMatchingBracket({row: row, column: column});

        if (!openBracePos || openBracePos.row == row) return 0;

        var indent = this.$getIndent(doc.getLine(openBracePos.row));
        doc.replace(new Range(row, 0, row, column-1), indent);
    };

    this.$getIndent = function(line) {
        return line.match(/^\s*/)[0];
    };

}).call(MatchingBraceOutdent.prototype);

exports.MatchingBraceOutdent = MatchingBraceOutdent;
});

ace.define("ace/mode/folding/coffee",["require","exports","module","ace/lib/oop","ace/mode/folding/fold_mode","ace/range"], function(require, exports, module) {
"use strict";

var oop = require("../../lib/oop");
var BaseFoldMode = require("./fold_mode").FoldMode;
var Range = require("../../range").Range;

var FoldMode = exports.FoldMode = function() {};
oop.inherits(FoldMode, BaseFoldMode);

(function() {

    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var range = this.indentationBlock(session, row);
        if (range)
            return range;

        var re = /\S/;
        var line = session.getLine(row);
        var startLevel = line.search(re);
        if (startLevel == -1 || line[startLevel] != "#")
            return;

        var startColumn = line.length;
        var maxRow = session.getLength();
        var startRow = row;
        var endRow = row;

        while (++row < maxRow) {
            line = session.getLine(row);
            var level = line.search(re);

            if (level == -1)
                continue;

            if (line[level] != "#")
                break;

            endRow = row;
        }

        if (endRow > startRow) {
            var endColumn = session.getLine(endRow).length;
            return new Range(startRow, startColumn, endRow, endColumn);
        }
    };
    this.getFoldWidget = function(session, foldStyle, row) {
        var line = session.getLine(row);
        var indent = line.search(/\S/);
        var next = session.getLine(row + 1);
        var prev = session.getLine(row - 1);
        var prevIndent = prev.search(/\S/);
        var nextIndent = next.search(/\S/);

        if (indent == -1) {
            session.foldWidgets[row - 1] = prevIndent!= -1 && prevIndent < nextIndent ? "start" : "";
            return "";
        }
        if (prevIndent == -1) {
            if (indent == nextIndent && line[indent] == "#" && next[indent] == "#") {
                session.foldWidgets[row - 1] = "";
                session.foldWidgets[row + 1] = "";
                return "start";
            }
        } else if (prevIndent == indent && line[indent] == "#" && prev[indent] == "#") {
            if (session.getLine(row - 2).search(/\S/) == -1) {
                session.foldWidgets[row - 1] = "start";
                session.foldWidgets[row + 1] = "";
                return "";
            }
        }

        if (prevIndent!= -1 && prevIndent < indent)
            session.foldWidgets[row - 1] = "start";
        else
            session.foldWidgets[row - 1] = "";

        if (indent < nextIndent)
            return "start";
        else
            return "";
    };

}).call(FoldMode.prototype);

});

ace.define("ace/mode/shexc",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/shexc_highlight_rules","ace/mode/matching_brace_outdent","ace/worker/worker_client","ace/mode/behaviour/cstyle","ace/mode/folding/coffee"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var ShExCHighlightRules = require("./shexc_highlight_rules").ShExCHighlightRules;
var MatchingBraceOutdent = require("./matching_brace_outdent").MatchingBraceOutdent;
var WorkerClient = require("../worker/worker_client").WorkerClient;
var CstyleBehaviour = require("./behaviour/cstyle").CstyleBehaviour;
var CoffeeStyleFoldMode = require("./folding/coffee").FoldMode;

var Mode = function() {
    this.HighlightRules = ShExCHighlightRules;
    
    this.$outdent = new MatchingBraceOutdent();
    this.$behaviour = new CstyleBehaviour();
    this.foldingRules = new CoffeeStyleFoldMode();
};
oop.inherits(Mode, TextMode);

(function() {

    this.lineCommentStart = "#";
    this.blockComment = {start: "/*", end: "*/"};
    this.$quotes = {'"': '"', "'": "'", "`": "`"};

    this.getNextLineIndent = function(state, line, tab) {
        var indent = this.$getIndent(line);

        var tokenizedLine = this.getTokenizer().getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;

        if (tokens.length && tokens[tokens.length-1].type == "comment") {
            return indent;
        }

        if (state == "start" || state == "no_regex") {
            var match = line.match(/^.*(?:\bcase\b.*:|[\{\(\[])\s*$/);
            if (match) {
                indent += tab;
            }
        } else if (state == "doc-start") {
            if (endState == "start" || endState == "no_regex") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
        }

        return indent;
    };

    this.checkOutdent = function(state, line, input) {
        return this.$outdent.checkOutdent(line, input);
    };

    this.autoOutdent = function(state, doc, row) {
        this.$outdent.autoOutdent(doc, row);
    };

    this.createWorker = function(session) {
        var worker = new WorkerClient(["ace"], "ace/mode/shexc_worker", "ShExCWorker");
        worker.attachToDocument(session.getDocument());

        worker.on("annotate", function(results) {
            session.setAnnotations(results.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    };

    this.$id = "ace/mode/shexc";
}).call(Mode.prototype);

exports.Mode = Mode;
});                (function() {
                    ace.require(["ace/mode/shexc"], function(m) {
                        if (typeof module == "object" && typeof exports == "object" && module) {
                            module.exports = m;
                        }
                    });
                })();
            
