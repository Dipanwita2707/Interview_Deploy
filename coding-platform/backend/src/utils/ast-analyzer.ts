export interface ASTAnalysisResult {
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  maxNestingDepth: number;
  optimizationWarning: string | null;
}

/**
 * Analyzes code using Tree-Sitter AST parser.
 * Dynamically falls back to rule-based approximation if parser loading fails.
 */
export function analyzeCode(sourceCode: string, language: string): ASTAnalysisResult {
  const lang = language.toLowerCase();
  
  try {
    const Parser = require('tree-sitter');
    const JavaScript = require('tree-sitter-javascript');
    const Python = require('tree-sitter-python');

    const parser = new Parser();
    
    if (lang === 'javascript' || lang === 'typescript' || lang === 'node') {
      parser.setLanguage(JavaScript);
    } else if (lang === 'python') {
      parser.setLanguage(Python);
    } else {
      // Fallback default language
      parser.setLanguage(JavaScript);
    }

    const tree = parser.parse(sourceCode);
    let maxDepth = 0;
    let complexity = 1; // Base complexity

    function walk(node: any, currentDepth: number) {
      const type = node.type;

      const isLoop = [
        'for_statement',
        'while_statement',
        'for_in_statement',
        'do_statement',
        'for_of_statement'
      ].includes(type);

      const isBranch = [
        'if_statement',
        'ternary_expression',
        'catch_clause',
        'except_clause',
        'elif_clause',
        'conditional_expression'
      ].includes(type);

      let nextDepth = currentDepth;
      if (isLoop) {
        nextDepth += 1;
        maxDepth = Math.max(maxDepth, nextDepth);
      }

      if (isBranch || isLoop) {
        complexity += 1;
      }

      if (['&&', '||', 'and', 'or', '??'].includes(type)) {
        complexity += 1;
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i), nextDepth);
      }
    }

    if (tree.rootNode) {
      walk(tree.rootNode, 0);
    }

    const lines = sourceCode.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('/*') && !l.startsWith('*'));
    const loc = lines.length;

    let mi = 100.0 - (complexity * 2.5) - (loc * 0.1);
    mi = Math.round(Math.max(0.0, Math.min(100.0, mi)) * 100) / 100;

    let warning: string | null = null;
    if (maxDepth >= 2) {
      warning = `High loop nesting depth of ${maxDepth} detected. Consider optimizing to reduce time complexity.`;
    } else if (complexity > 10) {
      warning = `High cyclomatic complexity (${complexity}) detected. Consider refactoring into helper functions.`;
    }

    return {
      cyclomaticComplexity: complexity,
      maintainabilityIndex: mi,
      maxNestingDepth: maxDepth,
      optimizationWarning: warning
    };
  } catch (err) {
    console.warn('[AST] Dynamic tree-sitter loading failed, using robust fallback analyzer:', (err as any).message);
    return fallbackAnalyze(sourceCode, language);
  }
}

/**
 * Fallback static analyzer for environments where native Node-bindings fail compilation.
 */
function fallbackAnalyze(sourceCode: string, language: string): ASTAnalysisResult {
  const lang = language.toLowerCase();
  let nestingDepth = 0;

  if (lang === 'python') {
    let maxDepth = 0;
    const loopPattern = /^\s*(for|while)\b/;
    const loopIndents: number[] = [];
    for (const line of sourceCode.split('\n')) {
      const stripped = line.trimStart();
      if (!stripped || stripped.startsWith('#')) continue;
      const indent = line.length - stripped.length;
      while (loopIndents.length && loopIndents[loopIndents.length - 1] >= indent) {
        loopIndents.pop();
      }
      if (loopPattern.test(stripped)) {
        loopIndents.push(indent);
        maxDepth = Math.max(maxDepth, loopIndents.length);
      }
    }
    nestingDepth = maxDepth;
  } else {
    let maxDepth = 0;
    const loopPattern = /\b(for|while)\b|(\.forEach|\.map)\b/;
    const loopAtBraceLevels = new Set<number>();
    let currentBraceLevel = 0;
    for (let line of sourceCode.split('\n')) {
      line = line.replace(/\/\/.*|\/\*.*?\*\//g, '');
      let hasLoop = loopPattern.test(line);
      for (const char of line) {
        if (char === '{') {
          currentBraceLevel += 1;
          if (hasLoop) {
            loopAtBraceLevels.add(currentBraceLevel);
            maxDepth = Math.max(maxDepth, loopAtBraceLevels.size);
            hasLoop = false;
          }
        } else if (char === '}') {
          if (loopAtBraceLevels.has(currentBraceLevel)) {
            loopAtBraceLevels.delete(currentBraceLevel);
          }
          currentBraceLevel = Math.max(0, currentBraceLevel - 1);
        }
      }
    }
    nestingDepth = maxDepth;
  }

  let cc = 1;
  const decisionKeywords = [
    /\bif\b/, /\belif\b/, /\bwhile\b/, /\bfor\b/,
    /\bcatch\b/, /\band\b/, /\bor\b/,
    /&&/, /\|\|/, /\?/
  ];
  for (let line of sourceCode.split('\n')) {
    line = line.replace(/\/\/.*|#.*|\/\*.*?\*\//g, '');
    for (const pattern of decisionKeywords) {
      const matches = line.match(new RegExp(pattern, 'g'));
      if (matches) cc += matches.length;
    }
  }

  const lines = sourceCode.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#'));
  const loc = lines.length;
  let mi = 100.0 - (cc * 2.5) - (loc * 0.1);
  mi = Math.round(Math.max(0.0, Math.min(100.0, mi)) * 100) / 100;

  let warning: string | null = null;
  if (nestingDepth >= 2) {
    warning = `High loop nesting depth of ${nestingDepth} detected. Consider optimizing to reduce time complexity.`;
  } else if (cc > 10) {
    warning = `High cyclomatic complexity (${cc}) detected. Consider refactoring into helper functions.`;
  }

  return {
    cyclomaticComplexity: cc,
    maintainabilityIndex: mi,
    maxNestingDepth: nestingDepth,
    optimizationWarning: warning
  };
}
