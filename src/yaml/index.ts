// YAML parsing module
export {
  parseYamlFrontmatter,
  parseYamlFrontmatterFromString,
  parseYamlFrontmatterWithError,
  readFullTemplateContent,
} from './parser.js'
export type { YamlParseResult } from './parser.js'
export type {
  TemplateYaml,
  SpecYaml,
  PhaseDefinition,
  SpecPhase,
  SpecBead,
  SubphasePattern,
} from './types.js'
