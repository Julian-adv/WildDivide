import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { get_tooltips_shown, set_tooltips_shown, show_last_generated, update_last_generated,
         set_tooltip_position_all, clear_tooltips } from "./wild_prompt_tooltip.js";
import { show_add_dialog, show_edit_dialog, show_group_dialog } from "./wild_prompt_dialog.js";
import { set_generator_node, refresh_wildcards, load_wildcards } from "./wild_prompt_common.js";

const wildcards_dict = await load_wildcards();

app.registerExtension({
    name: "Wild.Prompt.Generator",
    nodeCreated(node, app) {
        if (node.comfyClass == "WildPromptGenerator") {
            set_generator_node(node);
            node.start_index = 0;
            setup_node(node);
            api.addEventListener("status", (e) => {
                // Update when image is generated
                if (e.detail.exec_info.queue_remaining == 0) {
                    update_last_generated(node);
                }
            })
            const graph_canvas_container = document.querySelector("body > div.graph-canvas-container")
            graph_canvas_container.addEventListener("wheel", (e) => {
                scroll_widgets(e, node);
            });

            const onDrawForeground = node.onDrawForeground;
            node.onDrawForeground = (ctx) => {
                onDrawForeground?.apply(this, arguments);
                draw_scrollbar(ctx, node);
            };
        }
    },
    async refreshComboInNodes(defs) {
        console.log("Wild prompt generator refreshComboInNodes");
        await api.fetchApi("/wilddivide/refresh");
        await refresh_wildcards();
    },
});

// Draw scrollbar
function draw_scrollbar(ctx, node) {
    const theme = app.ui.settings.settingsValues['Comfy.ColorPalette'];
    // Set scrollbar color
    let scrollbar_bg = '#202020';
    let scrollbar_knob = '#505050';
    if (theme == 'light') {
        scrollbar_bg = '#dddddd';
        scrollbar_knob = '#bbbbbb';
    }

    ctx.save();

    // draw scrollbar
    ctx.fillStyle = scrollbar_bg;
    ctx.beginPath();
    const y = node.widgets[2].last_y + 12;
    const height = node.visible_height;
    ctx.rect(node.width - 15, y, 10, height);
    ctx.fill();

    // draw scroll knob
    // h : height = visible_height : total_height
    ctx.fillStyle = scrollbar_knob;
    ctx.beginPath();
    ctx.rect(node.width - 15, y + (node.start_y * height / node.total_height), 10,
        node.visible_height * height  / node.total_height);
    ctx.fill();

    ctx.restore();
}

let dialog = null;

function setValueColor(el, value) {
    el.textContent = value;
    if (value == 'disabled') {
        el.style.color = "var(--p-form-field-disabled-color)";
    } else if (value == 'random') {
        el.style.color = "var(--p-primary-color)";
    } else {
        el.style.color = "var(--fg-color)";
    }
}

