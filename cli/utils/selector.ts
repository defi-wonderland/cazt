import { FunctionSelector, EventSelector, NoteSelector } from '@aztec/stdlib/abi';
import { Helpers } from './helpers.js';

/**
 * Selector utility functions
 */
export class SelectorUtils {
  static async selectorFromSignature(sig: string): Promise<string> {
    return (await FunctionSelector.fromSignature(sig)).toString();
  }

  static async selectorFromNameParams(params: string): Promise<string> {
    const p = JSON.parse(params);
    return (await FunctionSelector.fromNameAndParameters(p.name, p.parameters)).toString();
  }

  static selectorFromField(field: string): string {
    const fr = Helpers.stringToFr(field);
    return FunctionSelector.fromField(fr).toString();
  }

  static selectorFromString(hex: string): string {
    return FunctionSelector.fromString(hex).toString();
  }

  static selectorEmpty(): string {
    return FunctionSelector.empty().toString();
  }

  static async eventSelector(sig: string): Promise<string> {
    return (await EventSelector.fromSignature(sig)).toString();
  }

  static async noteSelector(sig: string): Promise<string> {
    // NoteSelector doesn't have fromSignature, so we use FunctionSelector's approach
    // and convert to NoteSelector via fromField
    const funcSelector = await FunctionSelector.fromSignature(sig);
    const field = funcSelector.toField();
    return NoteSelector.fromField(field).toString();
  }
}

