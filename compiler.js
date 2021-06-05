function assert(val, msg, errCtx) {
  if (!val) throw Error(errCtx.concat([msg]).join("\n"));
}

function isLvar(token) {
  return token && token.type === "symbol" && token.text.startsWith("?");
}

function isSymbolOrString(token) {
  return token && (token.type === "symbol" || token.type === "string");
}

function emitSymbolOrString(token) {
  return token.type === "symbol" && token.text.startsWith("?") ? token.text : `"${token.text}"`;
}

function isBuiltinFn(name) {
  // copied from datascript.query/builtins:
  // https://github.com/tonsky/datascript/blob/master/src/datascript/query.cljc#L194
  const builtins = [
    "=", "==", "not=", "!=", "<", ">", "<=", ">=", "+", "-",
    "*", "/", "quot", "rem", "mod", "inc", "dec", "max", "min",
    "zero?", "pos?", "neg?", "even?", "odd?", "compare",
    "rand", "rand-int",
    "true?", "false?", "nil?", "some?", "not", "and", "or",
    "complement", "identical?",
    "identity", "keyword", "meta", "name", "namespace", "type",
    "vector", "list", "set", "hash-map", "array-map",
    "count", "range", "not-empty", "empty?", "contains?",
    "str", "pr-str", "print-str", "println-str", "prn-str", "subs",
    "re-find", "re-matches", "re-seq", "re-pattern",
    "-differ?", "get-else", "get-some", "missing?", "ground",
    "clojure.string/blank?", "clojure.string/includes?",
    "clojure.string/starts-with?", "clojure.string/ends-with?",
    "tuple", "untuple"
  ];
  return builtins.includes(name);
}

function freshLvar() {
  const digits = [];
  for (let i = 0; i < 6; i++) {
    digits.push(randNth([0,1,2,3,4,5,6,7,8,9]));
  }
  return "?e" + digits.join("");
}


function collectLvars(form) {
  if (Array.isArray(form)) {
    return mapcat(form, collectLvars);
  }
  else if (form.type === "symbol" && form.text.startsWith("?")) {
    return [form.text];
  }
  else {
    return [];
  }
}


function analyzeTopLevelClause(compiler, form) {
  assert(
    Array.isArray(form)
      && form.length >= 2
      && form[0].type === "symbol"
      && (form[0].text === "event" || form[0].text === "unless-event"),
    "Pattern clause must be of the form `(event ?eName where ...)` or `(unless-event ...)`",
    compiler.errCtx
  );
  return {type: form[0].text, form};
}


function analyzeEventOrUnlessEventClauseBody(compiler, body) {
  const asts = [];
  while (body.length > 0) {
    const part = body.shift();
    if (Array.isArray(part)) {
      // figure out what kind of parenthesized clause we're compiling
      const head = part[0];
      assert(
        head && head.type === "symbol",
        "Parenthesized clauses must begin with a rule name, function name, or `not`",
        compiler.errCtx
      );
      if (head.text === "not") {
        // analyze a negated clause
        if (part.length === 3) {
          asts.push({type: "attrValPair", isNegated: true, lhs: part[1], rhs: part[2]});
        }
        else if (part.length === 2) {
          const form = part[1];
          const head = form[1];
          asts.push({type: "ruleOrFnCall", isNegated: true, form, head, rest: form.slice(1)});
        }
        else {
          assert(
            false,
            "Negated body clause must be either `(not attr val)` or `(not (ruleOrFn ...))`",
            compiler.errCtx
          );
        }
      }
      else {
        // analyze a rule or fn call
        const form = part;
        asts.push({type: "ruleOrFnCall", form, head, rest: form.slice(1)});
      }
    }
    else if (part.type === "symbol") {
      // analyze an attr/value pair
      const lhs = part;
      const rhs = body.shift();
      asts.push({type: "attrValPair", lhs: lhs, rhs: rhs});
    }
    else {
      // loose string or other form in the body somehow? error out
      assert(
        false,
        "Event clause body may contain only attr/val pairs and rule/fn calls",
        compiler.errCtx
      );
    }
  }
  return asts;
}


function compileRuleOrFnCall(compiler, ast) {
  // check overall rule/fn call form
  const form = ast.form;
  compiler.errCtx.push(`In rule or fn call '${form[0].text}':`);
  assert(
    form.every(isSymbolOrString),
    "Every element of a rule or fn call must be a symbol or string",
    compiler.errCtx
  );

  // collect new unbound lvars
  // TODO handle dotted lvars appropriately
  const lvars = collectLvars(form);
  const unboundLvars = [];
  const newLvars = lvars.filter(lvar => !compiler.allLvars.includes(lvar));
  for (let newLvar of newLvars) {
    if (!ast.isNegated && !compiler.inUnlessEventContext) {
      compiler.allLvars.push(newLvar);
    }
    unboundLvars.push(newLvar);
  }

  // assemble and return the final where clause
  const ruleOrFn = form[0].text;
  ast.isFn = isBuiltinFn(ruleOrFn);
  const args = form.slice(1).map(emitSymbolOrString).join(" ");
  const where = ast.isFn ? `[(${ruleOrFn} ${args})]` : `(${ruleOrFn} ${args})`;
  const outer = ast.isNegated ? `(not ${where})` : where;
  compiler.errCtx.pop();
  ast.where = [outer];
  ast.unboundLvars = unboundLvars;
  return ast;
}


