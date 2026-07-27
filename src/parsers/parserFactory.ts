import type { HappyDocsConfig } from "../core/types";
import type { BaseParser } from "./baseParser";
import { ExpressParser } from "./express/expressParser";
import { NestControllerParser } from "./nestjs/nestControllerParser";

export function createParsers(config: HappyDocsConfig): BaseParser[] {
  const parsers: BaseParser[] = [];
  if (config.frameworks.includes("express")) parsers.push(new ExpressParser());
  if (config.frameworks.includes("nestjs")) parsers.push(new NestControllerParser());
  return parsers;
}
