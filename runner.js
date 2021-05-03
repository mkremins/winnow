// Given a `partialMatch`, return whether it has a binding for the `lvar`.
function hasBinding(partialMatch, lvar) {
  return partialMatch.bindings.hasOwnProperty(lvar);
}

// Given a `partialMatch` and a compiled unless-event `constraint`,
// return whether this constraint is currently applicable.
function applicableConstraint(partialMatch, constraint) {
  if (!hasBinding(partialMatch, constraint.betweenStart)) return false;
  if (hasBinding(partialMatch, constraint.betweenEnd)) return false;
  return true; // assumes all lvars needed to check this constraint are bound. is this guaranteed?
}

// Given a map of preexisting `bindings`, a list of new `lvars` to bind,
// and a list of `values` to bind them to, return a clone of the `bindings`
// updated to include the new bindings as well.
function pushNewBindings(bindings, lvars, values) {
  const newBindings = clone(bindings);
  for (let i = 0; i < lvars.length; i++) {
    newBindings[lvars[i]] = values[i];
  }
  return newBindings;
}

// Given a `partialMatch`, a `db`, a string of query `rules`,
// and a `latestEventID` identifying a specific event entity in the `db`,
// return a list of updated partial matches reflecting the results of
// trying to push this event onto this `partialMatch`.
function tryAdvance(partialMatch, db, rules, latestEventID) {
  // bail out early if partialMatch is either dead or complete
  if (partialMatch.lastStep === "die") return [partialMatch];
  if (partialMatch.lastStep === "complete") return [partialMatch];

  // unpack the partialMatch state a bit
  const {pattern, bindings} = partialMatch;
  const boundLvars = Object.keys(bindings);
  const boundValues = Object.values(bindings);

  // check whether this event matches an active unless-event constraint,
  // and kill the partial match if it does
  for (const constraint of pattern.globalConstraints) {
    if (!applicableConstraint(partialMatch, constraint)) continue;
    const results = datascript.q(
      `[:find ${constraint.unboundLvars}
        :in $ % ${constraint.eventLvar} ${boundLvars}
        :where ${constraint.where.join("\n")}]`,
      db, rules, latestEventID, ...boundValues
    );
    if (results.length > 0) {
      partialMatch.lastStep = "die";
      partialMatch.deathDetails = {eventID: latestEventID, constraint};
      return [partialMatch];
    }
  }

  // create and return a new, advanced partial match for each way
  // that this event can possibly advance the match
  const eventClauseIdx = pattern.eventClauses.findIndex(
    ec => !hasBinding(partialMatch, ec.eventLvar)
  );
  const onLastClause = eventClauseIdx === pattern.eventClauses.length - 1;
  const eventClause = pattern.eventClauses[eventClauseIdx];
  const results = datascript.q(
    `[:find ${eventClause.unboundLvars}
      :in $ % ${eventClause.eventLvar} ${boundLvars}
      :where ${eventClause.where.join("\n")}]`,
    db, rules, latestEventID, ...boundValues
  );
  const newPartialMatches = results.map(result => {
    return {
      pattern: pattern,
      bindings: pushNewBindings(bindings, eventClause.unboundLvars, result),
      lastStep: onLastClause ? "complete" : "accept",
      parent: partialMatch
    };
  });
  // could implement a greedy match behavior here by not returning the original partialMatch
  partialMatch.lastStep = "pass";
  return [partialMatch].concat(newPartialMatches);
}
