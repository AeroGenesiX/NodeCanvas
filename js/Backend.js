// js/Backend.js

export class Backend {
  constructor() {
    this.visitedExecNodes = new Set();
    this.dataValueCache = new Map();
    this.visitedFunctionDefs = new Set();
  }
  
  generateCode(ir) {
    this.visitedExecNodes.clear();
    this.dataValueCache.clear();
    this.visitedFunctionDefs.clear();
    
    const startNode = ir.nodes.find(node => node.type === 'start');
    if (!startNode) return '// No Start node found.';
    
    let code = `// Generated by NodeCanvas Compiler\n`;
    // REMOVE: code += `const ctx = canvas.getContext('2d');\n`; 
    // The 'ctx' will be provided by the CompilerApp when calling new Function
    code += `let variables = {};\n\n`;
    code += `// --- Global Scope Initializations ---\n`;
    code += `ctx.strokeStyle = '#000000';\n`; // Use the 'ctx' that will be passed in
    code += `ctx.fillStyle = '#000000';\n`;
    code += `ctx.lineWidth = 2;\n`;
    code += `ctx.beginPath(); // Initial beginPath\n\n`;


    // Hoist function definitions
    ir.nodes.filter(n => n.type === 'function')
      .forEach(funcNode => code += this.generateFunctionDefinition(funcNode, ir));
      
    code += `\n// --- Main Program Execution ---\n`;
    code += this.generateExecCode(startNode, ir);
    
    return code;
  }
  
  generateExecCode(node, ir, indent = '', currentPathVisited = this.visitedExecNodes) {
    if (!node || currentPathVisited.has(node.id)) return '';
    currentPathVisited.add(node.id);
    
    let code = '';
    const resolvedInputs = {};
    (node.inputs || []).filter(input => input.portType === 'data').forEach(input => {
      resolvedInputs[input.id] = this.resolveDataInput(node, input.id, ir);
    });
    
    const nl = `\n${indent}`; // Newline with indent

    switch (node.type) {
      case 'start': break; // Entry point
      case 'moveTo': code += `${nl}ctx.moveTo(${resolvedInputs.x}, ${resolvedInputs.y});`; break;
      case 'lineTo': code += `${nl}ctx.lineTo(${resolvedInputs.x}, ${resolvedInputs.y});${nl}ctx.stroke();${nl}ctx.beginPath();`; break; // stroke and begin new path
      case 'setColor': code += `${nl}ctx.strokeStyle = ${resolvedInputs.color};${nl}ctx.fillStyle = ${resolvedInputs.color};`; break;
      case 'setPenWidth': code += `${nl}ctx.lineWidth = ${resolvedInputs.width};`; break;
      case 'drawCircle':
        code += `${nl}ctx.beginPath();`;
        code += `${nl}ctx.arc(${resolvedInputs.x}, ${resolvedInputs.y}, ${resolvedInputs.radius}, 0, Math.PI * 2);`;
        code += `${nl}ctx.stroke();`;
        if (node.properties.fill) code += `${nl}ctx.fill();`;
        code += `${nl}ctx.beginPath();`; // Ready for next drawing
        break;
      case 'drawRectangle':
        code += `${nl}ctx.beginPath();`;
        code += `${nl}ctx.rect(${resolvedInputs.x}, ${resolvedInputs.y}, ${resolvedInputs.width}, ${resolvedInputs.height});`;
        code += `${nl}ctx.stroke();`;
        if (node.properties.fill) code += `${nl}ctx.fill();`;
        code += `${nl}ctx.beginPath();`; // Ready for next drawing
        break;
      case 'repeat':
        code += `${nl}for (let i = 0; i < ${resolvedInputs.count}; i++) {`;
        code += this.generateConnectedExec(node.id, 'body', ir, indent + '  ', new Set());
        code += `${nl}}`;
        break;
      case 'if':
        code += `${nl}if (${resolvedInputs.condition}) {`;
        code += this.generateConnectedExec(node.id, 'then', ir, indent + '  ', new Set());
        code += `${nl}} else {`;
        code += this.generateConnectedExec(node.id, 'else', ir, indent + '  ', new Set());
        code += `${nl}}`;
        break;
      case 'while':
        code += `${nl}while (${resolvedInputs.condition}) {`;
        code += this.generateConnectedExec(node.id, 'body', ir, indent + '  ', new Set());
        code += `${nl}}`;
        break;
      case 'setVariable': code += `${nl}variables[${resolvedInputs.name}] = ${resolvedInputs.value};`; break;
      case 'callFunction': code += `${nl}${String(resolvedInputs.name).replace(/"/g, '')}();`; break; // Ensure name is not quoted for call
      default: code += `${nl}// Node type ${node.type} not implemented in backend`;
    }
    
    code += this.generateConnectedExec(node.id, 'out', ir, indent, currentPathVisited);
    return code;
  }

  generateConnectedExec(fromNodeId, fromPortId, ir, indent, visitedSet) {
      const conn = ir.connections.find(c => c.fromNode === fromNodeId && c.fromPort === fromPortId && c.fromPortType === 'exec');
      if (conn) {
          const nextNode = ir.getNodeById(conn.toNode);
          return this.generateExecCode(nextNode, ir, indent, visitedSet);
      }
      return '';
  }
  
  resolveDataInput(targetNode, inputId, ir) {
    const cacheKey = `${targetNode.id}_${inputId}`;
    if (this.dataValueCache.has(cacheKey)) return this.dataValueCache.get(cacheKey);
    
    const connection = ir.getConnectionToInput(targetNode.id, inputId);
    let value;

    if (connection) {
      const fromNode = ir.getNodeById(connection.fromNode);
      if (!fromNode) return 'undefined /* Source node not found */';

      switch (fromNode.type) {
        case 'getVariable':
          // Resolve the name of the variable to get. It could be a literal or connected to another data source.
          const varNameResolved = this.resolveDataInput(fromNode, 'name', ir);
          value = `variables[${varNameResolved}]`;
          break;
        case 'number': value = fromNode.properties.value !== undefined ? fromNode.properties.value : 0; break;
        case 'string': value = JSON.stringify(fromNode.properties.value !== undefined ? fromNode.properties.value : ''); break;
        default: value = 'undefined /* Unsupported data source node */'; break;
      }
    } else {
  const inputConfig = targetNode.inputs.find(i => i.id === inputId);
  if (!inputConfig) return 'undefined /* Input config not found */';
  
  if (inputConfig.dataType === 'expression') { // <<<< CHANGE HERE
    value = inputConfig.default; // Use the string directly for expressions
  } else if (['string', 'color'].includes(inputConfig.dataType)) {
    value = JSON.stringify(inputConfig.default);
  } else {
    value = inputConfig.default;
  }
}
    this.dataValueCache.set(cacheKey, value);
    return String(value); // Ensure it's a string for code generation
  }
  
  generateFunctionDefinition(funcNode, ir) {
    if (this.visitedFunctionDefs.has(funcNode.id)) return '';
    this.visitedFunctionDefs.add(funcNode.id);

    // The function name itself is resolved as a data input.
    const funcNameResolved = this.resolveDataInput(funcNode, 'name', ir);
    const funcName = String(funcNameResolved).replace(/"/g, ''); // Remove quotes for function name


    let code = `\nfunction ${funcName}() {\n`;
    code += this.generateConnectedExec(funcNode.id, 'body', ir, '  ', new Set()); // New visited set for function body
    code += `}\n`;
    return code;
  }
}