type MessageDictionary = {
  [key: string]: string | MessageDictionary;
};

class MessageFileParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly filePath: string,
  ) {}

  parse(): MessageDictionary {
    this.index = this.findMessagesObjectStart();
    return this.readObject();
  }

  private findMessagesObjectStart(): number {
    const match = /\bexport\s+default\s+defineMessages\s*\(/u.exec(this.source);
    if (!match) this.fail("expected default export defineMessages({...})");

    const objectStart = this.source.indexOf("{", match.index + match[0].length);
    if (objectStart === -1) this.fail("expected messages object literal");
    return objectStart;
  }

  private readObject(): MessageDictionary {
    const messages: MessageDictionary = {};
    this.expect("{");
    this.skipTrivia();

    while (!this.consume("}")) {
      const key = this.readKey();
      this.skipTrivia();
      this.expect(":");
      messages[key] = this.readValue();
      this.skipTrivia();
      if (this.consume(",")) {
        this.skipTrivia();
        continue;
      }
      if (this.peek() !== "}") this.fail("expected comma or closing brace");
    }

    return messages;
  }

  private readValue(): string | MessageDictionary {
    this.skipTrivia();
    const char = this.peek();
    if (char === "\"" || char === "'") return this.readQuotedString();
    if (char === "`") return this.readTemplateString();
    if (char === "{") return this.readObject();
    this.fail("expected string or nested messages object");
  }

  private readKey(): string {
    this.skipTrivia();
    const char = this.peek();
    if (char === "\"" || char === "'") return this.readQuotedString();
    const match = /^[$A-Za-z_][$A-Za-z0-9_]*/u.exec(this.source.slice(this.index));
    if (match) {
      this.index += match[0].length;
      return match[0];
    }
    const numeric = /^[0-9]+/u.exec(this.source.slice(this.index));
    if (numeric) {
      this.index += numeric[0].length;
      return numeric[0];
    }
    this.fail("expected property key");
  }

  private readQuotedString(): string {
    const quote = this.source[this.index];
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === quote) return value;
      if (char === "\\") {
        value += char;
        if (this.index < this.source.length) value += this.source[this.index++];
        continue;
      }
      value += char;
    }
    this.fail("unterminated string literal");
  }

  private readTemplateString(): string {
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === "`") return value;
      if (char === "$" && this.peek() === "{") this.fail("template expressions are not supported");
      if (char === "\\") {
        value += char;
        if (this.index < this.source.length) value += this.source[this.index++];
        continue;
      }
      value += char;
    }
    this.fail("unterminated template literal");
  }

  private skipTrivia(): void {
    while (this.index < this.source.length) {
      if (/\s/u.test(this.peek())) {
        this.index += 1;
        continue;
      }
      if (this.consume("//")) {
        while (this.index < this.source.length && this.peek() !== "\n") this.index += 1;
        continue;
      }
      if (this.consume("/*")) {
        const end = this.source.indexOf("*/", this.index);
        if (end === -1) this.fail("unterminated block comment");
        this.index = end + 2;
        continue;
      }
      return;
    }
  }

  private expect(value: string): void {
    this.skipTrivia();
    if (!this.consume(value)) this.fail(`expected ${value}`);
  }

  private consume(value: string): boolean {
    if (!this.source.startsWith(value, this.index)) return false;
    this.index += value.length;
    return true;
  }

  private peek(): string {
    return this.source[this.index] || "";
  }

  private fail(message: string): never {
    throw new Error(`${message} :: ${this.filePath}`);
  }
}

function parseMessagesSource(source: string, filePath: string): MessageDictionary {
  return new MessageFileParser(source, filePath).parse();
}

function flattenMessageKeys(messages: MessageDictionary): string[] {
  const keys = new Set<string>();
  collectMessageKeys(messages, "", keys);
  return Array.from(keys).sort();
}

function collectMessageKeys(messages: MessageDictionary, prefix: string, keys: Set<string>): void {
  for (const [key, value] of Object.entries(messages)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.add(nextKey);
      continue;
    }
    collectMessageKeys(value, nextKey, keys);
  }
}

export {
  flattenMessageKeys,
  parseMessagesSource,
};
export type {
  MessageDictionary,
};
