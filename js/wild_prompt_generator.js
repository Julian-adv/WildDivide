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

// Sets up the node with the wildcards.
function setup_node(node) {
    let copied_keys = Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"));

    // Get current values
    let old_values = {};
    node.widgets.forEach((widget) => old_values[widget.name] = widget.value);

    // Remove widgets except first 2
    node.widgets = node.widgets.slice(0, 2);
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
        });

        // Create combo
        const combo = document.createElement("div");
        Object.assign(combo.style, {
            display: "flex",
            flexDirection: "row",
            fontSize: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            border: "1px solid var(--p-surface-500)",
            borderRadius: "8px",
            padding: "0px 8px",
            flex: "1 1 auto",
            width: "150px",
        });

        // Create label
        const inputLbl = document.createElement("label");
        inputLbl.textContent = widgetName;
        Object.assign(inputLbl.style, {
            color: "var(--p-form-field-float-label-color)",
            flex: "0"
        });
        combo.append(inputLbl);

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
            backgroundColor: "transparent",
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
        selectEl.addEventListener('mousedown', (e) => {
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
            padding: "0px",
            // height: "fit-content",
            transform: "rotateZ(90deg)",
        });
        button.textContent = "✎";
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
                app.canvas.setDirty(true);
            },
            getHeight() {
                return 25;
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

    node.addWidget("button", "Last generated", null, () => {
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
    show_add_dialog(addDialog);
}

function show_add_dialog(dialog) {
    slotElement = document.createElement("input");
    show_dialog_internal(dialog, "Add Slot", slotElement, []);
}

function setup_and_show_edit_dialog(widgetName) {
    if (!editDialog) {
        editDialog = setup_edit_dialog();
    }
    show_edit_dialog(editDialog, widgetName);
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

function show_edit_dialog(dialog, widgetName) {
    slotElement = document.createElement("select");
    Object.assign(slotElement.style, {
        width: "300px",
        margin: "0",
        padding: "3px",
    });
    for (const key of Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"))) {
        let option = document.createElement("option");
        const slotName = key.substring(2);
        option.value = slotName;
        option.textContent = slotName;
        slotElement.append(option);
    }
    slotElement.value = widgetName;
    show_dialog_internal(dialog, "Edit Slot", slotElement, wildcards_dict[`m/${widgetName}`]);
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
    });
    okButton.textContent = okLabel;
    okButton.onclick = okCallback;
    buttonContainer.append(okButton);

    // Cancel button
    const cancelButton = document.createElement("button");
    Object.assign(cancelButton.style, {
        fontSize: "16px",
    });
    cancelButton.textContent = "Cancel";
    cancelButton.onclick = function () {
        dialog.close();
    };
    buttonContainer.append(cancelButton);

    return dialog;
}

function show_dialog_internal(dialog, title, slotNameElement, values) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "baseline",
        gap: "4px",
        marginTop: "10px",
    });

    const slotLabel = document.createElement("label");
    Object.assign(slotLabel.style, {
        textAlign: "right",
    });
    slotLabel.textContent = "Slot  ";

    container.append(slotLabel, slotNameElement);

    const marker = document.createElement("span");
    const addButton = document.createElement("button");
    Object.assign(addButton.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
    });
    addButton.textContent = "Add new value";
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
    });
    valueElement.value = value;
    valueElements.push(valueElement);

    const adjustHeight = function () {
        valueElement.style.height = "auto";
        if (!valueElement.value.includes("\n")) {
            valueElement.style.height = "3ex";
        } else {
            valueElement.style.height = valueElement.scrollHeight + "px";
        }
    };
    valueElement.addEventListener("input", adjustHeight);
    setTimeout(adjustHeight, 0);
    marker.before(labelElement, valueElement);
    return valueElement;
}
