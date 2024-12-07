import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let wildcards_dict = {};

async function load_wildcards() {
    let res = await api.fetchApi("/wilddivide/wildcards/dict");
    let data = await res.json();
    wildcards_dict = data.data;
}

load_wildcards();

let generator_node = null;

app.registerExtension({
    name: "Wild.Prompt.Generator",
    nodeCreated(node, app) {
        if (node.comfyClass == "WildPromptGenerator") {
            generator_node = node;
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
    const height = node.buttons_widget.last_y + 8 - y;
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

// Called when the refresh button is clicked.
export async function refresh_wildcards() {
    await load_wildcards();
    if (generator_node) {
        setup_node(generator_node);
        console.log("Wild prompt generator refreshed");
        app.graph.setDirtyCanvas(true);
        setTimeout(() => {
            update_last_generated(generator_node);
        }, 10);
    }
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
    const range = document.createRange();
    range.selectNode(text_node);
    const text_rect = range.getBoundingClientRect();

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

function calc_tooltip_position(el, tooltip) {
    const rect = el.getBoundingClientRect();
    const x = rect.right - tooltip.offsetWidth;
    const y = rect.top;
    return [x, y];
}

let fromKey = null;
let group_name = null;
let tooltips_shown = true;
let show_tooltips_checkbox = null;
let current_context_menu = null;

function set_tooltips_shown(value) {
    tooltips_shown = value;
    if (show_tooltips_checkbox) {
        show_tooltips_checkbox.checked = value;
    }
}

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
        const mapped_values = wildcards_dict[key].map((value) => value.includes("=>") ? value.split("=>")[1] : value);
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
                show_last_generated(node);
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
                show_tooltips_checkbox.checked = tooltips_shown;
                Object.assign(show_tooltips_checkbox.style, {
                    margin: "0",
                    cursor: "pointer",
                });
                
                // Prevent checkbox from triggering button click
                show_tooltips_checkbox.addEventListener("click", (e) => {
                    e.stopPropagation();
                    tooltips_shown = show_tooltips_checkbox.checked;
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
            onClick: () => show_add_dialog()
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

// Show last generated
async function show_last_generated(node) {
    if (tooltips_shown) {
        clear_tooltips(node);
        set_tooltips_shown(false);
        return;
    }

    set_tooltips_shown(true);
    let res = await api.fetchApi("/wilddivide/last_generated");
    let data = await res.json();

    create_tooltips(node, data.data);
}

async function update_last_generated(node) {
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
    };
    const text = document.createElement("span");
    text.style.cssText = `
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        cursor: pointer;
    `;
    tooltip.append(text);
    tooltip.addEventListener("wheel", (e) => {
        scroll_widgets(e, generator_node)
    })
    document.body.append(tooltip);
    return tooltip;
}

function set_tooltip_position_all(node) {
    for (const widget of node.widgets.slice(2)) {
        if (widget.tooltip && widget.tooltip.style.display !== "none") {
            set_tooltip_position(widget);
        }
    }
}

function set_tooltip_position(widget) {
    widget.tooltip.style.display = "flex";
    const [x, y] = calc_tooltip_position(widget.select_elem, widget.tooltip);
    widget.tooltip.style.left = `${x}px`;
    widget.tooltip.style.top = `${y-4}px`;
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

function clear_tooltips(node) {
    for (const widget of node.widgets.slice(2)) {
        if (widget.tooltip) {
            widget.tooltip.style.display = "none";
        }
    }
}

// Sets all widgets to random.
function set_all_random(node) {
    for (const widget of node.widgets.slice(2)) {
        widget.value = "random";
    }
}

let addDialog = null;
let editDialog = null;
let groupDialog = null;

const DialogType = {
    ADD: 0,
    EDIT: 1,
    GROUP: 2
}

function show_add_dialog() {
    if (!addDialog) {
        addDialog = setup_dialog(DialogType.ADD);
    }
    show_dialog(addDialog, "Add Slot", group_name, "");
}

function show_edit_dialog(widgetName) {
    if (!editDialog) {
        editDialog = setup_dialog(DialogType.EDIT);
    }
    let groupName = "";
    if (widgetName.includes("/")) {
        [groupName, widgetName] = widgetName.split("/");
    }

    show_dialog(editDialog, "Edit Slot", groupName, widgetName);
}

function show_group_dialog() {
    if (!groupDialog) {
        groupDialog = setup_dialog(DialogType.GROUP);
    }
    show_dialog(groupDialog, "Add Group", "", "");
}

function setup_dialog(dialogType) {
    const dialog = setup_common_dialog(dialogType, "Save", async function (dialog) {
        let values = "- " + dialog.valueElements.map((element, index) => {
            const condition = dialog.conditionElements[index].value || "";
            const value = element.value || "";
            return condition ? `${condition} => ${value}` : value;
        }).join("\n- ");
        const key = key_from_dialog(dialog);
        // check if key exists
        if (key == "") {
            alert_message(dialog, "Key cannot be empty");
        } else if (wildcards_dict[`m/${key}`] && dialog.type !== DialogType.EDIT) {
            alert_message(dialog, "Key already exists");
        } else {
            await save_slot(key, values);
            dialog.close();
            setTimeout(() => {
                update_last_generated(generator_node);
            }, 10);
        }
    });
    return dialog;
}

function setup_common_dialog(dialogType, okLabel, okCallback) {
    const dialog = new app.ui.dialog.constructor();
    dialog.type = dialogType;

    dialog.element.classList.add("comfy-settings");
    Object.assign(dialog.element.style, {
        flexDirection: "column",
        padding: "10px",
    });

    // Remove old close button
    const oldCloseButton = dialog.element.querySelector("button");
    oldCloseButton.remove();

    // Close button
    const closeButton = document.createElement("button");
    Object.assign(closeButton.style, {
        fontSize: "16px",
        padding: "0px",
        border: "none",
        backgroundColor: "transparent",
        margin: "0px",
        width: "fit-content",
        position: "absolute",
        right: "8px",
        top: "2px",
    });
    closeButton.textContent = "✖";
    closeButton.onclick = function () {
        dialog.close();
    };
    dialog.element.prepend(closeButton);

    // Alert container
    const alertContainer = document.createElement("div");
    Object.assign(alertContainer.style, {
        display: "flex",
        width: "100%",
        height: "35px",
    });
    dialog.alertMessage = document.createElement("p");
    dialog.alertMessage.style.cssText = `
        font-size: 14px;
        color: var(--error-color);
        width: 100%;
        height: 35px;
        text-align: center;
        margin: 0;
    `;
    dialog.alertMessage.textContent = "";
    alertContainer.append(dialog.alertMessage);
    dialog.element.append(alertContainer);

    // Button container
    const buttonContainer = document.createElement("div");
    Object.assign(buttonContainer.style, {
        display: "flex",
        justifyContent: "space-evenly",
    });
    dialog.element.append(buttonContainer);

    // OK button
    const okButton = document.createElement("button");
    Object.assign(okButton.style, {
        fontSize: "16px",
        backgroundColor: "var(--primary-bg)",
        border: "1px solid var(--p-form-field-border-color)",
        paddingBottom: "2px",
    });
    okButton.textContent = okLabel;
    okButton.onclick = () => okCallback(dialog);
    buttonContainer.append(okButton);

    // Cancel button
    const cancelButton = document.createElement("button");
    Object.assign(cancelButton.style, {
        fontSize: "16px",
        border: "1px solid var(--p-form-field-border-color)",
        paddingBottom: "2px",
    });
    cancelButton.textContent = "Cancel";
    cancelButton.onclick = function () {
        dialog.close();
    };
    buttonContainer.append(cancelButton);

    return dialog;
}

function show_dialog(dialog, title, groupName, widgetName) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "grid",
        gridTemplateColumns: "auto 1fr 2fr auto",
        alignItems: "baseline",
        gap: "0px 2px",
        marginTop: "10px",
        maxHeight: "60vh",
        overflowY: "auto",
        paddingRight: "10px"
    });

    // Group label
    const groupLabel = document.createElement("label");
    Object.assign(groupLabel.style, {
        textAlign: "right",
    });
    groupLabel.textContent = "Group";

    dialog.groupElement = document.createElement("input");
    Object.assign(dialog.groupElement.style, {
        width: "300px",
        margin: "0",
        padding: "3px 5px",
        border: "1px solid var(--p-form-field-border-color)",
        gridColumn: "2 / span 2"
    });
    dialog.groupElement.value = groupName || "";
    dialog.groupElement.disabled = (dialog.type === DialogType.EDIT);

    container.append(groupLabel, dialog.groupElement, document.createElement("span"));

    // Slot label
    const slotLabel = document.createElement("label");
    Object.assign(slotLabel.style, {
        textAlign: "right",
    });
    slotLabel.textContent = "Slot";

    dialog.slotElement = document.createElement("input");
    Object.assign(dialog.slotElement.style, {
        width: "300px",
        margin: "0",
        padding: "3px 5px",
        border: "1px solid var(--p-form-field-border-color)",
        gridColumn: "2 / span 2"
    });
    dialog.slotElement.disabled = (dialog.type === DialogType.EDIT);
    if (dialog.type === DialogType.EDIT) {
        dialog.slotElement.value = widgetName;
    } else {
        dialog.slotElement.value = "";
    }
    
    prevent_invalid_input(dialog.groupElement);
    prevent_invalid_input(dialog.slotElement);
    
    // Delete button
    let deleteSlotButton = null;
    if (dialog.type === DialogType.EDIT) {
        deleteSlotButton = document.createElement("button");
        Object.assign(deleteSlotButton.style, {
            fontSize: "14px",
            backgroundColor: "transparent",
            padding: "0px",
            border: "none",
            cursor: "pointer",
            width: "16px",
            height: "16px",
            color: "var(--p-form-field-float-label-color)",
        });
        deleteSlotButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /> </svg>';
        deleteSlotButton.onclick = async function() {
            await delete_slot(key_from_dialog(dialog));
            dialog.close();
        };
    } else {
        deleteSlotButton = document.createElement("span");
    }
    container.append(slotLabel, dialog.slotElement, deleteSlotButton);

    dialog.valueElements = [];
    dialog.conditionElements = [];
    const marker = document.createElement("span");
    const addButton = document.createElement("button");
    Object.assign(addButton.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
        gridColumn: "2 / span 2",
    });
    addButton.textContent = "Add new value (shift+⏎)";
    addButton.onclick = function () {
        const valueElement = add_new_value(dialog, "-", "", "", marker);
        valueElement.focus();
    };
    container.append(marker, addButton);

    const values = widgetName == "" ? [["", ""]] : get_values_array(groupName, widgetName);

    add_column_header(dialog, marker);
    values.forEach(([condition, value]) => {
        add_new_value(dialog, "-", condition, value, marker);
    });

    dialog.show(title);
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
        marginBottom: "10px",
    });
    dialog.textElement.append(container);
    if (dialog.type === DialogType.EDIT) {
        dialog.valueElements[dialog.valueElements.length - 1].focus();
    } else if (dialog.type === DialogType.GROUP) {
        dialog.groupElement.focus();
    } else {
        dialog.slotElement.focus();
    }
}

function alert_message(dialog, message) {
    dialog.alertMessage.textContent = message;
    setTimeout(() => {
        dialog.alertMessage.textContent = "";
    }, 4000);
}

function key_from_dialog(dialog) {
    if (dialog.slotElement.value == "") {
        return "";
    }
    return dialog.groupElement.value ?
        `${dialog.groupElement.value}/${dialog.slotElement.value}` :
        dialog.slotElement.value;
}

function prevent_invalid_input(element) {
    element.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
    });
}

