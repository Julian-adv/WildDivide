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
            setup_node(node);
        }
    },
    async refreshComboInNodes(defs) {
        console.log("Wild prompt generator refreshComboInNodes");
        api.fetchApi("/wilddivide/refresh").then(() => {
            refresh_wildcards();
        });
    }
});

// Called when the refresh button is clicked.
export async function refresh_wildcards() {
    await load_wildcards();
    if (generator_node) {
        setup_node(generator_node);
        console.log("Wild prompt generator refreshed");
    }
}

let dialog = null;

function setValueColor(el, value) {
    el.textContent = value;
    if (value == 'disabled') {
        el.style.color = "var(--p-form-field-disabled-color)";
    } else if (value == 'random') {
        el.style.color = "var(--p-blue-400)";
    } else {
        el.style.color = "var(--p-surface-0)";
    }
}

function calculateContextMenuPosition(x, y, element, contextMenu) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const rect = element.getBoundingClientRect();
    let nx = rect.right - contextMenu.offsetWidth;
    let ny = rect.bottom;
    const contextMenuWidth = contextMenu.offsetWidth;
    const contextMenuHeight = contextMenu.offsetHeight;
    if (contextMenuWidth > windowWidth - 50) {
        nx = 50;
    } else if (nx + contextMenuWidth > windowWidth - 50) {
        nx = windowWidth - contextMenuWidth - 50;
    }
    if (nx < 50) {
        nx = x;
    }
    if (ny + contextMenuHeight > windowHeight - 50) {
        ny = rect.top - contextMenuHeight;
    }
    return [nx, ny];
}

let fromKey = null;

// Sets up the node with the wildcards.
function setup_node(node) {
    let copied_keys = Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"));

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
    
    for (const key of copied_keys) {
        let widgetName = key.substring(2); // Remove "m/" prefix
        let values = ["disabled", "random", ...wildcards_dict[key]];
        // Preserve old value
        let value = old_values[widgetName];
        if (value == null || value == undefined) {
            value = "random";
        } else if (!values.includes(value)) {
            // Try similar value
            let found = false;
            for (const similar_value of wildcards_dict[key]) {
                if (similar_value.toLowerCase().includes(value.toLowerCase()) ||
                    value.toLowerCase().includes(similar_value.toLowerCase())) {
                    value = similar_value;
                    found = true;
                    break;
                }
            }
            if (!found) {
                value = "random";
            }
        }

        // Create widget container
        const container = document.createElement("div");
        Object.assign(container.style, {
            display: "flex",
            flexDirection: "row",
            gap: "2px",
            border: "none",
            cursor: "grab",
            userSelect: "none",
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
            console.log("reorder", fromKey, toKey);
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
            backgroundColor: "var(--p-surface-800)",
        });

        // Create label
        const inputLabel = document.createElement("label");
        inputLabel.textContent = widgetName;
        Object.assign(inputLabel.style, {
            color: "var(--p-form-field-float-label-color)",
            flex: "0",
            cursor: "grab",
        });
        combo.append(inputLabel);

        // Create select element
        const selectEl = document.createElement("span");
        Object.assign(selectEl.style, {
            width: "auto",
            minWidth: "48px",
            minHeight: "14px",
            fontSize: "12px",
            padding: "0px",
            margin: "0px",
            border: "none",
            outline: "none",
            backgroundColor: "var(--p-surface-800)",
            textAlignLast: "right",
            cursor: "pointer",
            overflow: "clip",
            textWrap: "nowrap",
            textOverflow: "ellipsis",
            color: "var(--p-surface-0)",
            flex: "1 1 0"
        });
        setValueColor(selectEl, value);
        combo.append(selectEl);
        container.append(combo);

        // Create context menu
        const contextMenu = document.createElement("div");
        Object.assign(contextMenu.style, {
            display: "none",
            position: "absolute",
            backgroundColor: "var(--p-form-field-background)",
            minWidth: "100px",
            boxShadow: "0px 8px 16px 0px rgba(0,0,0,0.2)",
            zIndex: "100",
            padding: "2px",
        });

        let isMouseDown = false;
        selectEl.addEventListener('click', (e) => {
            isMouseDown = true;
            contextMenu.style.display = "block";
            const [x, y] = calculateContextMenuPosition(e.clientX, e.clientY, selectEl, contextMenu);
            contextMenu.style.left = `${x}px`;
            contextMenu.style.top = `${y}px`;
        });
        document.addEventListener('click', (e) => {
            if (!isMouseDown) {
                contextMenu.style.display = "none";
            }
            isMouseDown = false
        });

        // Create menu items
        for (const v of values) {
            let option = document.createElement("a");
            option.href = "#";
            Object.assign(option.style, {
                backgroundColor: "var(--p-form-field-background)",
                display: "block",
                padding: "2px",
                color: "var(--p-surface-0)",
                textDecoration: "none",
                fontSize: "12px",
            });
            setValueColor(option, v);
            option.addEventListener('mouseover', () => {
                option.style.backgroundColor = "var(--p-form-field-hover-border-color)";
            });
            option.addEventListener('mouseout', () => {
                option.style.backgroundColor = "var(--p-form-field-background)";
            });
            option.addEventListener('click', () => {
                setValueColor(selectEl, v);
                contextMenu.style.display = "none";
                isMouseDown = false;
            });
            contextMenu.append(option);
        }
        document.body.appendChild(contextMenu);

        // Create settings button for the combo
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
            setup_and_show_edit_dialog(widgetName);
        };
        container.append(button);

        // Create widget
        const widget = node.addDOMWidget(widgetName, 'mycombo', container, {
            getValue() {
                return selectEl.textContent;
            },
            setValue(v) {
                setValueColor(selectEl, v);
            },
            getHeight() {
                return 24;
            },
            onDraw(w) {
                // These are needed to be here
                Object.assign(w.element.style, {
                    display: "flex",
                    height: "22px",
                });
            }
        });
        widget.container = container;
        widget.onRemove = () => {
            container.remove();
        };
    }

    // To prevent widgets overlapping
    node.addDOMWidget("space", 'space', document.createElement("div"), {
        getHeight() {
            return 25;
        },
        onDraw(w) {
            Object.assign(w.element.style, {
                display: "flex",
                height: "22px",
            });
        }
    });

    node.addWidget("button", "Get last generated", null, () => {
        setLastGenerated(node);
    });
    node.addWidget("button", "All random", null, () => {
        setAllRandom(node);
    });
    node.addWidget("button", "➕ Add slot", null, () => {
        setup_and_show_add_dialog();
    });
    node.size[0] = width;
}

