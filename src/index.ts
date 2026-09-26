export interface GreetOptions {
  /** 放在名字前面的问候语。 @default "Hello" */
  greeting?: string;
  /** 跟在名字后面的标点。 @default "!" */
  punctuation?: string;
}

/**
 * 拼一句问候语。
 *
 * @example
 * greet('world')                       // "Hello, world!"
 * greet('world', { greeting: '你好' })  // "你好, world!"
 */
export function greet(name: string, options: GreetOptions = {}): string {
  const { greeting = 'Hello', punctuation = '!' } = options;
  return `${greeting}, ${name}${punctuation}`;
}
