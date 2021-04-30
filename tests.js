// adapted from INT 2020 paper
const violationOfHospitality = `
(pattern violationOfHospitality
  (event ?e1 where
    eventType: enterTown,
    actor: ?guest)
  (event ?e2 where
    eventType: showHospitality,
    actor: ?host,
    target: ?guest,
    ?host.value: communalism) ; not strictly needed?
  (event ?e3 where
    tag: harm,
    actor: ?host,
    target: ?guest)
  ;; make sure the guest hasn't left town
  (unless-event ?eMid between ?e1 ?e3 where
    eventType: leaveTown,
    actor: ?guest))
`;

// adapted from ICIDS 2019 paper
const twoImpulsiveBetrayals = `
(pattern twoImpulsiveBetrayals
  (event ?e1 where
    eventType: betray,
    actor: ?char,
    ?char.trait: impulsive)
  (event ?e2 where
    eventType: betray,
    actor: ?char)
  (unless-event where actor: ?char))
`;

// adapted from INT 2020 paper
const romanticFailureThenSuccess = `
(pattern romanticFailureThenSuccess
  (event ?e1 where
    tag: negative, tag: romantic, (not tag: major),
    actor: ?char)
  (event ?e2 where
    tag: negative, tag: romantic, actor: ?char)
  (event ?e3 where
    tag: positive, tag: romantic, actor: ?char))
`;

// adapted from INT 2020 paper
const criticismOfHypocrisy = `
(pattern criticismOfHypocrisy
  (event ?e1 where
    actor: ?hypocrite,
    (eventHarmsHeldValue ?e1 ?hypocrite))
  (event ?e2 where
    eventType: criticize,
    actor: ?critic,
    target: ?hypocrite,
    (opposedValues ?hypocrite ?critic)))
`;

const allTests = [
  violationOfHospitality,
  twoImpulsiveBetrayals,
  romanticFailureThenSuccess,
  criticismOfHypocrisy,
];

const mainEl = document.querySelector("main");
const testResults = [];
for (const rawPattern of allTests) {
  const parsed = parse(rawPattern);
  const compiled = compile(parsed);
  const compiledPattern = compiled[0];
  testResults.push({parsed, compiled});
  console.log(compiled[0]);

  // parse out just the where-clauses part of the compiled DataScript query
  const withoutFrontMatter = compiledPattern.completeQuery.split(":where")[1];
  const withoutClosingBracket = withoutFrontMatter.replace(/\]$/, "");
  const feltCode = withoutClosingBracket.trim();

  // add this test to the DOM
  mainEl.appendChild(createNode(`<section class="example" id="${compiledPattern.name}">
    <h2>${compiledPattern.name}</h2>
    <pre class="rawPattern">${rawPattern}</pre>
    <pre class="felt">${feltCode}</pre>
    <!--<pre class="acceptor">${JSON.stringify(compiled, null, 2)}</pre>-->
  </div>`));
}
