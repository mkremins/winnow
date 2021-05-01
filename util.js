// Make a copy of the object.
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Create a DOM element from an HTML string.
function createNode(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.firstChild;
}

// modified from https://github.com/substack/node-concat-map/blob/master/index.js
function mapcat(xs, fn) {
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    var x = fn(xs[i], i);
    if (Array.isArray(x)) res.push.apply(res, x);
    else res.push(x);
  }
  return res;
}

// Return a random item from a list.
function randNth(items) {
  return items[Math.floor(Math.random()*items.length)];
}

/// DataScript util functions

// Given the DB, return the EID of the most recently added entity.
function newestEID(db) {
  const allDatoms = datascript.datoms(db, ":eavt");
  return allDatoms[allDatoms.length - 1].e;
}