function calculate_context_menu_position(x, y, element, context_menu) {
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

let fromKey = null;
let group_name = null;
let show_tooltips_checkbox = null;
let current_context_menu = null;

function close_context_menu() {
    if (current_context_menu) {
        current_context_menu.style.display = "none";
        current_context_menu = null;
    }
}

// Sets up the node with the wildcards.
function setup_node(node) {
    let filtered_keys = Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"));

    // Get current values
    let old_values = {};
    node.widgets.forEach((widget) => old_values[widget.name] = widget.value);

    // Remove widgets except first 2
    for (let i = 2; i < node.widgets.length; i++) {
        if (node.widgets[i].onRemove) {
            node.widgets[i].onRemove();
        }
    }
    node.widgets.splice(2);
    let [width, height] = node.size;
    group_name = null;
    for (const key of filtered_keys) {
        const slotName = key.substring(2); // Remove "m/" prefix
        const group_node = slotName.includes("/");
        const mapped_values = wildcards_dict[key].map((value) => value.includes("=>") ? value.split("=>")[1].trim() : value);
        const values = ["disabled", "random", ...mapped_values];
        const value = find_similar_value(old_values, values, slotName);
        if (group_node) {
            check_group_name(node, slotName, value, values, true);
        } else {
            add_combo_widget(node, slotName, value, values, true);
        }
    }
    add_buttons_widget(node);
    node.size[0] = width;
    setup_node_hidden(node);
}

const widget_height = 20;

// Set up widget's hidden state
function setup_node_hidden(node) {
    let y = 0;
    let start_y = 0;
    let end_y = 0;
    const max_height = document.documentElement.clientHeight - 250;
    let state = "before"
    for (let i = 0; i < node.widgets.length - 3; i++) {
        const widget = node.widgets[i + 2];
        if (state === "before") {
            if (i === node.start_index) {
                start_y = y;
                state = "show";
            }
        } else if (state === "show") {
            if (y - start_y > max_height) {
                end_y = y;
                state = "after";
            }
        }
        if (state === "show") {
            widget.type = widget.name.includes("/") ? "mygroup" : "mycombo";
        } else {
            widget.type = "hidden";
        }
        y += widget_height + 4;
    }
    if (state === "show") {
        end_y = y;
    }

    node.total_height = y;
    node.visible_height = end_y - start_y;
    node.start_y = start_y;
}

function find_similar_value(old_values, current_values, slotName) {
    let value = old_values[slotName];
    if (value == null || value == undefined) {
        return "random";
    } else if (current_values.includes(value)) {
        return value;
    } else {
        // Try similar value
        for (const similar_value of current_values) {
            if (similar_value.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(similar_value.toLowerCase())) {
                return similar_value;
            }
        }
        return "random";
    }
}

function check_group_name(node, widgetName, value, values, visible) {
    const [new_group_name, widget_name] = widgetName.split("/");
    if (new_group_name != group_name) {
        group_name = new_group_name;
        add_group_widget(node, group_name, visible);
    }
    add_combo_widget(node, widgetName, value, values, visible);
}

function add_combo_widget(node, widgetName, value, values, visible) {
    const container = create_draggable_container(widgetName, node);

    // Create combo
    const combo = document.createElement("div");
    Object.assign(combo.style, {
        display: "flex",
        flexDirection: "row",
        fontSize: "12px",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        border: "none",
        borderRadius: "8px",
        padding: "0px 8px",
        flex: "1 1 auto",
        width: "150px",
        backgroundColor: "var(--bg-color)",
    });

    // Create label
    const inputLabel = document.createElement("label");
    inputLabel.textContent = widgetName;
    Object.assign(inputLabel.style, {
        color: "var(--p-form-field-float-label-color)",
        flex: "0",
        cursor: "move",
    });
    combo.append(inputLabel);

    // Create select element
    const select_elem = document.createElement("span");
    Object.assign(select_elem.style, {
        width: "auto",
        minWidth: "48px",
        minHeight: "14px",
        fontSize: "12px",
        padding: "0px",
        margin: "0px",
        border: "none",
        outline: "none",
        backgroundColor: "var(--bg-color)",
        textAlignLast: "right",
        cursor: "pointer",
        overflow: "clip",
        textWrap: "nowrap",
        textOverflow: "ellipsis",
        color: "var(--fg-color)",
        flex: "1 1 0"
    });
    setValueColor(select_elem, value);
    combo.append(select_elem);
    container.append(combo);

    // Create context menu
    const contextMenu = document.createElement("div");
    Object.assign(contextMenu.style, {
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

    select_elem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (current_context_menu == contextMenu) {
            close_context_menu();
        } else {
            close_context_menu();
            contextMenu.style.display = "block";
            current_context_menu = contextMenu;
            const [x, y] = calculate_context_menu_position(e.clientX, e.clientY, select_elem, contextMenu);
            contextMenu.style.left = `${x}px`;
            contextMenu.style.top = `${y}px`;
        }
    });
    document.addEventListener('click', () => {
        close_context_menu();
        set_tooltip_position_all(node);
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
            contextMenu.style.display = "none";
            isMouseDown = false;
        });
        contextMenu.append(option);
    }
    document.body.appendChild(contextMenu);

    // Create edit button for the combo
    const button = document.createElement("button")
    Object.assign(button.style, {
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "2px 0px",
        width: "16px",
        height: "16px",
        color: "var(--p-form-field-float-label-color)",
    });
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /> </svg>';
    button.onclick = () => {
        show_edit_dialog(widgetName);
    };
    container.append(button);

    // Create widget
    const widget = node.addDOMWidget(widgetName, visible ? 'mycombo' : 'hidden', container, {
        getValue() {
            return select_elem.textContent;
        },
        setValue(v) {
            setValueColor(select_elem, v);
        },
        onDraw(w) {
            Object.assign(w.element.style, {
                display: "flex",
                height: w.type === "hidden" ? "0px" : "22px",
            });
        }
    });
    widget.computeSize = () => [0, widget.type === "hidden" ? -4 : widget_height];
    widget.container = container;
    widget.select_elem = select_elem;
    widget.onRemove = () => {
        container.remove();
        if (widget.tooltip) {
            widget.tooltip.remove();
        }
    };
}

