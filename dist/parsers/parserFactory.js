"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParsers = createParsers;
const expressParser_1 = require("./express/expressParser");
const nestControllerParser_1 = require("./nestjs/nestControllerParser");
function createParsers(config) {
    const parsers = [];
    if (config.frameworks.includes("express"))
        parsers.push(new expressParser_1.ExpressParser());
    if (config.frameworks.includes("nestjs"))
        parsers.push(new nestControllerParser_1.NestControllerParser());
    return parsers;
}
//# sourceMappingURL=parserFactory.js.map