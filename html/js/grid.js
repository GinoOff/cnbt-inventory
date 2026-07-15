/**
 * CNBT Inventory - Grid Engine
 *
 * High-performance tetris-style grid with collision detection,
 * item placement, rotation support, and bin-packing sort.
 * Uses Uint8Array for O(1) cell lookups.
 */

'use strict';

class InventoryGrid {
    /**
     * @param {HTMLElement} container - DOM element for the grid
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows
     * @param {number} maxWeight - Maximum weight capacity
     * @param {string} gridId - Unique identifier (player/backpack/external)
     */
    constructor(container, cols, rows, maxWeight, gridId) {
        this.container = container;
        this.cols = cols;
        this.rows = rows;
        this.maxWeight = maxWeight;
        this.gridId = gridId;

        // Fast lookup: occupied[y * cols + x] = itemIndex+1 (0 = empty)
        this.occupied = new Uint16Array(cols * rows);
        // Item data: [{name, x, y, rotated, count, metadata, el}]
        this.items = [];
        // Cell DOM elements for highlighting
        this.cells = [];

        this._buildDOM();
    }

    _buildDOM() {
        this.container.innerHTML = '';
        this.container.style.gridTemplateColumns = `repeat(${this.cols}, var(--cell-size))`;
        this.container.style.gridTemplateRows = `repeat(${this.rows}, var(--cell-size))`;
        this.container.style.position = 'relative';

        this.cells = [];
        const frag = document.createDocumentFragment();
        for (let i = 0; i < this.cols * this.rows; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            this.cells.push(cell);
            frag.appendChild(cell);
        }
        this.container.appendChild(frag);
    }

    /**
     * Get the effective size of an item (accounting for rotation)
     */
    getEffectiveSize(itemName, rotated) {
        const def = window.CNBT.itemDefs[itemName];
        if (!def) return { w: 1, h: 1 };
        return rotated ? { w: def.sizeY, h: def.sizeX } : { w: def.sizeX, h: def.sizeY };
    }

