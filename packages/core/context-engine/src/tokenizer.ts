import { encoding_for_model, Tiktoken, TiktokenModel } from 'tiktoken';

/**
 * Interface for token counting and encoding/decoding
 */
export interface Tokenizer {
  /**
   * Count tokens in text
   */
  count(text: string): number;

  /**
   * Encode text to tokens
   */
  encode(text: string): number[];

  /**
   * Decode tokens to text
   */
  decode(tokens: number[]): string;
}

/**
 * Tokenizer implementation using tiktoken library
 * Supports OpenAI models like gpt-4, gpt-3.5-turbo, etc.
 */
export class TiktokenTokenizer implements Tokenizer {
  private encoding: Tiktoken;

  constructor(model: string) {
    try {
      // tiktoken supports specific model names
      this.encoding = encoding_for_model(model as TiktokenModel);
    } catch (error) {
      throw new Error(
        `Failed to initialize tiktoken for model "${model}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  count(text: string): number {
    return this.encoding.encode(text).length;
  }

  encode(text: string): number[] {
    return Array.from(this.encoding.encode(text));
  }

  decode(tokens: number[]): string {
    const decoded = this.encoding.decode(new Uint32Array(tokens));
    return new TextDecoder().decode(decoded);
  }

  /**
   * Free the encoding resources
   * Should be called when done using the tokenizer
   */
  free(): void {
    this.encoding.free();
  }
}

/**
 * Fallback tokenizer that approximates tokens using character count
 * Uses the rule: 1 token ≈ 4 characters
 */
export class CharacterTokenizer implements Tokenizer {
  private readonly CHARS_PER_TOKEN = 4;

  count(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  encode(text: string): number[] {
    return Array.from(text).map((c) => c.charCodeAt(0));
  }

  decode(tokens: number[]): string {
    return String.fromCharCode(...tokens);
  }
}