async function save_slot(name, values) {
    await api.fetchApi("/wilddivide/add_slot", {
        method: "POST",
        body: JSON.stringify({ name, values }),
    });
    await refresh_wildcards();
}

async function delete_slot(name) {
    if (window.confirm("Are you sure you want to delete this slot?")) {
        await api.fetchApi("/wilddivide/delete_slot", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        await refresh_wildcards();
    }
}

function add_column_header(dialog, marker) {
    const dummy = document.createElement("span");
    marker.before(dummy);

    const condition_element = document.createElement("label");
    Object.assign(condition_element.style, {
        paddingTop: "5px",
    })
    condition_element.textContent = "Condition";
    marker.before(condition_element);

    const value_element = document.createElement("label");
    value_element.textContent = "Value";
    marker.before(value_element);

    const dummy2 = document.createElement("span");
    marker.before(dummy2);
}

function add_new_value(dialog, label, condition, value, marker) {
    const labelElement = document.createElement("label");
    Object.assign(labelElement.style, {
        textAlign: "right",
        cursor: "move",
    });
    labelElement.textContent = label;
    labelElement.draggable = true;

    const condition_element = document.createElement("textarea");
    condition_element.classList.add("comfy-multiline-input");
    Object.assign(condition_element.style, {
        width: "150px",
        height: "3ex",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    })
    condition_element.value = condition;

    const valueElement = document.createElement("textarea");
    valueElement.classList.add("comfy-multiline-input");
    Object.assign(valueElement.style, {
        width: "300px",
        height: "3ex",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    });
    valueElement.value = value;

    // Setup drag and drop
    labelElement.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", dialog.valueElements.indexOf(valueElement));
    });
    labelElement.addEventListener("dragover", (e) => {
        e.preventDefault();
    });
    labelElement.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData("text/plain"));
        const targetIndex = dialog.valueElements.indexOf(valueElement);
        if (draggedIndex !== targetIndex) {
            const draggedValueElement = dialog.valueElements[draggedIndex];
            const draggedConditionElement = draggedValueElement.previousElementSibling;
            const draggedLabelElement = draggedConditionElement.previousElementSibling;
            const draggedDeleteButton = draggedValueElement.nextElementSibling;
            
            // Update array order
            dialog.valueElements.splice(draggedIndex, 1);
            dialog.valueElements.splice(targetIndex, 0, draggedValueElement);
            dialog.conditionElements.splice(draggedIndex, 1);
            dialog.conditionElements.splice(targetIndex, 0, draggedConditionElement);
            
            // Move DOM elements
            if (targetIndex > draggedIndex) {
                valueElement.nextElementSibling.after(draggedDeleteButton);
                valueElement.nextElementSibling.after(draggedValueElement);
                valueElement.nextElementSibling.after(draggedConditionElement);
                valueElement.nextElementSibling.after(draggedLabelElement);
            } else {
                labelElement.before(draggedLabelElement);
                draggedLabelElement.after(draggedConditionElement)
                draggedConditionElement.after(draggedValueElement);
                draggedValueElement.after(draggedDeleteButton);
            }
        }
    });
    
    // Shift+Enter to add new value
    valueElement.addEventListener("keydown", function(e) {
        if (e.shiftKey && e.key === "Enter") {
            e.preventDefault();
            const valueElement = add_new_value(dialog, "-", "", "", marker);
            valueElement.focus();
        }
    });
    
    dialog.valueElements.push(valueElement);
    dialog.conditionElements.push(condition_element);

    condition_element.addEventListener("input", () => { adjust_textarea_height(condition_element); });
    valueElement.addEventListener("input", () => { adjust_textarea_height(valueElement); });
    setTimeout(() => {
        adjust_textarea_height(valueElement);
        adjust_textarea_height(condition_element);
    }, 0);

    const deleteButton = document.createElement("button");
    Object.assign(deleteButton.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
        padding: "0px",
        border: "none",
        cursor: "pointer",
        width: "16px",
        height: "16px",
        color: "var(--p-form-field-float-label-color)",
    });
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /> </svg>';
    deleteButton.onclick = function() {
        dialog.valueElements.splice(dialog.valueElements.indexOf(valueElement), 1);
        dialog.conditionElements.splice(dialog.conditionElements.indexOf(condition_element), 1);
        labelElement.remove();
        condition_element.remove();
        valueElement.remove();
        deleteButton.remove();
    }
    marker.before(labelElement, condition_element, valueElement, deleteButton);
    return valueElement;
}