function add_group_widget(node, widgetName, visible) {
    // Container
    const container = create_draggable_container(widgetName, node);

    // Label
    const label = document.createElement("label");
    Object.assign(label.style, {
        fontSize: "14px",
        flex: "1 1 auto",
        width: "150px",
        alignSelf: "center",
    });
    label.textContent = widgetName;
    
    // Settings button
    const button = document.createElement("button");
    Object.assign(button.style, {
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "2px 0px",
        width: "16px",
        height: "16px",
        color: "var(--p-form-field-float-label-color)",
    });
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /> </svg>';
    button.onclick = () => {
        show_edit_dialog(widgetName);
    };
    container.append(label, button);

    const widget = node.addDOMWidget(widgetName, visible ? 'mygroup' : 'hidden', container, {
        getValue() {
            return 'disabled';
        },
        setValue(v) {
        },
        onDraw(w) {
            Object.assign(w.element.style, {
                display: "flex",
                height: w.type === "hidden" ? "0px" : "22px",
            });
        }
    });
    widget.computeSize = () => [0, widget.type === "hidden" ? -4 : widget_height];
    widget.container = container;
    widget.onRemove = () => {
        container.remove();
    };
    group_name = widgetName;
}

function add_buttons_widget(node) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: "5px 10px",
        border: "none",
        marginTop: "10px",
    });

    const buttons = [
        {
            text: "Show random selections",
            onClick: () => {
                show_tooltips_checkbox.checked = !show_tooltips_checkbox.checked;
                show_last_generated(node, show_tooltips_checkbox.checked);
            },
            onInit: (button) => {
                // Style button as flex container
                Object.assign(button.style, {
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    paddingBottom: "0",
                });
                
                // Create checkbox
                show_tooltips_checkbox = document.createElement("input");
                show_tooltips_checkbox.type = "checkbox";
                show_tooltips_checkbox.checked = get_tooltips_shown();
                Object.assign(show_tooltips_checkbox.style, {
                    margin: "0",
                    cursor: "pointer",
                });
                
                // Prevent checkbox from triggering button click
                show_tooltips_checkbox.addEventListener("click", (e) => {
                    e.stopPropagation();
                    show_last_generated(node, show_tooltips_checkbox.checked);
                });
                
                // Add checkbox to button
                button.prepend(show_tooltips_checkbox);
            }
        },
        {
            text: "📥 Get last random values",
            onClick: () => set_last_generated(node)
        },
        {
            text: "🔄 All random",
            onClick: () => set_all_random(node)
        },
        {
            text: "🎰 Add slot",
            onClick: () => show_add_dialog(group_name)
        },
        {
            text: "📁 Add group",
            onClick: () => show_group_dialog()
        }
    ];

    buttons.forEach(({text, onClick, onInit}) => {
        const button = document.createElement("button");
        Object.assign(button.style, {
            border: "2px solid var(--border-color)",
            borderRadius: "8px",
            fontSize: "12px",
            backgroundColor: "transparent",
            paddingBottom: "2px",
        });
        button.textContent = text;
        button.onclick = (e) => {
            e.stopPropagation(); 
            onClick();
        };
        if (onInit) {
            onInit(button);
        }
        container.append(button);
    });

    const widget = node.addDOMWidget("buttons", "buttons", container, {
        getHeight() {
            return 78;
        },
        onDraw(w) {
            Object.assign(w.element.style, {
                display: "flex",
                height: "48px",
            });
        }
    });
    widget.container = container;
    widget.onRemove = () => {
        container.remove();
    };
    node.buttons_widget = widget;
}

