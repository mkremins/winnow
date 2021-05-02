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

const compilerTestsNode = document.getElementById("compilerTests");
const testResults = [];
for (const rawPattern of allTests) {
  const parsed = parse(rawPattern);
  const compiled = compile(parsed);
  const compiledPattern = compiled[0];
  testResults.push({parsed, compiled});
  console.log(compiledPattern);

  // parse out just the where-clauses part of the compiled DataScript query
  const withoutFrontMatter = compiledPattern.completeQuery.split(":where")[1];
  const withoutClosingBracket = withoutFrontMatter.replace(/\]$/, "");
  const feltCode = withoutClosingBracket.trim();

  // add this test to the DOM
  const testNode = createNode(`<section class="compilerTest" id="${compiledPattern.name}">
    <h3>${compiledPattern.name}</h3>
    <pre class="winnow">${rawPattern}</pre>
    <pre class="felt">${feltCode}</pre>
    <!--<pre class="acceptor">${JSON.stringify(compiled, null, 2)}</pre>-->
  </div>`);
  compilerTestsNode.appendChild(testNode);
}

/// test execution

const schema = {
  // character traits
  curse:  {":db/cardinality": ":db.cardinality/many"},
  value:  {":db/cardinality": ":db.cardinality/many"},
  // other stuff
  actor:  {":db/valueType": ":db.type/ref"},
  cause:  {":db/valueType": ":db.type/ref"},
  source: {":db/valueType": ":db.type/ref"},
  target: {":db/valueType": ":db.type/ref"},
  projectContributor: {":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/many"},
  tag:    {":db/cardinality": ":db.cardinality/many"},
};

const allEventSpecs = [
  {eventType: 'getCoffeeWith', tags: ['friendly']},
  {eventType: 'physicallyAttack', tags: ['unfriendly', 'harms', 'major']},
  {eventType: 'disparagePublicly', tags: ['unfriendly', 'harms']},
  {eventType: 'sendPostcard', tags: ['friendly']},
  {eventType: 'insult', tags: ['unfriendly']},
  {eventType: 'insultDismissively', tags: ['unfriendly', 'highStatus']},
  {eventType: 'rejectSuperiority', tags: ['unfriendly', 'lowStatus']},
  {eventType: 'flirtWith_accepted', tags: ['romantic', 'positive']},
  {eventType: 'flirtWith_rejected', tags: ['romantic', 'negative', 'awkward']},
  {eventType: 'askOut_accepted', tags: ['romantic', 'positive', 'major']},
  {eventType: 'askOut_rejected', tags: ['romantic', 'negative', 'awkward', 'major']},
  {eventType: 'propose_accepted', tags: ['romantic', 'positive', 'major']},
  {eventType: 'propose_rejected', tags: ['romantic', 'negative', 'awkward', 'major']},
  {eventType: 'breakUp', tags: ['romantic', 'negative', 'major']},
  {eventType: 'buyLunchFor', tags: ['friendly']},
  {eventType: 'inviteIntoGroup', tags: ['highStatus', 'friendly', 'helps']},
  {eventType: 'shunFromGroup', tags: ['highStatus', 'unfriendly', 'harms']},
  {eventType: 'apologizeTo', tags: ['friendly']},
  {eventType: 'begForFavor', tags: ['lowStatus']},
  {eventType: 'extortFavor', tags: ['highStatus']},
  {eventType: 'callInFavor', tags: ['highStatus']},
  {eventType: 'callInExtortionateFavor', tags: ['highStatus', 'harms']},
  //{eventType: 'playTheFool', tags: ['lowStatus', 'friendly']},
  //{eventType: 'playRoyalty', tags: ['highStatus', 'friendly']},
  //{eventType: 'neg', tags: ['highStatus', 'romantic', 'negative']},
  {eventType: 'askForHelp', tags: ['lowStatus', 'friendly']},
  {eventType: 'deferToExpertise', tags: ['career', 'lowStatus']},
  //{eventType: 'noticeMeSenpai', tags: ['lowStatus', 'romantic']},
  {eventType: 'deliberatelySabotage', tags: ['career', 'unfriendly', 'harms', 'major']},
  {eventType: 'collab:phoneItIn', tags: ['career', 'harms']},
  {eventType: 'collab:goAboveAndBeyond', tags: ['career', 'helps']},
];

// Add an event to the DB and return an updated DB.
function addEvent(db, event) {
  const transaction = [[":db/add", -1, "type", "event"]];
  for (const attr of Object.keys(event)) {
    if (attr === "tags") continue;
    transaction.push([":db/add", -1, attr, event[attr]]);
  }
  for (const tag of event.tags || []) {
    transaction.push([":db/add", -1, "tag", tag]);
  }
  return datascript.db_with(db, transaction);
}

const testCharNames = ["Mira", "Emin", "Sarah", "Vincent", "Zach"];

function createDB() {
  let db = datascript.empty_db(schema);
  const charsToCreate = 5;

  // generate and add characters
  const allCharacterIDs = [];
  for (let i = 0; i < charsToCreate; i++) {
    const transaction = [
      [":db/add", -1, "type", "char"],
      [":db/add", -1, "charName", testCharNames[i]],
      [":db/add", -1, "value", "communalism"], // everyone values communalism for testing lol
    ];
    db = datascript.db_with(db, transaction);
    allCharacterIDs.push(i+1);
  }

  /*
  // generate and add a bunch of random events
  for (let i = 0; i < 200; i++) {
    const event = clone(randNth(allEventSpecs));
    event.actor = randNth(allCharacterIDs);
    event.target = randNth(allCharacterIDs.filter(id => id !== event.actor));
    db = addEvent(db, event);
  }
  */

  return db;
}

