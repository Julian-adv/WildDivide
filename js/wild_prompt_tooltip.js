import { api } from "../../scripts/api.js";

let tooltips_shown = true;

export function get_tooltips_shown() {
    return tooltips_shown;
}

export function set_tooltips_shown(value) {
    tooltips_shown = value;
}

// Show last generated
export async function show_last_generated(node, shown) {
    tooltips_shown = shown;
    if (!tooltips_shown) {
        clear_tooltips(node);
        return;
    }

    let res = await api.fetchApi("/wilddivide/last_generated");
    let data = await res.json();

    create_tooltips(node, data.data);
}

export async function update_last_generated(node) {
    if (!tooltips_shown) {
        return;
    }
    
    let res = await api.fetchApi("/wilddivide/last_generated");
    let data = await res.json();

    create_tooltips(node, data.data);
}

function create_tooltips(node, last_generated) {
    for (const widget of node.widgets.slice(2)) {
        if (widget.type !== "hidden" && widget.name in last_generated) {
            if (!widget.tooltip) {
                widget.tooltip = create_tooltip(widget);
            } else {
                widget.tooltip.style.maxWidth = `${widget.select_elem.offsetWidth}px`;
            }
            widget.tooltip.querySelector('span').textContent = last_generated[widget.name].replace(/\n/g, ' ');
            set_tooltip_color(widget);
            set_tooltip_position(widget);
        } else {
            if (widget.tooltip) {
                widget.tooltip.style.display = "none";
            }
        }
    }
}

function create_tooltip(widget) {
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
        display: flex;
        align-items: center;
        position: absolute;
        background-color: var(--bg-color);
        max-width: ${widget.select_elem.offsetWidth}px;
        min-width: 40px;
        height: 22px;
        box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
        z-index: 90;
        padding: 2px 5px;
        top: 0;
        left: 0;
        font-size: 12px;
        border: 1px solid var(--p-surface-500);
        border-radius: 4px;
        color: var(--fg-color);
        text-align: right;
    `;

    // Hide tooltip when clicked
    tooltip.onclick = (e) => {
        e.stopPropagation();
        tooltip.style.display = "none";
        widget.select_elem.click();
    };
    // Show full tooltip when hovered
    tooltip.onmouseover = (e) => {
        e.stopPropagation();
        tooltip.style.maxWidth = '70vw';
    }
    tooltip.onmouseleave = (e) => {
        e.stopPropagation();
        tooltip.style.maxWidth = `${widget.select_elem.offsetWidth}px`;
    }
    const text = document.createElement("span");
    text.style.cssText = `
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        cursor: pointer;
    `;
    tooltip.append(text);
    // tooltip.addEventListener("wheel", (e) => {
    //     scroll_widgets(e, generator_node)
    // })
    document.body.append(tooltip);
    return tooltip;
}

export function set_tooltip_position_all(node) {
    for (const widget of node.widgets.slice(2)) {
        if (widget.tooltip && widget.tooltip.style.display !== "none") {
            set_tooltip_position(widget);
        }
    }
}

function set_tooltip_color(widget) {
    if (widget.value === "random") {
        widget.tooltip.style.color = "var(--p-primary-color)";
    } else {
        widget.tooltip.style.color = "var(--fg-color)";
    }
}

function set_tooltip_position(widget) {
    widget.tooltip.style.display = "flex";
    const [x, y] = calc_tooltip_position(widget.select_elem, widget.tooltip);
    widget.tooltip.style.left = `${x}px`;
    widget.tooltip.style.top = `${y-4}px`;
}

export function clear_tooltips(node) {
    for (const widget of node.widgets.slice(2)) {
        if (widget.tooltip) {
            widget.tooltip.style.display = "none";
        }
    }
}

function calc_tooltip_position(el, tooltip) {
    const rect = el.getBoundingClientRect();
    const x = rect.right - tooltip.offsetWidth;
    const y = rect.top;
    return [x, y];
}
