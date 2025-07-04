// js/CodeGenerator.js
// No direct imports from other custom modules, but relies on AST structure
// and node configurations implicitly via the 'ast' parameter from AbstractSyntaxTree.js.

export class CodeGenerator {
  constructor() {
    this.visitedExecNodes = new Set();
    this.dataValueCache = new Map();
    this.visitedFunctionDefs = new Set();
    this.isGameLoopGenerating = false; 
  }
  
  generateCode(ast) { 
    this.visitedExecNodes.clear();
    this.dataValueCache.clear();
    this.visitedFunctionDefs.clear();
    this.isGameLoopGenerating = false;
    
    const gameLoopNode = ast.nodes.find(node => node.type === 'gameLoop');
    const eventHatNodes = ast.nodes.filter(node => node.type === 'whenKeyPressed'); 
    const startNode = ast.nodes.find(node => node.type === 'start');

    if (!gameLoopNode && !startNode && eventHatNodes.length === 0) {
        return '// No Start Flag, Game Loop, or Event nodes found. Add one to begin your program!\n// Nothing to run.';
    }
    
    let code = `// Generated by NodeCanvas Playground @ ${new Date().toLocaleTimeString()}\n`;
    code += `"use strict";\n`; 
    code += `let variables = {}; \n`;
    code += `let animationFrameId_gameLoop = null;\n`;
    code += `let isGameLoopRunning = false;\n\n`;

    code += `// --- Audio Context & Sound Functions ---\n`;
    code += `let audioCtxOuter = null;\n`;
    code += `function ensureAudioContext() { if (!audioCtxOuter || audioCtxOuter.state === 'closed') { try { audioCtxOuter = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtxOuter.state === 'suspended') { audioCtxOuter.resume().catch(e=>console.warn('Audio resume failed:',e));} } catch(e) { console.error('Web Audio API not supported or context creation failed.', e); audioCtxOuter = null; return null;} } return audioCtxOuter; }\n`;
    code += `const sounds = {\n`;
    code += `  'click': (audioCtx) => { if(!audioCtx) return; const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(800, audioCtx.currentTime); o.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.05); o.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.05); },\n`;
    code += `  'boop': (audioCtx) => { if(!audioCtx) return; const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(440, audioCtx.currentTime); o.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.1); },\n`;
    code += `  'laser': (audioCtx) => { if(!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1200, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2); g.gain.setValueAtTime(0.3, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.2); }\n`;
    code += `};\n`;
    code += `function playNodeSound(soundNameStr) { const audioCtx = ensureAudioContext(); if (!audioCtx) { return; } try { if(sounds[soundNameStr]) { sounds[soundNameStr](audioCtx); } else { console.warn('Sound not found: ' + soundNameStr); } } catch(e) { console.error('Error playing sound "'+soundNameStr+'":', e); } }\n\n`;
    
    code += `// --- Drawing Initializations ---\n`;
    code += `if (canvas && ctx) {\n`;
    code += `  ctx.font = '16px Arial';\n`;
    code += `  ctx.strokeStyle = '#000000'; ctx.fillStyle = '#000000'; ctx.lineWidth = 2; ctx.beginPath();\n`;
    code += `} else { console.warn("Canvas or Ctx not available during init code generation for drawing."); }\n\n`;

    ast.nodes.filter(n => n.type === 'function')
      .forEach(funcNode => {
        const mainVisited = new Set(this.visitedExecNodes); 
        this.visitedExecNodes = new Set(); 
        code += this.generateFunctionDefinition(funcNode, ast);
        this.visitedExecNodes = mainVisited; 
      });
      
    code += `\n// --- Event Handler Registrations & Main Program Logic ---\n`;
    code += `ensureAudioContext();\n`;

    eventHatNodes.forEach(eventNode => {
        if (eventNode.type === 'whenKeyPressed') {
            code += this.generateEventHandlerRegistration(eventNode, ast);
        }
    });

    let mainExecutionCode = "";
    if (gameLoopNode) {
      this.isGameLoopGenerating = true; 
      if (startNode) {
          const mainVisitedBackup = new Set(this.visitedExecNodes);
          this.visitedExecNodes.clear(); 
          let startSetupCode = this.generateExecCode(startNode, ast, '', new Set()); 
          if (startSetupCode.trim() !== "" && !startSetupCode.trim().startsWith("/*")) {
              code += `\n// --- One-time Setup from Start Node ---\n`;
              code += startSetupCode;
              code += `\n// --- End of One-time Setup ---\n`;
          }
          this.visitedExecNodes = mainVisitedBackup;
      }
      mainExecutionCode = this.generateGameLoop(gameLoopNode, ast);
    } else if (startNode) { 
      this.visitedExecNodes.clear(); 
      mainExecutionCode = this.generateExecCode(startNode, ast, '', this.visitedExecNodes);
    }
    
    code += mainExecutionCode;

    if (mainExecutionCode.trim() === "" && eventHatNodes.length === 0 && !gameLoopNode) {
        code += "\n// console.log('NodeCanvas script finished (no active execution paths found).');";
    } else if (mainExecutionCode.trim() === "" && (eventHatNodes.length > 0 || gameLoopNode)) {
        code += "\n// console.log('NodeCanvas script setup complete. Awaiting events or game loop ticks.');";
    }
    
    return code;
  }

