/**
 * parse any string to a valid pg tsquery
 * @param  {[string]} q
 * @return {[string]}
 */
function tsquery(q) {
	return toStr(parse(q || ''));
}

module.exports = tsquery
tsquery.parse = parse;
tsquery.toStr = toStr;

if (!String.prototype.trimLeft) { // good enough shim, for old node engines
	String.prototype.trimLeft = String.prototype.trim;
}

// consume unparsable tail string (when too many closing parens, ex: 'foo ) bar')
function parse(str) {
	let node = parseOr(str);
	let tail = node && node.input && node.input.replace(/^[\s|,&+<:)\]]+/, '');
	while (tail) {
		const right = parseOr(tail);
		if (!right) {
			return node;
		}
		node = {
			type: /^[|,]/.test(tail) ? '|' : '&',
			left: node,
			right,
			input: right.input
		};
		tail = node.input;
	}
	return node;
}

const OR = /^\s*[|,]/;

function parseOr(str) {
	let s = str;
	let node;

	do {
		const m = s.match(OR);
		let right;
		let negated;
		if (m) {
			const s2 = s.slice(m[0].length);
			const m2 = s2.match(/^[\s|,&+<:!-]*/);
			right = parseAnd(s2.slice(m2[0].length));
			negated = /[!-]$/.test(m2[0]);
		} else {
			right = parseAnd(s);
		}
		
		if (!right) {
			return node;
		}
		right.negated = right.negated || negated;

		node = node ? {
			type: '|',
			left: node,
			right,
			input: right.input
		} : right;

		s = node.input;
	}
	while (node && node.input);

	return node;
}

const AND = /^(?!\s*[|,])[\s&+<:|,!-]*/;

function parseAnd(str) {

	let node = parseWord(str);

	while (node && node.input) {
		const m = node.input.match(AND);

		if (!m) {
			return node;
		}
		const s = node.input.slice(m[0].length);
		const m2 = s.match(/^[\s|,&+<:!-]*/);
		const right = parseWord(s.slice(m2[0].length));

		if (!right) {
			return node;
		}

		right.negated = right.negated || /[!-]$/.test(m[0]) || /[!-]$/.test(m2[0]);

		node = {
			type: '&',
			left: node,
			right,
			input: right.input
		};
	}
	return node;
}

function parseWord(str) {
	const s = str.trimLeft();
	const par = s.match(/^\s*[!-]*[(\[]/);
	if (par) {
		const s2 = s.slice(par[0].length);
		const node = parseOr(s2);
		return {
			...node,
			negated: node.negated || par[0].length > 1,
			input: node.input.trimLeft().replace(/^[)\]]/, '')
		};
	}
	const m = s.match(/^\s*([!-]*)[^\s|,&+<:()\[\]!-]+/);

	return m ? {
		value: m[0].slice(m[1].length),
		negated: m[1],
		input: s.slice(m.index + m[0].length)
	} : undefined;
}

function toStr(node = {}) {
	const s = node.negated ? '!' : '';
	const type = node.type;
	if (!type) {
		return node.value && (s + node.value); // avoid just '!'
	}

	let leftStr = toStr(node.left);
	let rightStr = toStr(node.right);
	if (!leftStr) {
		return s + rightStr;
	}
	if (!rightStr) {
		return s + leftStr;
	}
	if (node.type==='&' && node.left.type==='|' && !node.left.negated) { // wrap left in parens
		leftStr = '(' + leftStr + ')';
	}
	if (node.type==='&' && node.right.type==='|' && !node.right.negated) { // wrap right in parens
		rightStr = '(' + rightStr + ')';
	}
	return s ? s + '(' + leftStr + node.type + rightStr + ')' : leftStr + node.type + rightStr;
}