// Sets the last generated values to the widgets.
async function set_last_generated(node) {
    let res = await api.fetchApi("/wilddivide/last_generated");
    let data = await res.json();
    let last_generated = data.data;
    for (const widget of node.widgets.slice(2)) {
        if (widget.name in last_generated) {
            widget.value = last_generated[widget.name];
        }
    }
    clear_tooltips(node);
}

// Sets all widgets to random.
function set_all_random(node) {
    for (const widget of node.widgets.slice(2)) {
        widget.value = "random";
    }
}

function create_draggable_container(widgetName, node) {
    // Create widget container
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "row",
        gap: "2px",
        border: "none",
        cursor: "move",
        userSelect: "none",
        paddingRight: "10px",
    });
    container.draggable = true;
    container.addEventListener("dragstart", (e) => {
        e.target.style.opacity = "0.4";
        fromKey = widgetName;
    });
    container.addEventListener("dragend", (e) => {
        e.target.style.opacity = "1";
    });
    container.addEventListener("dragover", (e) => {
        e.preventDefault();
    });
    container.addEventListener("drop", async (e) => {
        e.preventDefault();
        const toKey = e.target.tagName === "LABEL" ? e.target.textContent : e.target.closest('.widget-container').querySelector('label').textContent;
        const from_group = remove_last_key(fromKey);
        const to_group = remove_last_key(toKey);
        if (from_group !== to_group) {
            await copy_slot(fromKey, toKey);
            return;
        }
        await api.fetchApi("/wilddivide/reorder_slot", {
            method: "POST",
            body: JSON.stringify({
                from: fromKey,
                to: toKey,
            }),
        });
        await refresh_wildcards();
        fromKey = null;
    });
    container.classList.add('widget-container');
    container.addEventListener("wheel", (e) => {
        scroll_widgets(e, node);
    });
    return container;
}

function scroll_widgets(e, node) {
    e.stopPropagation();
    if (e.deltaY > 0) {
        node.start_index += 1;
    } else {
        if (node.start_index > 0) {
            node.start_index -= 1;
        }
    }
    close_context_menu();
    setup_node_hidden(node);
    app.graph.setDirtyCanvas(true, true);
    update_last_generated(node);
}

function remove_last_key(key) {
    return key.split('/').slice(0, -1).join('/');
}

// copy slot from one group to another
async function copy_slot(fromKey, toKey) {
    const [from_group, from_key] = split_group_key(fromKey);
    const [to_group, to_key] = split_group_key(toKey);
    const name = join_group_key(to_group, from_key);
    const values = get_values_string(fromKey);
    
    // key exists?
    if (wildcards_dict[`m/${name}`]) {
        return;
    }

    await api.fetchApi("/wilddivide/add_slot", {
        method: "POST",
        body: JSON.stringify({ name, values }),
    });
    await refresh_wildcards();
}

function get_values_string(key) {
    return '- ' + wildcards_dict[`m/${key}`].join("\n- ");
}

function split_group_key(key) {
    if (key.includes('/')) {
        return key.split('/');
    }
    return ["", key];
}
