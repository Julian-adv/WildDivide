import { values_for_key, setValueColor } from "./wild_prompt_common.js";

export function show_context_menu(node, select_elem) {
    const old_context_menu = node.context_menu;
    close_context_menu(node);
    if (old_context_menu !== select_elem.context_menu || !select_elem.context_menu) {
        if (!select_elem.context_menu) {
            create_context_menu(select_elem);
        }
        select_elem.context_menu.style.display = "block";
        node.context_menu = select_elem.context_menu;
        const [x, y] = calculate_context_menu_position(select_elem, select_elem.context_menu);
        select_elem.context_menu.style.left = `${x}px`;
        select_elem.context_menu.style.top = `${y}px`;
    }
}

export function close_context_menu(node) {
    if (node.context_menu) {
        node.context_menu.style.display = "none";
        node.context_menu = null;
    }
}

// Create context menu
function create_context_menu(select_elem) {
    const values = values_for_key(select_elem.closest('.widget-container').querySelector('label').textContent);
    const context_menu = document.createElement("div");
    Object.assign(context_menu.style, {
        display: "none",
        position: "fixed",
        backgroundColor: "var(--comfy-menu-bg)",
        minWidth: "100px",
        maxHeight: "70vh",
        overflowY: "auto",
        boxShadow: "0px 8px 16px 0px rgba(0,0,0,0.2)",
        zIndex: "100",
        padding: "2px",
        borderRadius: "4px",
        border: "1px solid var(--p-form-field-border-color)",
    });

    // Create menu items
    for (const v of values) {
        let option = document.createElement("a");
        option.href = "#";
        Object.assign(option.style, {
            backgroundColor: "var(--comfy-menu-bg)",
            display: "block",
            padding: "2px",
            color: "var(--fg-color)",
            textDecoration: "none",
            fontSize: "12px",
        });
        setValueColor(option, v);
        option.addEventListener('mouseover', () => {
            option.style.backgroundColor = "var(--p-form-field-hover-border-color)";
        });
        option.addEventListener('mouseout', () => {
            option.style.backgroundColor = "var(--comfy-menu-bg)";
        });
        option.addEventListener('click', () => {
            setValueColor(select_elem, v);
            context_menu.style.display = "none";
        });
        context_menu.append(option);
    }
    document.body.appendChild(context_menu);
    select_elem.context_menu = context_menu;
}

export function update_context_menu(node, widget_name) {
    if (!widget_name) {
        return;
    }
    const select_elem = node.widgets.find((widget) => widget.name === widget_name).select_elem;
    wildcards_dict = get_wildcards_dict();
    create_context_menu(select_elem);
}

function calculate_context_menu_position(element, context_menu) {
    const window_width = window.innerWidth;
    const window_height = window.innerHeight;
    const rect = element.getBoundingClientRect();
    const context_menu_width = context_menu.offsetWidth;
    const context_menu_height = context_menu.offsetHeight;
    const margin_x = 40;
    const margin_y = 44 + 16

    // Get the position of the text node within the span
    const text_node = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    let text_rect;
    if (text_node) {
        const range = document.createRange();
        range.selectNode(text_node);
        text_rect = range.getBoundingClientRect();
    } else {
        text_rect = element.getBoundingClientRect();
    }

    // Align the left of the text with x and place it below
    let nx = text_rect.left;
    let ny = rect.bottom;

    // Adjust if the context menu goes beyond the right boundary
    if (nx + context_menu_width > window_width - margin_x) {
        nx = window_width - context_menu_width - margin_x;
    }

    // Make sure the left has at least margin_x of space
    if (nx < margin_x) {
        nx = margin_x;
    }

    // If there is not enough space below, show it above
    if (ny + context_menu_height > window_height - margin_y) {
        ny = rect.top - context_menu_height;
    }

    // Make sure the top has at least margin_y of space
    if (ny < margin_y) {
        ny = margin_y;
    }

    return [nx, ny];
}