const test1 = `
(pattern test1
  (event ?e1 where
    eventType: enterTown,
    actor: ?guest)
  (event ?e2 where
    eventType: showHospitality,
    actor: ?host,
    target: ?guest,
    ?host.value: communalism)
  (event ?e3 where
    tag: harm,
    actor: ?host,
    target: ?guest)
  (unless-event ?eMid between ?e1 ?e3 where
    eventType: leaveTown,
    actor: ?guest))
`;

const test2 = `
(pattern test2
  (event ?e1 where
    actor: ?firstChar,
    target: ?secondChar,
    (relationshipBetweenChars ?firstChar ?secondChar ?ship),
    ?ship.establishedTimestep: ?ts,
    (< ?ts 1000)))
`;

// x = compile(parse(test1))
