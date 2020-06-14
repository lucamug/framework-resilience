var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error(`Cannot have duplicate keys in a keyed each`);
            }
            keys.add(key);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.23.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src/App.svelte generated by Svelte v3.23.1 */

    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	child_ctx[17] = list;
    	child_ctx[18] = i;
    	return child_ctx;
    }

    // (98:0) {#if items.length > 0}
    function create_if_block(ctx) {
    	let section;
    	let input;
    	let input_checked_value;
    	let t0;
    	let label;
    	let t2;
    	let ul0;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t3;
    	let footer;
    	let span;
    	let strong;
    	let t4;
    	let t5;
    	let t6_value = (/*numActive*/ ctx[4] === 1 ? "item" : "items") + "";
    	let t6;
    	let t7;
    	let t8;
    	let ul1;
    	let li0;
    	let a0;
    	let t9;
    	let a0_class_value;
    	let t10;
    	let li1;
    	let a1;
    	let t11;
    	let a1_class_value;
    	let t12;
    	let li2;
    	let a2;
    	let t13;
    	let a2_class_value;
    	let t14;
    	let mounted;
    	let dispose;
    	let each_value = /*filtered*/ ctx[3];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*item*/ ctx[16].id;
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let if_block = /*numCompleted*/ ctx[5] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			section = element("section");
    			input = element("input");
    			t0 = space();
    			label = element("label");
    			label.textContent = "Mark all as complete";
    			t2 = space();
    			ul0 = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t3 = space();
    			footer = element("footer");
    			span = element("span");
    			strong = element("strong");
    			t4 = text(/*numActive*/ ctx[4]);
    			t5 = space();
    			t6 = text(t6_value);
    			t7 = text(" left");
    			t8 = space();
    			ul1 = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			t9 = text("All");
    			t10 = space();
    			li1 = element("li");
    			a1 = element("a");
    			t11 = text("Active");
    			t12 = space();
    			li2 = element("li");
    			a2 = element("a");
    			t13 = text("Completed");
    			t14 = space();
    			if (if_block) if_block.c();
    			attr_dev(input, "id", "toggle-all");
    			attr_dev(input, "class", "toggle-all");
    			attr_dev(input, "type", "checkbox");
    			input.checked = input_checked_value = /*numCompleted*/ ctx[5] === /*items*/ ctx[1].length;
    			add_location(input, file, 99, 2, 2127);
    			attr_dev(label, "for", "toggle-all");
    			add_location(label, file, 100, 2, 2252);
    			attr_dev(ul0, "class", "todo-list");
    			add_location(ul0, file, 102, 2, 2308);
    			add_location(strong, file, 127, 4, 3022);
    			attr_dev(span, "class", "todo-count");
    			add_location(span, file, 126, 3, 2992);
    			attr_dev(a0, "class", a0_class_value = /*currentFilter*/ ctx[0] === "all" ? "selected" : "");
    			attr_dev(a0, "href", "#/");
    			add_location(a0, file, 131, 8, 3137);
    			add_location(li0, file, 131, 4, 3133);
    			attr_dev(a1, "class", a1_class_value = /*currentFilter*/ ctx[0] === "active" ? "selected" : "");
    			attr_dev(a1, "href", "#/activa");
    			add_location(a1, file, 132, 8, 3223);
    			add_location(li1, file, 132, 4, 3219);

    			attr_dev(a2, "class", a2_class_value = /*currentFilter*/ ctx[0] === "completed"
    			? "selected"
    			: "");

    			attr_dev(a2, "href", "#/completed");
    			add_location(a2, file, 133, 8, 3321);
    			add_location(li2, file, 133, 4, 3317);
    			attr_dev(ul1, "class", "filters");
    			add_location(ul1, file, 130, 3, 3108);
    			attr_dev(footer, "class", "footer");
    			add_location(footer, file, 125, 2, 2965);
    			attr_dev(section, "class", "main");
    			add_location(section, file, 98, 1, 2102);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, input);
    			append_dev(section, t0);
    			append_dev(section, label);
    			append_dev(section, t2);
    			append_dev(section, ul0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul0, null);
    			}

    			append_dev(section, t3);
    			append_dev(section, footer);
    			append_dev(footer, span);
    			append_dev(span, strong);
    			append_dev(strong, t4);
    			append_dev(span, t5);
    			append_dev(span, t6);
    			append_dev(span, t7);
    			append_dev(footer, t8);
    			append_dev(footer, ul1);
    			append_dev(ul1, li0);
    			append_dev(li0, a0);
    			append_dev(a0, t9);
    			append_dev(ul1, t10);
    			append_dev(ul1, li1);
    			append_dev(li1, a1);
    			append_dev(a1, t11);
    			append_dev(ul1, t12);
    			append_dev(ul1, li2);
    			append_dev(li2, a2);
    			append_dev(a2, t13);
    			append_dev(footer, t14);
    			if (if_block) if_block.m(footer, null);

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*toggleAll*/ ctx[8], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*numCompleted, items*/ 34 && input_checked_value !== (input_checked_value = /*numCompleted*/ ctx[5] === /*items*/ ctx[1].length)) {
    				prop_dev(input, "checked", input_checked_value);
    			}

    			if (dirty & /*filtered, editing, handleEdit, submit, remove*/ 3212) {
    				const each_value = /*filtered*/ ctx[3];
    				validate_each_argument(each_value);
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul0, destroy_block, create_each_block, null, get_each_context);
    			}

    			if (dirty & /*numActive*/ 16) set_data_dev(t4, /*numActive*/ ctx[4]);
    			if (dirty & /*numActive*/ 16 && t6_value !== (t6_value = (/*numActive*/ ctx[4] === 1 ? "item" : "items") + "")) set_data_dev(t6, t6_value);

    			if (dirty & /*currentFilter*/ 1 && a0_class_value !== (a0_class_value = /*currentFilter*/ ctx[0] === "all" ? "selected" : "")) {
    				attr_dev(a0, "class", a0_class_value);
    			}

    			if (dirty & /*currentFilter*/ 1 && a1_class_value !== (a1_class_value = /*currentFilter*/ ctx[0] === "active" ? "selected" : "")) {
    				attr_dev(a1, "class", a1_class_value);
    			}

    			if (dirty & /*currentFilter*/ 1 && a2_class_value !== (a2_class_value = /*currentFilter*/ ctx[0] === "completed"
    			? "selected"
    			: "")) {
    				attr_dev(a2, "class", a2_class_value);
    			}

    			if (/*numCompleted*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(footer, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(98:0) {#if items.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (112:5) {#if editing === index}
    function create_if_block_2(ctx) {
    	let input;
    	let input_value_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			input.value = input_value_value = /*item*/ ctx[16].description;
    			attr_dev(input, "id", "edit");
    			attr_dev(input, "class", "edit");
    			input.autofocus = true;
    			add_location(input, file, 112, 6, 2764);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			input.focus();

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "keydown", /*handleEdit*/ ctx[10], false, false, false),
    					listen_dev(input, "blur", /*submit*/ ctx[11], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*filtered*/ 8 && input_value_value !== (input_value_value = /*item*/ ctx[16].description) && input.value !== input_value_value) {
    				prop_dev(input, "value", input_value_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(112:5) {#if editing === index}",
    		ctx
    	});

    	return block;
    }

    // (104:3) {#each filtered as item, index (item.id)}
    function create_each_block(key_1, ctx) {
    	let li;
    	let div;
    	let input;
    	let t0;
    	let label;
    	let t1_value = /*item*/ ctx[16].description + "";
    	let t1;
    	let t2;
    	let button;
    	let t3;
    	let t4;
    	let li_class_value;
    	let mounted;
    	let dispose;

    	function input_change_handler() {
    		/*input_change_handler*/ ctx[12].call(input, /*each_value*/ ctx[17], /*index*/ ctx[18]);
    	}

    	function dblclick_handler(...args) {
    		return /*dblclick_handler*/ ctx[13](/*index*/ ctx[18], ...args);
    	}

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[14](/*index*/ ctx[18], ...args);
    	}

    	let if_block = /*editing*/ ctx[2] === /*index*/ ctx[18] && create_if_block_2(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			li = element("li");
    			div = element("div");
    			input = element("input");
    			t0 = space();
    			label = element("label");
    			t1 = text(t1_value);
    			t2 = space();
    			button = element("button");
    			t3 = space();
    			if (if_block) if_block.c();
    			t4 = space();
    			attr_dev(input, "class", "toggle");
    			attr_dev(input, "type", "checkbox");
    			add_location(input, file, 106, 6, 2496);
    			add_location(label, file, 107, 6, 2571);
    			attr_dev(button, "class", "destroy");
    			add_location(button, file, 108, 6, 2649);
    			attr_dev(div, "class", "view");
    			add_location(div, file, 105, 5, 2471);

    			attr_dev(li, "class", li_class_value = "" + ((/*item*/ ctx[16].completed ? "completed" : "") + " " + (/*editing*/ ctx[2] === /*index*/ ctx[18]
    			? "editing"
    			: "")));

    			add_location(li, file, 104, 4, 2380);
    			this.first = li;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, div);
    			append_dev(div, input);
    			input.checked = /*item*/ ctx[16].completed;
    			append_dev(div, t0);
    			append_dev(div, label);
    			append_dev(label, t1);
    			append_dev(div, t2);
    			append_dev(div, button);
    			append_dev(li, t3);
    			if (if_block) if_block.m(li, null);
    			append_dev(li, t4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", input_change_handler),
    					listen_dev(label, "dblclick", dblclick_handler, false, false, false),
    					listen_dev(button, "click", click_handler, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*filtered*/ 8) {
    				input.checked = /*item*/ ctx[16].completed;
    			}

    			if (dirty & /*filtered*/ 8 && t1_value !== (t1_value = /*item*/ ctx[16].description + "")) set_data_dev(t1, t1_value);

    			if (/*editing*/ ctx[2] === /*index*/ ctx[18]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(li, t4);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*filtered, editing*/ 12 && li_class_value !== (li_class_value = "" + ((/*item*/ ctx[16].completed ? "completed" : "") + " " + (/*editing*/ ctx[2] === /*index*/ ctx[18]
    			? "editing"
    			: "")))) {
    				attr_dev(li, "class", li_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(104:3) {#each filtered as item, index (item.id)}",
    		ctx
    	});

    	return block;
    }

    // (137:3) {#if numCompleted}
    function create_if_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Clear completed";
    			attr_dev(button, "class", "clear-completed");
    			add_location(button, file, 137, 4, 3456);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*clearCompleted*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(137:3) {#if numCompleted}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let header;
    	let h1;
    	let t1;
    	let input;
    	let t2;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*items*/ ctx[1].length > 0 && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "todos";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			add_location(h1, file, 88, 1, 1946);
    			attr_dev(input, "class", "new-todo");
    			attr_dev(input, "placeholder", "What needs to be done?");
    			input.autofocus = true;
    			add_location(input, file, 89, 1, 1962);
    			attr_dev(header, "class", "header");
    			add_location(header, file, 87, 0, 1921);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, h1);
    			append_dev(header, t1);
    			append_dev(header, input);
    			insert_dev(target, t2, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			input.focus();

    			if (!mounted) {
    				dispose = listen_dev(input, "keydown", /*createNew*/ ctx[9], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*items*/ ctx[1].length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			if (detaching) detach_dev(t2);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const ENTER_KEY = 13;
    const ESCAPE_KEY = 27;

    function uuid() {
    	return ("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(/[xy]/g, function (c) {
    		var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
    		return v.toString(16);
    	});
    }

    function instance($$self, $$props, $$invalidate) {
    	let currentFilter = "all";
    	let items = [];
    	let editing = null;

    	try {
    		items = JSON.parse(localStorage.getItem("todos-svelte")) || [];
    	} catch(err) {
    		items = [];
    	}

    	const updateView = () => {
    		$$invalidate(0, currentFilter = "all");

    		if (window.location.hash === "#/active") {
    			$$invalidate(0, currentFilter = "active");
    		} else if (window.location.hash === "#/completed") {
    			$$invalidate(0, currentFilter = "completed");
    		}
    	};

    	window.addEventListener("hashchange", updateView);
    	updateView();

    	function clearCompleted() {
    		$$invalidate(1, items = items.filter(item => !item.completed));
    	}

    	function remove(index) {
    		$$invalidate(1, items = items.slice(0, index).concat(items.slice(index + 1)));
    	}

    	function toggleAll(event) {
    		$$invalidate(1, items = items.map(item => ({
    			id: item.id,
    			description: item.description,
    			completed: event.target.checked
    		})));
    	}

    	function createNew(event) {
    		if (event.which === ENTER_KEY) {
    			$$invalidate(1, items = items.concat({
    				id: uuid(),
    				description: event.target.value,
    				completed: false
    			}));

    			event.target.value = "";
    		}
    	}

    	function handleEdit(event) {
    		if (event.which === ENTER_KEY) event.target.blur(); else if (event.which === ESCAPE_KEY) $$invalidate(2, editing = null);
    	}

    	function submit(event) {
    		$$invalidate(1, items[editing].description = event.target.value, items);
    		$$invalidate(2, editing = null);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("App", $$slots, []);

    	function input_change_handler(each_value, index) {
    		each_value[index].completed = this.checked;
    		(($$invalidate(3, filtered), $$invalidate(0, currentFilter)), $$invalidate(1, items));
    	}

    	const dblclick_handler = index => $$invalidate(2, editing = index);
    	const click_handler = index => remove(index);

    	$$self.$capture_state = () => ({
    		ENTER_KEY,
    		ESCAPE_KEY,
    		currentFilter,
    		items,
    		editing,
    		updateView,
    		clearCompleted,
    		remove,
    		toggleAll,
    		createNew,
    		handleEdit,
    		submit,
    		uuid,
    		filtered,
    		numActive,
    		numCompleted
    	});

    	$$self.$inject_state = $$props => {
    		if ("currentFilter" in $$props) $$invalidate(0, currentFilter = $$props.currentFilter);
    		if ("items" in $$props) $$invalidate(1, items = $$props.items);
    		if ("editing" in $$props) $$invalidate(2, editing = $$props.editing);
    		if ("filtered" in $$props) $$invalidate(3, filtered = $$props.filtered);
    		if ("numActive" in $$props) $$invalidate(4, numActive = $$props.numActive);
    		if ("numCompleted" in $$props) $$invalidate(5, numCompleted = $$props.numCompleted);
    	};

    	let filtered;
    	let numActive;
    	let numCompleted;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*currentFilter, items*/ 3) {
    			 $$invalidate(3, filtered = currentFilter === "all"
    			? items
    			: currentFilter === "completed"
    				? items.filter(item => item.completed)
    				: items.filter(item => !item.completed));
    		}

    		if ($$self.$$.dirty & /*items*/ 2) {
    			 $$invalidate(4, numActive = items.filter(item => !item.completed).length);
    		}

    		if ($$self.$$.dirty & /*items*/ 2) {
    			 $$invalidate(5, numCompleted = items.filter(item => item.completed).length);
    		}

    		if ($$self.$$.dirty & /*items*/ 2) {
    			 try {
    				localStorage.setItem("todos-svelte", JSON.stringify(items));
    			} catch(err) {
    				
    			} // noop
    		}
    	};

    	return [
    		currentFilter,
    		items,
    		editing,
    		filtered,
    		numActive,
    		numCompleted,
    		clearCompleted,
    		remove,
    		toggleAll,
    		createNew,
    		handleEdit,
    		submit,
    		input_change_handler,
    		dblclick_handler,
    		click_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    var app = new App({
        target: document.querySelector('.todoapp'),
    });

    return app;

}());