// Sets the last generated values to the widgets.
async function setLastGenerated(node) {
    let res = await api.fetchApi("/wilddivide/last_generated");
    let data = await res.json();
    let last_generated = data.data;
    for (const widget of node.widgets.slice(2)) {
        if (widget.name in last_generated) {
            widget.value = last_generated[widget.name];
        }
    }
}

// Sets all widgets to random.
function setAllRandom(node) {
    for (const widget of node.widgets.slice(2)) {
        widget.value = "random";
    }
}

let addDialog = null;
let editDialog = null;
let slotElement = null;
let valueElements = [];

function setup_and_show_add_dialog() {
    if (!addDialog) {
        addDialog = setup_edit_dialog();
    }
    show_edit_dialog(addDialog, "Add Slot", "", false);
}

function setup_and_show_edit_dialog(widgetName) {
    if (!editDialog) {
        editDialog = setup_edit_dialog();
    }
    show_edit_dialog(editDialog, "Edit Slot", widgetName, true);
}

function setup_edit_dialog() {
    const dialog = setup_common_dialog("Save", async function () {
        await api.fetchApi("/wilddivide/add_slot", {
            method: "POST",
            body: JSON.stringify({
                name: slotElement.value,
                values: "- " + valueElements.map((element) => element.value).join("\n- "),
            }),
        });
        await refresh_wildcards();
        dialog.close();
    });
    return dialog;
}

function show_edit_dialog(dialog, title, widgetName, disabled) {
    slotElement = document.createElement("input");
    Object.assign(slotElement.style, {
        width: "300px",
        margin: "0",
        padding: "3px 5px",
        border: "1px solid var(--p-form-field-border-color)",
    });
    slotElement.disabled = disabled;
    slotElement.value = widgetName;
    const values = widgetName == "" ? [""] : wildcards_dict[`m/${widgetName}`];
    show_dialog_internal(dialog, title, slotElement, values, disabled);
}

function setup_common_dialog(okLabel, okCallback) {
    const dialog = new app.ui.dialog.constructor();
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
    okButton.onclick = okCallback;
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

function show_dialog_internal(dialog, title, slotNameElement, values, disabled) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "baseline",
        gap: "0px 2px",
        marginTop: "10px",
    });

    const slotLabel = document.createElement("label");
    Object.assign(slotLabel.style, {
        textAlign: "right",
    });
    slotLabel.textContent = "Slot  ";

    let deleteSlotButton = null;
    if (disabled) {
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
        deleteSlotButton.onclick = async function () {
            if (window.confirm("Are you sure you want to delete this slot?")) {
                await api.fetchApi("/wilddivide/delete_slot", {
                    method: "POST",
                    body: JSON.stringify({
                        name: slotNameElement.value,
                    }),
                });
                await refresh_wildcards();
                dialog.close();
            }
        };
    } else {
        deleteSlotButton = document.createElement("span");
    }
    container.append(slotLabel, slotNameElement, deleteSlotButton);

    const marker = document.createElement("span");
    const addButton = document.createElement("button");
    Object.assign(addButton.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
    });
    addButton.textContent = "Add new value (Ctrl+⏎)";
    addButton.onclick = function () {
        const valueElement = add_new_value("-", "", marker);
        valueElement.focus();
    };
    container.append(marker, addButton);

    valueElements = [];
    values.forEach((value) => {
        add_new_value("-", value, marker);
    });

    dialog.show(title);
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
    });
    dialog.textElement.append(container);
}

function add_new_value(label, value, marker) {
    const labelElement = document.createElement("label");
    Object.assign(labelElement.style, {
        textAlign: "right",
    });
    labelElement.textContent = label;

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
    
    // Ctrl+Enter to add new value
    valueElement.addEventListener("keydown", function(e) {
        if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault(); // 기본 동작 방지
            const valueElement = add_new_value("-", "", marker);
            valueElement.focus();
        }
    });
    
    valueElements.push(valueElement);

    const adjustHeight = function () {
        valueElement.style.height = "auto";
        if (valueElement.value.includes("\n") || valueElement.value.length > 39) {
            valueElement.style.height = valueElement.scrollHeight + "px";
        } else {
            valueElement.style.height = "3ex";
        }
    };
    valueElement.addEventListener("input", adjustHeight);
    setTimeout(adjustHeight, 0);

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
        valueElements.splice(valueElements.indexOf(valueElement), 1);
        labelElement.remove();
        valueElement.remove();
        deleteButton.remove();
    }
    marker.before(labelElement, valueElement, deleteButton);
    return valueElement;
}
