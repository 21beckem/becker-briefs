
  /**
   * @param {structure} structure
   * @param {Node} pNode
   * @returns {HTMLElement}
   */
export function buildDOM(structure, pNode) {
	if(!Array.isArray(structure))
		throw new TypeError('structure must be an instance of Array.');
	if(!!pNode && !(pNode instanceof Node))
		throw new TypeError('pNode must ba an instance of Node.');
	
	let node = null;
	//try to make the HTMLElement node
	if(typeof structure[0] === 'string') {
		try {
			node = document.createElement(structure[0]);
		}
		catch (err) {
			throw new TypeError('Unable to create HTMLElement of type: '+ structure[0]);
		}
	}
	else if(structure[0] instanceof Node) {
		node = structure[0];
	}
	else throw new TypeError('index 0 of structure must be a valid HTMLElement tag name or HTMLElement instance.');
	for(let i = 1; i< structure.length; i++) {
		//recurse for array values
		if(Array.isArray(structure[i]))
			this.buildDOM(structure[i], node);
		//object values set attributes of the node defined at index 0
		else if(typeof structure[i] === 'object')
			for(let p in structure[i]) {
				if(typeof structure[i][p] === 'string')
					node.setAttribute(p, structure[i][p]);
			}
		//string values are used as text nodes
		else if(typeof structure[i] === 'string')
			node.appendChild(document.createTextNode(structure[i]));
	}
	if(pNode)
		pNode.appendChild(node);
		
	return pNode || node;
}

export function hexColorToTintedWhite(hex, factor=0.65, alpha=0.75) {
  const clean = hex.replace('#', '');
  const t = Math.max(0, Math.min(1, factor));
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  r = Math.round(r + (255 - r) * t);
  g = Math.round(g + (255 - g) * t);
  b = Math.round(b + (255 - b) * t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}