  generateGameLoop(gameLoopNode, ast) {
    const mainVisitedBackup = new Set(this.visitedExecNodes);
    this.visitedExecNodes.clear(); 

    let loopContent = this.generateConnectedExec(gameLoopNode.id, 'tick', ast, '  ', new Set()); 

    this.visitedExecNodes = mainVisitedBackup; 

    let gameLoopCode = `\nfunction gameLoopTick_generated(timestamp) {\n`;
    gameLoopCode += `  if (!isGameLoopRunning) { if(animationFrameId_gameLoop) { cancelAnimationFrame(animationFrameId_gameLoop); } return; }\n`;
    gameLoopCode += loopContent; 
    gameLoopCode += `  animationFrameId_gameLoop = requestAnimationFrame(gameLoopTick_generated);\n`;
    gameLoopCode += `}\n\n`;
    
    gameLoopCode += `function startGameLoop_generated() {\n`;
    gameLoopCode += `  if (animationFrameId_gameLoop) { cancelAnimationFrame(animationFrameId_gameLoop); }\n`;
    gameLoopCode += `  isGameLoopRunning = true;\n`;
    gameLoopCode += `  animationFrameId_gameLoop = requestAnimationFrame(gameLoopTick_generated);\n`;
    gameLoopCode += `  console.log("NodeCanvas Game Loop Started");\n`;
    gameLoopCode += `}\n\n`;

    gameLoopCode += `function stopGameLoop_generated() {\n`;
    gameLoopCode += `  isGameLoopRunning = false;\n`;
    gameLoopCode += `  if (animationFrameId_gameLoop) { cancelAnimationFrame(animationFrameId_gameLoop); animationFrameId_gameLoop = null; }\n`;
    gameLoopCode += `  console.log("NodeCanvas Game Loop Stopped");\n`;
    gameLoopCode += `}\n\n`;

    gameLoopCode += `if (typeof startGameLoop_generated === 'function') { startGameLoop_generated(); }\n`;
    return gameLoopCode;
  }
  
