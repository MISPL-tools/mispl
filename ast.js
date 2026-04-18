// ast.js
//
// Centrale definitie van alle node-types die parser en analyzer gebruiken.
// Deze file MOET exact overeenkomen met de node-types die in parser.js
// worden aangemaakt en die analyzeMISPL.js verwacht.
//

const NodeTypes = {
    Program: "Program",

    // Declaraties zoals:
    //   String sA, sB;
    //   Integer I;
    //   Order Ordr;
    Declaration: "Declaration",

    // Assignment:
    //   name := expression;
    Assignment: "Assignment",

    // IF ... THEN ... [ELSE ...] ENDIF
    IfStatement: "IfStatement",

    // WHILE ... DO ... ENDWHILE
    WhileStatement: "WhileStatement",

    // REPEAT ... UNTIL ...
    RepeatStatement: "RepeatStatement",

    // Alles wat geen assignment/declaratie/if/while/repeat/return is
    // maar wel op ; eindigt:
    //   Message("Hallo");
    //   Ordr.AddRequest(S,DT,L);
    GenericStatement: "GenericStatement",

    // RETURN expr;
    ReturnStatement: "ReturnStatement"
};

module.exports = { NodeTypes };