    /**
     * Check if an item can be placed at (x, y) with given size.
     * @param {number} x
     * @param {number} y
     * @param {number} w - effective width
     * @param {number} h - effective height
     * @param {number} [excludeIdx=-1] - item index to exclude from collision
     * @returns {boolean}
     */
    canPlace(x, y, w, h, excludeIdx = -1) {
        if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows) return false;

        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const cellIdx = (y + dy) * this.cols + (x + dx);
                const occupant = this.occupied[cellIdx];
                if (occupant !== 0 && occupant !== excludeIdx + 1) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Mark cells as occupied by item at given index
     */
    _markOccupied(itemIdx, x, y, w, h) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                this.occupied[(y + dy) * this.cols + (x + dx)] = itemIdx + 1;
            }
        }
    }

    /**
     * Clear cells occupied by an item
     */
    _clearOccupied(itemIdx) {
        for (let i = 0; i < this.occupied.length; i++) {
            if (this.occupied[i] === itemIdx + 1) {
                this.occupied[i] = 0;
            }
        }
    }

    /**
     * Rebuild the entire occupied array from items list.
     * Called after bulk operations (sort, load).
     */
    rebuildOccupied() {
        this.occupied.fill(0);
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const size = this.getEffectiveSize(item.name, item.rotated);
            this._markOccupied(i, item.x, item.y, size.w, size.h);
        }
    }

    /**
     * Load items and render them
     * @param {Array} items - [{name, x, y, rotated, count, metadata}]
     */
    loadItems(items) {
        // Clear existing item elements
        for (const item of this.items) {
            if (item.el && item.el.parentNode) {
                item.el.parentNode.removeChild(item.el);
            }
        }

        this.items = items.map(it => ({ ...it }));
        this.rebuildOccupied();
        this._renderAllItems();
    }

    /**
     * Create DOM element for a single item
     */
    _createItemElement(item, index) {
        const def = window.CNBT.itemDefs[item.name];
        if (!def) return null;

        const size = this.getEffectiveSize(item.name, item.rotated);
        const cellSize = this._getCellSize();
        const gap = this._getGap();

        const el = document.createElement('div');
        el.className = 'grid-item';
        el.dataset.gridId = this.gridId;
        el.dataset.itemIndex = index;
        el.dataset.itemName = item.name;

        // Position
        const left = item.x * (cellSize + gap);
        const top = item.y * (cellSize + gap);
        const width = size.w * cellSize + (size.w - 1) * gap;
        const height = size.h * cellSize + (size.h - 1) * gap;

        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';

        // Label
        const label = document.createElement('span');
        label.className = 'item-label';
        label.textContent = def.label;
        el.appendChild(label);

        // Image or placeholder
        const img = new Image();
        img.className = 'item-image';
        img.src = `img/${def.image}`;
        img.onerror = function () {
            this.style.display = 'none';
            const ph = document.createElement('div');
            ph.className = 'item-image-placeholder';
            ph.textContent = def.label;
            el.appendChild(ph);
        };
        el.appendChild(img);

        // Stack count
        if (def.stackable && (item.count || 1) > 0) {
            const count = document.createElement('span');
            count.className = 'item-count';
            count.textContent = `${item.count || 1}/${def.maxStack}`;
            el.appendChild(count);
        }

        // Remaining uses badge (multi-use items like splints)
        if (def.uses != null) {
            const uses = (item.metadata && item.metadata.uses != null)
                ? item.metadata.uses : def.uses;
            const usesEl = document.createElement('span');
            usesEl.className = 'item-uses';
            usesEl.textContent = `${uses}/${def.uses}`;
            el.appendChild(usesEl);
        }

        // Rotation indicator
        if (item.rotated) {
            const rot = document.createElement('span');
            rot.className = 'item-rotated-indicator';
            rot.textContent = 'R';
            el.appendChild(rot);
        }

        return el;
    }

    /**
     * Render all items
     */
    _renderAllItems() {
        // Remove old elements
        const oldItems = this.container.querySelectorAll('.grid-item');
        for (const el of oldItems) {
            el.parentNode.removeChild(el);
        }

        const frag = document.createDocumentFragment();
        for (let i = 0; i < this.items.length; i++) {
            const el = this._createItemElement(this.items[i], i);
            if (el) {
                this.items[i].el = el;
                frag.appendChild(el);
            }
        }
        this.container.appendChild(frag);
    }

    /**
     * Get computed cell size (reads CSS variable)
     */
    _getCellSize() {
        if (this._cachedCellSize) return this._cachedCellSize;
        const cs = getComputedStyle(document.documentElement).getPropertyValue('--cell-size');
        this._cachedCellSize = parseInt(cs) || 60;
        return this._cachedCellSize;
    }

    _getGap() {
        if (this._cachedGap !== undefined) return this._cachedGap;
        const cs = getComputedStyle(document.documentElement).getPropertyValue('--cell-gap');
        this._cachedGap = parseInt(cs) || 2;
        return this._cachedGap;
    }

    /**
     * Invalidate size cache (call on window resize)
     */
    invalidateSizeCache() {
        this._cachedCellSize = null;
        this._cachedGap = undefined;
    }

    /**
     * Convert pixel position (relative to container) to grid coordinates
     */
    pixelToGrid(px, py) {
        const cellSize = this._getCellSize();
        const gap = this._getGap();
        const step = cellSize + gap;
        return {
            x: Math.floor(px / step),
            y: Math.floor(py / step),
        };
    }

    /**
     * Convert grid coordinates to pixel position
     */
    gridToPixel(gx, gy) {
        const cellSize = this._getCellSize();
        const gap = this._getGap();
        return {
            x: gx * (cellSize + gap),
            y: gy * (cellSize + gap),
        };
    }

    /**
     * Get item at grid position
     */
    getItemAt(gx, gy) {
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return null;
        const occupant = this.occupied[gy * this.cols + gx];
        if (occupant === 0) return null;
        return { item: this.items[occupant - 1], index: occupant - 1 };
    }

    /**
     * Get item by index
     */
    getItem(index) {
        return this.items[index] || null;
    }

    /**
     * Remove item at index
     */
    removeItem(index) {
        const item = this.items[index];
        if (!item) return null;

        if (item.el && item.el.parentNode) {
            item.el.parentNode.removeChild(item.el);
        }
        this._clearOccupied(index);
        this.items.splice(index, 1);

        // Rebuild occupied since indices shifted
        this.rebuildOccupied();
        // Update dataset indices on remaining elements
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].el) {
                this.items[i].el.dataset.itemIndex = i;
            }
        }
        return item;
    }

    /**
     * Add an item to specific position
     */
    addItem(itemData, x, y, rotated) {
        const def = window.CNBT.itemDefs[itemData.name];
        if (!def) return false;

        const size = rotated ? { w: def.sizeY, h: def.sizeX } : { w: def.sizeX, h: def.sizeY };
        if (!this.canPlace(x, y, size.w, size.h)) return false;

        const newItem = {
            name: itemData.name,
            x: x,
            y: y,
            rotated: rotated || false,
            count: itemData.count || 1,
            metadata: itemData.metadata || {},
        };

        const idx = this.items.length;
        this.items.push(newItem);
        this._markOccupied(idx, x, y, size.w, size.h);

        const el = this._createItemElement(newItem, idx);
        if (el) {
            newItem.el = el;
            this.container.appendChild(el);
        }

        return true;
    }

    /**
     * Move item within grid
     */
    moveItem(index, newX, newY, newRotated) {
        const item = this.items[index];
        if (!item) return false;

        const size = this.getEffectiveSize(item.name, newRotated);
        if (!this.canPlace(newX, newY, size.w, size.h, index)) return false;

        this._clearOccupied(index);
        item.x = newX;
        item.y = newY;
        item.rotated = newRotated;
        this._markOccupied(index, newX, newY, size.w, size.h);

        this._repositionElement(item);
        return true;
    }

    /**
     * Update element position from item data
     */
    _repositionElement(item) {
        if (!item.el) return;
        const size = this.getEffectiveSize(item.name, item.rotated);
        const cellSize = this._getCellSize();
        const gap = this._getGap();

        item.el.style.left = (item.x * (cellSize + gap)) + 'px';
        item.el.style.top = (item.y * (cellSize + gap)) + 'px';
        item.el.style.width = (size.w * cellSize + (size.w - 1) * gap) + 'px';
        item.el.style.height = (size.h * cellSize + (size.h - 1) * gap) + 'px';

        // Update rotation indicator
        const rotIndicator = item.el.querySelector('.item-rotated-indicator');
        if (item.rotated && !rotIndicator) {
            const rot = document.createElement('span');
            rot.className = 'item-rotated-indicator';
            rot.textContent = 'R';
            item.el.appendChild(rot);
        } else if (!item.rotated && rotIndicator) {
            rotIndicator.remove();
        }
    }

    /**
     * Calculate total weight
     */
    getWeight() {
        let total = 0;
        for (const item of this.items) {
            const def = window.CNBT.itemDefs[item.name];
            if (def) total += def.weight * (item.count || 1);
        }
        return total;
    }

    /**
     * Highlight cells for placement preview
     * @param {number} gx - grid X
     * @param {number} gy - grid Y
     * @param {number} w - width
     * @param {number} h - height
     * @param {boolean} valid - green if true, red if false
     */
    highlightCells(gx, gy, w, h, valid) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const cx = gx + dx;
                const cy = gy + dy;
                if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) {
                    const cell = this.cells[cy * this.cols + cx];
                    if (cell) {
                        cell.classList.add(valid ? 'highlight-valid' : 'highlight-invalid');
                    }
                }
            }
        }
    }

    /**
     * Clear all cell highlights
     */
    clearHighlights() {
        for (const cell of this.cells) {
            cell.classList.remove('highlight-valid', 'highlight-invalid', 'highlight-hover');
        }
    }

    /**
     * Find first free position for an item
     */
    findFreePosition(w, h) {
        for (let y = 0; y <= this.rows - h; y++) {
            for (let x = 0; x <= this.cols - w; x++) {
                if (this.canPlace(x, y, w, h)) {
                    return { x, y, rotated: false };
                }
            }
        }
        // Try rotated
        if (w !== h) {
            for (let y = 0; y <= this.rows - w; y++) {
                for (let x = 0; x <= this.cols - h; x++) {
                    if (this.canPlace(x, y, h, w)) {
                        return { x, y, rotated: true };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Get serializable item data (without DOM elements)
     */
    serialize() {
        return this.items.map(item => ({
            name: item.name,
            x: item.x,
            y: item.y,
            rotated: item.rotated,
            count: item.count || 1,
            metadata: item.metadata || {},
        }));
    }

    /**
     * Destroy grid (cleanup)
     */
    destroy() {
        this.container.innerHTML = '';
        this.items = [];
        this.cells = [];
        this.occupied = new Uint16Array(0);
    }
}

// Export globally
window.InventoryGrid = InventoryGrid;