  generateExecCode(node, ast, indent = '', currentPathVisited) {
    if (!node) return `/* Error: generateExecCode called with null node. */\n`;

    if (this.isGameLoopGenerating && node.type === 'start' && currentPathVisited === this.visitedExecNodes) {
        if (!ast.connections.some(c => c.fromNode === node.id && c.fromPort === 'out')) {
            return `/* Start node (ID ${node.id}) without outgoing connections ignored during Game Loop generation. */\n`;
        }
    }
    if (node.type === 'whenKeyPressed' && currentPathVisited === this.visitedExecNodes) {
        return `/* When Key Pressed (ID ${node.id}) is an event handler, not called in sequential flow. */\n`;
    }

    if (currentPathVisited.has(node.id)) {
        return `/* Loop detected: Re-entry to node ${node.type} (ID ${node.id}) skipped in current path. */\n`;
    }
    currentPathVisited.add(node.id);
    
    let nodeCode = '';
    const resolvedInputs = {};
    (node.inputs || []).filter(input => input.portType === 'data').forEach(input => {
      resolvedInputs[input.id] = this.resolveDataInput(node, input.id, ast);
    });
    
    const nl = `\n${indent}`;

    switch (node.type) {
      case 'start': nodeCode += `${nl}// Start Node (ID ${node.id}) Execution Path`; break; 
      case 'gameLoop': nodeCode += `${nl}// Game Loop Node (ID ${node.id}) - its tick logic is defined and started elsewhere.`; break;
      case 'whenKeyPressed': nodeCode += `${nl}// When Key Pressed Node (ID ${node.id}) - its actions are registered as event handlers.`; break;
      
      case 'moveTo': nodeCode += `${nl}if(ctx) { ctx.moveTo(${resolvedInputs.x || 0}, ${resolvedInputs.y || 0}); }`; break;
      case 'lineTo': nodeCode += `${nl}if(ctx) { ctx.lineTo(${resolvedInputs.x || 0}, ${resolvedInputs.y || 0}); ctx.stroke(); ctx.beginPath(); }`; break;
      case 'setColor': nodeCode += `${nl}if(ctx) { ctx.strokeStyle = ${resolvedInputs.color || '"#000000"'}; ctx.fillStyle = ${resolvedInputs.color || '"#000000"'}; }`; break;
      case 'setPenWidth': nodeCode += `${nl}if(ctx) { ctx.lineWidth = ${resolvedInputs.width || 1}; }`; break;
      case 'drawCircle':
        nodeCode += `${nl}if(ctx) { ctx.beginPath();`;
        nodeCode += ` ctx.arc(${resolvedInputs.x || 0}, ${resolvedInputs.y || 0}, Math.max(0, ${resolvedInputs.radius || 10}), 0, Math.PI * 2);`;
        nodeCode += ` ctx.stroke();`;
        if (node.properties && node.properties.fill) { nodeCode += ` ctx.fill();`; }
        nodeCode += ` ctx.beginPath(); }`;
        break;
      case 'drawRectangle':
        nodeCode += `${nl}if(ctx) { ctx.beginPath();`;
        nodeCode += ` ctx.rect(${resolvedInputs.x || 0}, ${resolvedInputs.y || 0}, Math.max(0, ${resolvedInputs.width || 10}), Math.max(0, ${resolvedInputs.height || 10}));`;
        nodeCode += ` ctx.stroke();`;
        if (node.properties && node.properties.fill) { nodeCode += ` ctx.fill();`; }
        nodeCode += ` ctx.beginPath(); }`;
        break;
      case 'clearCanvas':
        nodeCode += `${nl}if(ctx && canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.beginPath(); }`;
        break;
      case 'drawText':
        nodeCode += `${nl}if(ctx) { const prevFontDT_ = ctx.font; const prevFillDT_ = ctx.fillStyle; const prevAlignDT_ = ctx.textAlign; const prevBaselineDT_ = ctx.textBaseline;`;
        nodeCode += ` ctx.font = ${resolvedInputs.font || "'16px Arial'"}; ctx.fillStyle = ${resolvedInputs.color || "'#000000'"}; ctx.textAlign = 'left'; ctx.textBaseline = 'top';`;
        nodeCode += ` ctx.fillText(${resolvedInputs.text || "''"}, ${resolvedInputs.x || 0}, ${resolvedInputs.y || 20});`;
        nodeCode += ` ctx.font = prevFontDT_; ctx.fillStyle = prevFillDT_; ctx.textAlign = prevAlignDT_; ctx.textBaseline = prevBaselineDT_; }`;
        break;
      case 'say':
        nodeCode += `${nl}if(ctx) { const prevFontS_ = ctx.font; const prevFillS_ = ctx.fillStyle; const prevAlignS_ = ctx.textAlign; const prevBaselineS_ = ctx.textBaseline;`;
        nodeCode += `${nl}  ctx.font = 'bold 14px Nunito, sans-serif'; ctx.fillStyle = '#555555'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';`;
        nodeCode += `${nl}  ctx.fillText(${resolvedInputs.message || "''"}, ${resolvedInputs.targetX || 0}, Number(${resolvedInputs.targetY || 0}) - 5);`;
        nodeCode += `${nl}  ctx.font = prevFontS_; ctx.fillStyle = prevFillS_; ctx.textAlign = prevAlignS_; ctx.textBaseline = prevBaselineS_; }`;
        break;
      case 'changeXBy':
        nodeCode += `${nl}if (typeof variables[${resolvedInputs.variableName || '""'}] === 'number') { variables[${resolvedInputs.variableName || '""'}] += (${resolvedInputs.amount || 0}); } else if (variables[${resolvedInputs.variableName || '""'}] === undefined) { variables[${resolvedInputs.variableName || '""'}] = (${resolvedInputs.amount || 0}); } else { console.warn('Variable ' + ${resolvedInputs.variableName || '""'} + ' not a number for changeXBy.'); }`;
        break;
      case 'setXTo':
        nodeCode += `${nl}variables[${resolvedInputs.variableName || '""'}] = (${resolvedInputs.value || 0});`;
        break;
      case 'changeYBy':
        nodeCode += `${nl}if (typeof variables[${resolvedInputs.variableName || '""'}] === 'number') { variables[${resolvedInputs.variableName || '""'}] += (${resolvedInputs.amount || 0}); } else if (variables[${resolvedInputs.variableName || '""'}] === undefined) { variables[${resolvedInputs.variableName || '""'}] = (${resolvedInputs.amount || 0}); } else { console.warn('Variable ' + ${resolvedInputs.variableName || '""'} + ' not a number for changeYBy.'); }`;
        break;
      case 'setYTo':
        nodeCode += `${nl}variables[${resolvedInputs.variableName || '""'}] = (${resolvedInputs.value || 0});`;
        break;
      case 'repeat':
        nodeCode += `${nl}for (let i = 0; i < (${resolvedInputs.count || 0}); i++) {`;
        nodeCode += this.generateConnectedExec(node.id, 'body', ast, indent + '  ', new Set());
        nodeCode += `${nl}}`;
        break;
      case 'if':
        nodeCode += `${nl}if (${resolvedInputs.condition || 'false'}) {`;
        nodeCode += this.generateConnectedExec(node.id, 'then', ast, indent + '  ', new Set());
        nodeCode += `${nl}} else {`;
        nodeCode += this.generateConnectedExec(node.id, 'else', ast, indent + '  ', new Set());
        nodeCode += `${nl}}`;
        break;
      case 'while':
        nodeCode += `${nl}let whileGuard_${node.id} = 0;`;
        nodeCode += `${nl}while (${resolvedInputs.condition || 'false'}) {`;
        nodeCode += `${nl}  if (whileGuard_${node.id}++ > 25000) { console.warn("While loop (ID ${node.id}) iteration limit exceeded (25k)."); break; }`;
        nodeCode += this.generateConnectedExec(node.id, 'body', ast, indent + '  ', new Set());
        nodeCode += `${nl}}`;
        break;
      case 'setVariable': nodeCode += `${nl}variables[${resolvedInputs.name || '""'}] = ${resolvedInputs.value === undefined ? 'undefined' : resolvedInputs.value};`; break;
      case 'callFunction': 
        const funcNameCall = String(resolvedInputs.name || '""').replace(/^"|"$/g, '');
        nodeCode += `${nl}if(typeof ${funcNameCall} === 'function') { ${funcNameCall}(); } else { console.warn('Attempted to call undefined/undeclared function: ${funcNameCall}'); }`; 
        break;
      case 'playSound':
        const soundNameRaw = String(resolvedInputs.soundName || '""').replace(/^"|"$/g, '');
        nodeCode += `${nl}playNodeSound('${soundNameRaw}');`;
        break;
      default: nodeCode += `${nl}// Node type ${node.type} (ID ${node.id}) has no specific exec code generation logic.`;
    }
    
    if (node.type !== 'gameLoop' && node.type !== 'whenKeyPressed') {
        nodeCode += this.generateConnectedExec(node.id, 'out', ast, indent, currentPathVisited);
    }
    return nodeCode;
  }

