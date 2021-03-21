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


function compileEventClauseRuleOrFnCall(compiler, form) {
  // check overall rule/fn call form
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
    compiler.allLvars.push(newLvar);
    unboundLvars.push(newLvar);
  }

  // assemble and return the final where clause
  const isFn = true; // TODO determine by checking head against list of rule/fn names
  const inner = form.map(emitSymbolOrString).join(" ");
  const where = isFn ? `[(${inner})]` : `(${inner})`;
  compiler.errCtx.pop();
  return {where: [where], unboundLvars};
}


function compileEventClauseAttrValuePair(compiler, lhs, rhs, eventLvar) {
  // parse an attribute/value pair
  // possible cases:
  //   1. lhs is event attr, rhs is value
  //   2. lhs is single-dotted lvar, rhs is value
  //   3. lhs is unbound undotted lvar, rhs is fncall (TODO handle this case)
  // for 1 and 2, value can be constant, unbound lvar, or bound lvar
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
    compiler.allLvars.push(rhs.text);
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
  compiler.errCtx.pop();
  return {where: [where], unboundLvars};
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
    `Event clause must be of the form \`(event ?eventName where ...)\``,
    compiler.errCtx
  );

  // parse out attr/val pairs + rule/fn calls to a series of where clauses,
  // keeping track of new unbound lvars we encounter along the way
  // (ie adding them to both clause.unboundLvars and allLvars)
  const body = form.slice(3);
  const where = [`[${eventLvar} "type" "event"]`];
  const unboundLvars = [eventLvar];
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
        // compile a negated clause
        assert(false, "Negation currently unsupported", compiler.errCtx);
      }
      else {
        // compile a rule or fn call
        const compiled = compileEventClauseRuleOrFnCall(compiler, part);
        compiled.where.forEach(nw => where.push(nw));
        compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
      }
    }
    else if (part.type === "symbol") {
      // compile an attr/value pair
      const lhs = part;
      const rhs = body.shift();
      const compiled = compileEventClauseAttrValuePair(compiler, lhs, rhs, eventLvar);
      compiled.where.forEach(nw => where.push(nw));
      compiled.unboundLvars.forEach(lvar => unboundLvars.push(lvar));
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

  // consolidate everything we know about this clause and return
  compiler.errCtx.pop();
  clause.eventLvar = eventLvar;
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

  // compile individual clauses
  const compiler = {allLvars: [], errCtx: errCtx};
  const clauses = form.slice(2).map(subform => analyzeTopLevelClause(compiler, subform));
  const eventClauses = clauses.filter(c => c.type === "event");
  assert(
    eventClauses.length >= 2,
    "Pattern must contain at least two positive `event` clauses",
    errCtx
  );
  const constraintClauses = clauses.filter(c => c.type === "unless-event");
  eventClauses.forEach(ec => compileEventClause(compiler, ec));
  // TODO check that no two event clauses have the same eventLvar
  //constraintClauses.forEach(compileConstraintClause);

  // return fully compiled acceptor prototype
  return {
    name: patternName,
    unboundLvars: compiler.allLvars,
    eventClauses: eventClauses,
    globalConstraints: constraintClauses
  };
}


function compile(forms) {
  return forms.map(compilePattern);
}
