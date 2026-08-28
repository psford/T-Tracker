// tests/helpers/maplibre-stub.js — one MapLibre stub for every test that needs one.
//
// This replaces three separately hand-rolled `globalThis.L` stubs that had already
// drifted apart from each other. Three stubs diverging is how a green suite stops
// describing the app: each one only had to satisfy its own file, so none of them had
// to be right.
//
// Import for side effects BEFORE importing any src/ module that touches the map:
//     import { installMapLibreStub } from './helpers/maplibre-stub.js';
//     const stub = installMapLibreStub();

/**
 * Minimal DOM element, for Node runs with no document.
 * Records enough structure for the assertions the suite actually makes: class name,
 * inline styles, innerHTML, and querySelector against the markup we inserted.
 */
function makeElement(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        innerHTML: '',
        children: [],
        dataset: {},
        _listeners: {},
        addEventListener(type, fn) {
            (this._listeners[type] ||= []).push(fn);
        },
        removeEventListener(type, fn) {
            this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn);
        },
        dispatch(type, event = {}) {
            (this._listeners[type] || []).forEach(fn => fn(event));
        },
        appendChild(child) { this.children.push(child); return child; },
        remove() {},
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            contains(c) { return this._set.has(c); },
        },
        // Good enough for "does the markup contain .stop-dot / .vehicle-marker":
        // the modules under test build their own innerHTML, so a substring match
        // answers the only question the suite asks.
        querySelector(sel) {
            const cls = sel.replace(/^\./, '');
            return this.innerHTML.includes(cls) ? makeElement() : null;
        },
        querySelectorAll() { return []; },
        closest() { return null; },
    };
    return el;
}

/**
 * Installs `globalThis.maplibregl` and, when absent, a `document` stub.
 *
 * @returns {{markers: object[], popups: object[], maps: object[], reset: function}}
 *          the objects the stub handed out, so a test can assert on what the code did
 */
export function installMapLibreStub() {
    const markers = [];
    const popups = [];
    const maps = [];

    if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
            createElement: (tag) => makeElement(tag),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
        };
    }

    class Popup {
        constructor(options = {}) {
            this.options = options;
            this.html = null;
            this._open = false;
            this._listeners = {};
            this.setHTMLCalls = 0;
            popups.push(this);
        }
        setHTML(html) { this.html = html; this.setHTMLCalls++; return this; }
        getElement() { return this._element || null; }
        isOpen() { return this._open; }
        on(type, fn) { (this._listeners[type] ||= []).push(fn); return this; }
        fire(type) { (this._listeners[type] || []).forEach(fn => fn()); }
        remove() { this._open = false; this.fire('close'); return this; }
    }

    class Marker {
        constructor(options = {}) {
            this.options = options;
            this.element = options.element || makeElement();
            this.lngLat = null;
            this.popup = null;
            this.onMap = false;
            markers.push(this);
        }
        setLngLat(lngLat) { this.lngLat = lngLat; return this; }
        getLngLat() { return this.lngLat; }
        getElement() { return this.element; }
        setPopup(popup) { this.popup = popup; return this; }
        getPopup() { return this.popup; }
        togglePopup() {
            if (!this.popup) return this;
            this.popup._open = !this.popup._open;
            if (!this.popup._open) this.popup.fire('close');
            return this;
        }
        addTo() { this.onMap = true; return this; }
        remove() { this.onMap = false; return this; }
    }

    class Map_ {
        constructor(options = {}) {
            this.options = options;
            this.sources = new Map();
            this.layers = new Map();
            this.filters = new Map();
            this.paint = new Map();
            this._listeners = {};
            maps.push(this);
        }
        on(type, fn) {
            (this._listeners[type] ||= []).push(fn);
            // Style load is synchronous here; the real thing is not, and the code
            // under test has to queue work until it fires either way.
            if (type === 'style.load') fn();
            return this;
        }
        addControl() { return this; }
        getContainer() { return (this._container ||= makeElement()); }
        addSource(id, source) {
            // The real MapLibre throws here. Leaflet silently added a second layer,
            // so a lenient stub would hide the exact regression the port can cause:
            // hydrateRoutes runs again on every static-data refresh.
            if (this.sources.has(id)) {
                throw new Error(`There is already a source with the ID "${id}".`);
            }
            this.sources.set(id, { ...source, setData(d) { this.data = d; } });
        }
        getSource(id) { return this.sources.get(id); }
        addLayer(layer) { this.layers.set(layer.id, layer); }
        getLayer(id) { return this.layers.get(id); }
        removeLayer(id) { this.layers.delete(id); }
        setFilter(id, filter) { this.filters.set(id, filter); }
        getFilter(id) { return this.filters.get(id); }
        setPaintProperty(id, prop, value) { this.paint.set(`${id}.${prop}`, value); }
        getPaintProperty(id, prop) {
            if (this.paint.has(`${id}.${prop}`)) return this.paint.get(`${id}.${prop}`);
            return this.layers.get(id)?.paint?.[prop];
        }
    }

    globalThis.maplibregl = {
        Map: Map_,
        Marker,
        Popup,
        NavigationControl: class { },
        ScaleControl: class { },
        AttributionControl: class { },
    };

    return {
        markers,
        popups,
        maps,
        reset() { markers.length = 0; popups.length = 0; maps.length = 0; },
    };
}
