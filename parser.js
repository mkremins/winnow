function isWhitespace(ch) {
  return [" ", "\t", "\r", "\n", ",", ":"].includes(ch);
}

function isSymbolChar(ch) {
  return ch && !["\"", "(", ")", ";"].includes(ch) && !isWhitespace(ch);
}

function tokenize(input) {
  const tokens = [];
  let pos = 0;
  while (pos < input.length) {
    const ch = input[pos];
    if (ch === "(") {
      tokens.push({type: "startList"});
      pos += 1;
    }
    else if (ch === ")") {
      tokens.push({type: "endList"});
      pos += 1;
    }
    else if (ch === ";") { // skip line comment
      while (input[pos] && input[pos] !== "\n") {
        pos += 1;
      }
      pos += 1; // advance past the newline
    }
    else if (isWhitespace(ch)) { // skip whitespace
      while (isWhitespace(input[pos])) {
        pos += 1;
      }
    }
    else if (ch === "\"") { // tokenize string
      let escapeNext = false;
      let string = "";
      pos += 1;
      while (pos < input.length) {
        if (escapeNext) {
          string += input[pos];
          escapeNext = false;
        }
        else if (input[pos] === "\\") {
          escapeNext = true;
        }
        else if (input[pos] === "\"") {
          tokens.push({type: "string", text: string});
          pos += 1; // don't double-count this char as the start of a new quote
          break;
        }
        else {
          string += input[pos];
        }
        pos += 1;
      }
    }
    else { // tokenize symbol
      let symbol = "";
      while (isSymbolChar(input[pos])) {
        symbol += input[pos];
        pos += 1;
      }
      tokens.push({type: "symbol", text: symbol});
    }
  }
  return tokens;
}

function doParse(tokens) {
  const form = [];
  while (tokens.length > 0) {
    const token = tokens.shift();
    if (token.type === "startList") {
      form.push(doParse(tokens));
    }
    else if (token.type === "endList") {
      return form;
    }
    else {
      form.push(token);
    }
  }
  return form;
}

function parse(input) {
  const tokens = tokenize(input);
  return doParse(tokens);
}