function compileAttrValuePair(compiler, ast, eventLvar) {
  // parse an attribute/value pair
  // possible cases:
  //   1. lhs is event attr, rhs is value
  //   2. lhs is single-dotted lvar, rhs is value
  //   3. lhs is unbound undotted lvar, rhs is fncall (TODO handle this case)
  // for 1 and 2, value can be constant, unbound lvar, or bound lvar
  const {lhs, rhs} = ast;
  compiler.errCtx.push(`In attr/val pair '${lhs.text}':`);
  assert(
    isSymbolOrString(rhs),
    "Val part must be symbol or string",
    compiler.errCtx
  );  

  // check whether lhs and rhs are lvars
  const lhsIsLvar = isLvar(lhs);
  const rhsIsLvar = isLvar(rhs);

  // collect new unbound lvars
  // for now, assume only the explicit lvar on the rhs (if any) needs to be tracked
  // (might need to add new implicit dotted lvars later)
  const unboundLvars = [];
  if (rhsIsLvar && !compiler.allLvars.includes(rhs.text)) {
    if (!ast.isNegated && !compiler.inUnlessEventContext) {
      compiler.allLvars.push(rhs.text);
    }
    unboundLvars.push(rhs.text);
  }

  // handle a single-dotted lvar on the lhs
  const lhsParts = lhs.text.split(".");
  assert(
    !lhsIsLvar || lhsParts.length === 2,
    "Lvar must be single-dotted (e.g. `?lvar.attr`)",
    compiler.errCtx
  );

  // assemble and return the final where clause
  const outLvar = lhsIsLvar ? lhsParts[0] : eventLvar;
  const outAttr = lhsIsLvar ? lhsParts[1] : lhs.text;
  const where = `[${outLvar} "${outAttr}" ${emitSymbolOrString(rhs)}]`;
  const outer = ast.isNegated ? `(not ${where})` : where;
  compiler.errCtx.pop();
  ast.where = [outer];
  ast.unboundLvars = unboundLvars;
  return ast;
}


function compileEventClause(compiler, clause) {
  // check overall event clause form
  const form = clause.form;
  assert(
    form[1].type === "symbol" && form[1].text.startsWith("?"),
    "Event clause must be of the form `(event ?eventName where ...)`",
    compiler.errCtx
  );
  const eventLvar = form[1].text;
  compiler.errCtx.push(`In event clause '${eventLvar}':`);
  compiler.allLvars.push(eventLvar);
  assert(
    form[2].type === "symbol" && form[2].text === "where",
    "Event clause must be of the form `(event ?eventName where ...)`",
    compiler.errCtx
  );

  // parse out attr/val pairs + rule/fn calls to a series of where clauses,
  // keeping track of new unbound lvars we encounter along the way
  // (ie adding them to both clause.unboundLvars and allLvars)
  const body = form.slice(3);
  const bodyAsts = analyzeEventOrUnlessEventClauseBody(compiler, body);
  const where = [`[${eventLvar} "type" "event"]`];
  const unboundLvars = [eventLvar];
  for (const ast of bodyAsts) {
    if (ast.type === "attrValPair") {
      // compile an attr/value pair
      const compiled = compileAttrValuePair(compiler, ast, eventLvar);
      compiled.where.forEach(nw => where.push(nw));
      compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
    }
    else if (ast.type === "ruleOrFnCall") {
      // compile a rule or fn call
      const compiled = compileRuleOrFnCall(compiler, ast);
      compiled.where.forEach(nw => where.push(nw));
      compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
    }
    else {
      assert(false, "Invalid AST node type: " + ast.type, compiler.errCtx);
    }
  }

  // consolidate everything we know about this clause and return
  compiler.errCtx.pop();
  clause.eventLvar = eventLvar;
  clause.unboundLvars = unboundLvars;
  clause.where = where;
  return clause;
}