  generateConnectedExec(fromNodeId, fromPortId, ast, indent, visitedSet) {
      const conn = ast.connections.find(c => c.fromNode === fromNodeId && c.fromPort === fromPortId && c.fromPortType === 'exec');
      if (conn) {
          const nextNode = ast.getNodeById(conn.toNode);
          if (nextNode) {
            return this.generateExecCode(nextNode, ast, indent, visitedSet);
          } else {
            return `\n${indent}/* Error: Next node (ID ${conn.toNode}) in exec path from ${fromNodeId}.${fromPortId} not found. */`;
          }
      }
      return '';
  }
  
  resolveDataInput(targetNode, inputId, ast) {
    const cacheKey = `${targetNode.id}_${inputId}_${targetNode.type}`;
    if (this.dataValueCache.has(cacheKey)) return this.dataValueCache.get(cacheKey);
    
    const connection = ast.getConnectionToInput(targetNode.id, inputId);
    let value;
    let treatAsExpression = false; 

    if (connection) {
      const fromNode = ast.getNodeById(connection.fromNode);
      if (!fromNode) {
          this.dataValueCache.set(cacheKey, 'undefined /* Error: Source node missing */');
          return 'undefined /* Error: Source node missing */';
      }

      switch (fromNode.type) {
        case 'getVariable':
          const varNameResolved = this.resolveDataInput(fromNode, 'name', ast);
          value = `variables[${varNameResolved}]`;
          treatAsExpression = true;
          break;
        case 'number': 
          value = (fromNode.properties && fromNode.properties.value !== undefined) ? fromNode.properties.value : 0; 
          break;
        case 'string': 
          value = (fromNode.properties && fromNode.properties.value !== undefined) ? fromNode.properties.value : ''; 
          break;
        case 'randomNumber':
            const minVal = this.resolveDataInput(fromNode, 'min', ast);
            const maxVal = this.resolveDataInput(fromNode, 'max', ast);
            value = `(Math.floor(Math.random() * ((Number(${maxVal})) - (Number(${minVal})) + 1)) + (Number(${minVal})))`;
            treatAsExpression = true;
            break;
        case 'getMouseX':
            value = `(typeof window.nodeCanvasRuntime_mouseX !== 'undefined' ? window.nodeCanvasRuntime_mouseX : (canvas ? canvas.width/2 : 200))`;
            treatAsExpression = true;
            break;
        case 'add': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) + (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'subtract': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) - (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'multiply': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) * (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'divide': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) / ((${this.resolveDataInput(fromNode, 'b', ast)}) || 1))`; treatAsExpression = true; break;
        case 'lessThan': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) < (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'equalTo': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) === (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'greaterThan': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) > (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'and': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) && (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'or': value = `((${this.resolveDataInput(fromNode, 'a', ast)}) || (${this.resolveDataInput(fromNode, 'b', ast)}))`; treatAsExpression = true; break;
        case 'not': value = `(!(${this.resolveDataInput(fromNode, 'a', ast)}))`; treatAsExpression = true; break;
        default: 
          value = undefined; 
          break; 
      }
    } 
    
    if (value === undefined) { 
      const inputConfig = targetNode.inputs.find(i => i.id === inputId);
      if (!inputConfig) {
          this.dataValueCache.set(cacheKey, `undefined /* Error: Input ${inputId} on ${targetNode.type} missing */`);
          return `undefined /* Error: Input ${inputId} on ${targetNode.type} missing */`;
      }
      
      value = inputConfig.default; 
      
      if (inputConfig.dataType === 'expression') {
          treatAsExpression = true;
      } else if (typeof value === 'string' && (inputConfig.dataType === 'number' || inputConfig.dataType === 'boolean')) {
          if (value.includes('variables.') || value.includes('Math.') || value.includes('canvas.') || value.includes('window.') || value.match(/[a-zA-Z_]\w*\s*\(.*\)/) || value.match(/[\+\-\*\/\%\&\|\<\>\=\!]/)) {
            treatAsExpression = true;
          }
      }
    }
    
    let finalValue;
    if (treatAsExpression) {
        finalValue = String(value); 
    } else if (typeof value === 'string') {
        finalValue = JSON.stringify(value); 
    } else if (typeof value === 'number' || typeof value === 'boolean') {
        finalValue = value; 
    } else if (value === undefined || value === null) {
        const inputConfig = targetNode.inputs.find(i => i.id === inputId);
        const dataType = inputConfig ? inputConfig.dataType : 'unknown';
        if (dataType === 'number') finalValue = 0;
        else if (dataType === 'string' || dataType === 'color') finalValue = '""'; 
        else if (dataType === 'boolean') finalValue = false;
        else if (dataType === 'expression') finalValue = 'undefined'; 
        else finalValue = 'undefined';
    } else {
        finalValue = JSON.stringify(String(value)); 
    }

    this.dataValueCache.set(cacheKey, finalValue);
    return finalValue;
  }

  generateEventHandlerRegistration(eventNode, ast) {
      if (!eventNode || eventNode.type !== 'whenKeyPressed') return '';
      const tempCache = new Map(this.dataValueCache);
      this.dataValueCache.clear();

      const keyNameInput = eventNode.inputs.find(i => i.id === 'key');
      let keyName = 'space';
      if(keyNameInput){
          keyName = String(this.resolveDataInput(eventNode, 'key', ast)).replace(/^"|"$/g, '');
      }
      keyName = keyName.toLowerCase();

      this.dataValueCache = tempCache; 

      const mainVisitedBackup = new Set(this.visitedExecNodes);
      const gameLoopGeneratingBackup = this.isGameLoopGenerating;
      this.isGameLoopGenerating = false; 
      this.visitedExecNodes.clear(); 
      
      let actionCode = this.generateConnectedExec(eventNode.id, 'out', ast, '    ', new Set());
      
      this.visitedExecNodes = mainVisitedBackup;
      this.isGameLoopGenerating = gameLoopGeneratingBackup;

      if (actionCode.trim() === "" || actionCode.trim().startsWith("/*")) {
        return `/* 'When Key Pressed' for "${keyName}" (ID ${eventNode.id}) has no actions connected or actions were skipped. */\n`;
      }

      const handlerFuncName = `handleKeyPress_node${eventNode.id}_${keyName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

      let registrationCode = `function ${handlerFuncName}() {\n`;
      registrationCode += `  // console.log('Key "${keyName}" pressed, executing handler ${handlerFuncName} from node ID ${eventNode.id}');\n`;
      registrationCode += actionCode + '\n';
      registrationCode += `}\n`;
      registrationCode += `if (typeof registerKeyPressAction === 'function') { registerKeyPressAction("${keyName}", ${handlerFuncName}); }\n`;
      registrationCode += `else { console.warn("'registerKeyPressAction' not available. Cannot register key event for node ID ${eventNode.id}."); }\n`;
      return registrationCode;
  }
  
  generateFunctionDefinition(funcNode, ast) {
    if (this.visitedFunctionDefs.has(funcNode.id)) return '';
    this.visitedFunctionDefs.add(funcNode.id);

    const funcNameResolved = this.resolveDataInput(funcNode, 'name', ast);
    const funcName = String(funcNameResolved).replace(/^"|"$/g, '');

    if (!funcName || !/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(funcName)) {
      return `/* Invalid function name: ${funcNameResolved} (Node ID ${funcNode.id}). Skipping definition. */\n`;
    }

    let code = `\nfunction ${funcName}() {\n`;
    code += this.generateConnectedExec(funcNode.id, 'body', ast, '  ', new Set());
    code += `}\n`;
    return code;
  }
}