function adjust_textarea_height(textarea) {
    textarea.style.height = "auto";
    
    // Create temporary span to calculate text width
    const span = document.createElement('span');
    span.style.cssText = `
        position: absolute; 
        visibility: hidden;
        white-space: pre;
        font-family: ${getComputedStyle(textarea).fontFamily};
        font-size: ${getComputedStyle(textarea).fontSize};
        padding: ${getComputedStyle(textarea).padding};
    `;
    span.textContent = textarea.value;
    document.body.appendChild(span);
    
    const textWidth = span.offsetWidth;
    document.body.removeChild(span);
    
    // Actual textarea width (excluding padding)
    const textareaWidth = textarea.clientWidth - 
        (parseInt(getComputedStyle(textarea).paddingLeft) + 
         parseInt(getComputedStyle(textarea).paddingRight));
    
    if (textarea.value.includes("\n") || textWidth > textareaWidth) {
        textarea.style.height = textarea.scrollHeight + "px";
    } else {
        textarea.style.height = "3ex";
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

function get_values_array(group, key) {
    const values = wildcards_dict['m/' + join_group_key(group, key)];
    return values.map(str => {
        const match = str.match(/^(.*?)\s*=>\s*(.*)$/);
        return match ? [match[1], match[2]] : ["", str];
    });
}

function split_group_key(key) {
    if (key.includes('/')) {
        return key.split('/');
    }
    return ["", key];
}

function join_group_key(group, key) {
    return group == "" ? key : `${group}/${key}`;
}