// Given a list of compiled `patterns`, a `db`, a string of query `rules`,
// and a list of `events` to push into the `db`, executes the patterns against
// the `db` in an incremental fashion while pushing the `events` into the `db`
// one by one.
//
// This is one example "driver" function for the core Winnow
// incremental execution model, but others can also be conceived of
// for different use cases. Depending on the application, a driver function
// might want to more aggressively remove complete matches from the pool,
// add events using a different `addEvent` function, interleave execution with
// more complicated game state updates, and so on.
function getAllMatches(patterns, db, rules, events) {
  let partialMatches = patterns.map(pat => {return {pattern: pat, bindings: {}}});
  for (const event of events) {
    db = addEvent(db, event);
    const latestEventID = newestEID(db);
    partialMatches = mapcat(partialMatches, pm => tryAdvance(pm, db, rules, latestEventID));
    partialMatches = partialMatches.filter(pm => pm.lastStep !== "die");
  }
  return partialMatches;
}

function testGetAllMatches() {
  const db = createDB();
  const rules = "[]";
  const events = [
    {eventType: "enterTown", actor: 1},
    {eventType: "showHospitality", actor: 2, target: 1},
    {eventType: "stealFrom", tags: ["harm"], actor: 2, target: 1},
    {eventType: "attack", tags: ["harm"], actor: 2, target: 1}
  ];
  const compiledPatterns = testResults.map(tr => tr.compiled[0]);
  const partialMatches = getAllMatches(compiledPatterns, db, rules, events);
  console.log(partialMatches);
}

testGetAllMatches();

/// incremental match visualization

function renderPartialMatches(test) {
  const partialMatchesDiv = test.node.querySelector(".partialMatches");
  partialMatchesDiv.innerHTML = "";
  for (const partialMatch of test.partialMatches) {
    const innerRows = [];
    for (const clause of partialMatch.pattern.eventClauses) {
      const hasMatched = clause.unboundLvars.every(lvar => hasBinding(partialMatch, lvar));
      const bindings = clause.unboundLvars.map(
        lvar => `${lvar}:${partialMatch.bindings[lvar]}`
      );
      innerRows.push(`<div class="row">${hasMatched ? bindings : "..."}</div>`);
    }
    const partialMatchDiv = createNode(`<div class="partialMatch ${partialMatch.lastStep}">
      <div class="row header">${partialMatch.pattern.name}</div>
      ${innerRows.join("")}
    </div>`);
    partialMatchesDiv.appendChild(partialMatchDiv);
  }
}

function pushEventToTable(table, event) {
  const tbody = table.getElementsByTagName('tbody')[0];
  const tr = tbody.insertRow();
  for (const key of Object.keys(event)) {
    const td = tr.insertCell();
    //td.innerText = `${key}:${event[key]}`;
    td.innerText = event[key];
  }
}

function stepSiftingTest(test) {
  const rules = "[]";
  console.log("step", test.name, test.eventIdx);
  const event = test.events[test.eventIdx];
  if (!event) return;

  // advance .selected style along the event table
  const prevRow = test.node.querySelectorAll(".eventTable tbody tr")[test.eventIdx - 1];
  const nextRow = test.node.querySelectorAll(".eventTable tbody tr")[test.eventIdx];
  if (prevRow) prevRow.classList.remove("selected");
  nextRow.classList.add("selected");

  // add event to DB, advance partial matches, render partial matches
  test.db = addEvent(test.db, event);
  const latestEventID = newestEID(test.db);
  test.partialMatches = mapcat(test.partialMatches,
    pm => tryAdvance(pm, test.db, rules, latestEventID)
  );
  renderPartialMatches(test);
  test.eventIdx++;
}

const siftingTests = [];

siftingTests.push({
  name: "violationOfHospitality_2x",
  events: [
    {eventType: "enterTown", actor: 1},
    {eventType: "showHospitality", actor: 2, target: 1},
    {eventType: "stealFrom", tags: ["harm"], actor: 2, target: 1},
    {eventType: "attack", tags: ["harm"], actor: 2, target: 1}
  ]
});

const siftingTestsNode = document.getElementById("siftingTests");
for (const test of siftingTests) {
  // set up test render target
  test.node = createNode(`<section class="siftingTest" id="#${test.name}">
    <h3>${test.name} <button class="step">Step</button></h3>
    <table class="eventTable">
      <thead><tr><th>Events</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="partialMatches"></div>
  </section>`);
  test.node.querySelector(".step").onclick = () => stepSiftingTest(test);
  siftingTestsNode.appendChild(test.node);

  // render events into event table
  const eventTable = test.node.querySelector(".eventTable");
  for (const event of test.events) {
    pushEventToTable(eventTable, event);
  }

  // set up test state
  const compiledPatterns = testResults.map(tr => tr.compiled[0]);
  test.partialMatches = compiledPatterns.map(pat => {return {pattern: pat, bindings: {}}});
  test.db = createDB();
  test.eventIdx = 0;

  // render initial partial matches
  renderPartialMatches(test);
}