function compileUnlessEventClause(compiler, clause) {
  compiler.errCtx.push(`In unless-event clause:`);
  const form = clause.form;
  const rest = form.slice(1);

  // parse optional event name
  if (isLvar(rest[0])) {
    const eventLvar = rest.shift().text;
    // TODO assert eventLvar isn't duplicating another lvar
    clause.eventLvar = eventLvar;
  }
  if (!clause.eventLvar) {
    clause.eventLvar = freshLvar();
  }

  // set default `between` bounds
  clause.betweenStart = compiler.firstEventLvar;
  clause.betweenEnd = compiler.lastEventLvar;

  // parse optional `between ?first ?second` bounds
  if (rest[0] && rest[0].text === "between") {
    rest.shift();
    const betweenStartToken = rest.shift();
    const betweenEndToken = rest.shift();
    assert(
      isLvar(betweenStartToken) && isLvar(betweenEndToken),
      "Between clause must consist of two event names bound by event clauses",
      compiler.errCtx
    );
    clause.betweenStart = betweenStartToken.text;
    clause.betweenEnd = betweenEndToken.text;
  }

  // assert next is `where`
  const whereSym = rest.shift();
  assert(
    whereSym && whereSym.text === "where",
    "Unless-event clause must be of the form `(unless-event metadata? where ...)`",
    compiler.errCtx
  );

  // parse body
  compiler.inUnlessEventContext = true;
  const bodyAsts = analyzeEventOrUnlessEventClauseBody(compiler, rest);
  clause.body = bodyAsts;
  const where = [`[${clause.eventLvar} "type" "event"]`];
  const unboundLvars = [clause.eventLvar];
  for (const ast of bodyAsts) {
    if (ast.type === "attrValPair") {
      // compile an attr/value pair
      const compiled = compileAttrValuePair(compiler, ast, clause.eventLvar);
      compiled.where.forEach(nw => where.push(nw));
      compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
    }
    else if (ast.type === "ruleOrFnCall") {
      // compile a rule or fn call
      const compiled = compileRuleOrFnCall(compiler, ast);
      compiled.where.forEach(nw => where.push(nw));
      compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
    }
    else {
      assert(false, "Invalid AST node type: " + ast.type, compiler.errCtx);
    }
  }

  // build a single not-join clause representing this unless-event clause
  const orderConstraint = `[(< ${clause.betweenStart} ${clause.eventLvar} ${clause.betweenEnd})]`;
  const indentedWheres = where.concat([orderConstraint]).map(w => "  " + w).join("\n");
  const lvarsToJoin = compiler.allLvars.join(" ");
  clause.completeNotJoin = `(not-join [${lvarsToJoin}]\n${indentedWheres})`;

  // consolidate everything we know about this clause and return
  compiler.errCtx.pop();
  delete compiler.inUnlessEventContext;
  clause.unboundLvars = unboundLvars;
  clause.where = where;
  return clause;
}


function compilePattern(form) {
  // check overall pattern form
  const errCtx = [];
  assert(
    form.length >= 3
      && (form[0].type === "symbol" && form[0].text === "pattern")
      && isSymbolOrString(form[1]),
    "Patterns must have the form `(pattern patternName ...)`",
    errCtx
  );
  const patternName = form[1].text;
  errCtx.push(`In pattern '${patternName}':`);

  // classify top-level pattern clauses
  const compiler = {allLvars: [], errCtx: errCtx};
  const clauses = form.slice(2).map(subform => analyzeTopLevelClause(compiler, subform));
  const eventClauses = clauses.filter(c => c.type === "event");
  assert(
    eventClauses.length >= 1,
    "Pattern must contain at least one positive event clause",
    errCtx
  );
  const unlessEventClauses = clauses.filter(c => c.type === "unless-event");

  // compile event clauses
  eventClauses.forEach(ec => compileEventClause(compiler, ec));
  const eventLvars = eventClauses.map(ec => ec.eventLvar);
  assert(
    eventLvars.length === (new Set(eventLvars)).size,
    "Within a pattern, no two event clauses may use the same event name",
    errCtx
  );

  // compile unless-event clauses
  compiler.eventLvars = eventLvars;
  compiler.firstEventLvar = eventLvars[0];
  compiler.lastEventLvar = eventLvars[eventLvars.length - 1];
  unlessEventClauses.forEach(uec => compileUnlessEventClause(compiler, uec));

  // build a single DataScript query representing this complete sifting pattern
  const completeQuery = `[:find ${compiler.allLvars.join(" ")}
 :in $ %
 :where
${mapcat(eventClauses, ec => ec.where.join("\n")).join("\n")}
[(< ${eventClauses.map(ec => ec.eventLvar).join(" ")})]
${mapcat(unlessEventClauses, uec => uec.completeNotJoin).join("\n")}]`;

  // return fully compiled acceptor prototype
  return {
    name: patternName,
    unboundLvars: compiler.allLvars,
    eventClauses: eventClauses,
    globalConstraints: unlessEventClauses,
    completeQuery: completeQuery
  };
}


function compile(forms) {
  return forms.map(compilePattern);
}
