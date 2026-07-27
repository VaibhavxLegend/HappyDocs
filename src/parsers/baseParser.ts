import type { ParserContext, ParserResult, SupportedFramework } from "../core/types";

/** Framework adapters receive the full parsed project so they can resolve routers and DTOs across files. */
export interface BaseParser {
  readonly framework: Exclude<SupportedFramework, "unknown">;
  parse(context: ParserContext): ParserResult;
}
