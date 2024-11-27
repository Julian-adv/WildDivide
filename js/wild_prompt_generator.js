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
            setup_and_show_dialog("Edit");
            set_edit_values(widgetName);
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
    node.addWidget("button", "⚙️ Manage", null, () => {
        setup_and_show_dialog("Add");
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

function setup_and_show_dialog(tab) {
    if (!dialog) {
        dialog = setup_dialog();
    }
    show_dialog(dialog, tab);
}

// Sets up the dialog.
function setup_dialog() {
    const dialog = new app.ui.dialog.constructor();
    dialog.element.classList.add("comfy-settings");
    Object.assign(dialog.element.style, {
        flexDirection: "column",
    });

    const closeButton = dialog.element.querySelector("button");
    Object.assign(closeButton.style, {
        padding: "2px 10px",
        marginTop: "0",
    });
    closeButton.textContent = "Cancel";
    const buttonContainer = document.createElement("div");
    Object.assign(buttonContainer.style, {
        display: "flex",
        justifyContent: "space-evenly",
        alignItems: "end"
    });
    dialog.element.append(buttonContainer);

    buttonContainer.append(closeButton);

    return dialog;
}

let editSlotNames = null;
let editSlotValues = null;

function show_dialog(dialog, tab) {
    const addContainer = document.createElement("div");
    Object.assign(addContainer.style, {
        display: "none",
        gridTemplateColumns: "auto 1fr",
        gap: "10px",
    });

    const addSlotName = document.createElement("input");
    const nameLbl = document.createElement("label");
    Object.assign(nameLbl.style, {
        textAlign: "right",
    });
    addSlotName.value = "";
    nameLbl.textContent = "Slot Name:";
    addContainer.append(nameLbl, addSlotName);

    const addSlotValues = document.createElement("textarea");
    addSlotValues.classList.add("comfy-multiline-input");
    Object.assign(addSlotValues.style, {
        width: "300px",
        height: "300px",
    });
    const valueLbl = document.createElement("label");
    Object.assign(valueLbl.style, {
        textAlign: "right",
    });
    addSlotValues.value = "";
    valueLbl.textContent = "Values:";

    const addSaveButton = document.createElement("button");
    Object.assign(addSaveButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        backgroundColor: "var(--primary-bg)",
        gridColumn: "1 / 3",
        justifySelf: "center",
    });
    addSaveButton.textContent = "Save";
    addSaveButton.onclick = async function () {
        if (addSlotName.value.trim() != "") {
            await api.fetchApi("/wilddivide/add_slot", {
                method: "POST",
                body: JSON.stringify({
                    name: addSlotName.value,
                    values: addSlotValues.value,
                }),
            });
            await refresh_wildcards();
        }

        dialog.close();
    };
    const addHelpText = document.createElement("p");
    Object.assign(addHelpText.style, {
        gridColumn: "1 / 3",
    });
    addHelpText.textContent = "Each value should start with '- ' prefix.";
    addContainer.append(valueLbl, addSlotValues, addHelpText, addSaveButton);
    addContainer.dataset.tab = "Add";

    const removeContainer = document.createElement("div");
    Object.assign(removeContainer.style, {
        display: "none",
        gridTemplateColumns: "auto 1fr",
        gap: "10px",
    });
    const removeSlotLbl = document.createElement("label");
    Object.assign(removeSlotLbl.style, {
        textAlign: "right",
    });
    removeSlotLbl.textContent = "Slot Name:";

    const removeSlotValues = createSelect("remove-slot-values");
    const removeSaveButton = document.createElement("button");
    Object.assign(removeSaveButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        backgroundColor: "red",
        gridColumn: "1 / 3",
        justifySelf: "center",
    });
    removeSaveButton.textContent = "Delete";
    removeSaveButton.onclick = async function () {
        await api.fetchApi("/wilddivide/delete_slot", {
            method: "POST",
            body: JSON.stringify({
                name: removeSlotValues.value,
            }),
        });
        await refresh_wildcards();
        dialog.close();
    };

    removeContainer.append(removeSlotLbl, removeSlotValues, removeSaveButton);
    removeContainer.dataset.tab = "Remove";

    const editContainer = document.createElement("div");
    Object.assign(editContainer.style, {
        display: "none",
        gridTemplateColumns: "auto 1fr",
        gap: "10px",
    });

    editSlotNames = createSelect("edit-slot-names");
    editSlotNames.onchange = function () {
        const slotName = 'm/' + editSlotNames.value;
        editSlotValues.value = '- ' + wildcards_dict[slotName].join("\n- ");
    };
    const editSlotLbl = document.createElement("label");
    Object.assign(editSlotLbl.style, {
        textAlign: "right",
    });
    editSlotLbl.textContent = "Slot Name:";
    editContainer.append(editSlotLbl, editSlotNames);
    editContainer.dataset.tab = "Edit";

    editSlotValues = document.createElement("textarea");
    editSlotValues.classList.add("comfy-multiline-input");
    Object.assign(editSlotValues.style, {
        width: "300px",
        height: "300px",
    });
    const editSlotValueLbl = document.createElement("label");
    Object.assign(editSlotValueLbl.style, {
        textAlign: "right",
    });
    const slotName = 'm/' + editSlotNames.value;
    editSlotValues.value = '- ' + wildcards_dict[slotName].join("\n- ");
    editSlotValueLbl.textContent = "Values:";

    const editSaveButton = document.createElement("button");
    Object.assign(editSaveButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        backgroundColor: "var(--primary-bg)",
        gridColumn: "1 / 3",
        justifySelf: "center",
    });
    editSaveButton.textContent = "Save";
    editSaveButton.onclick = async function () {
        await api.fetchApi("/wilddivide/add_slot", {
            method: "POST",
            body: JSON.stringify({
                name: editSlotNames.value,
                values: editSlotValues.value,
            }),
        });
        await refresh_wildcards();
        dialog.close();
    };

    const editHelpText = document.createElement("p");
    Object.assign(editHelpText.style, {
        gridColumn: "1 / 3",
    });
    editHelpText.textContent = "Each value should start with '- ' prefix.";
    editContainer.append(editSlotValueLbl, editSlotValues, editHelpText, editSaveButton);

    const tabHeader = document.createElement("div");
    Object.assign(tabHeader.style, {
        display: "flex",
        justifyContent: "start",
        gap: "10px",
        padding: "10px 0",
    });
    const addButton = document.createElement("button");
    Object.assign(addButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        fontSize: "14px",
        backgroundColor: "var(--primary-bg)",
    });
    addButton.textContent = "Add";
    addButton.onclick = function () {
        setActiveTab(tabHeader, "Add");
    };

    const removeButton = document.createElement("button");
    Object.assign(removeButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        fontSize: "14px",
    });
    removeButton.textContent = "Remove";
    removeButton.onclick = function () {
        setActiveTab(tabHeader, "Remove");
    };

    const editButton = document.createElement("button");
    Object.assign(editButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        fontSize: "14px",
    });
    editButton.textContent = "Edit";
    editButton.onclick = function () {
        setActiveTab(tabHeader, "Edit");
    };

    tabHeader.append(addButton, removeButton, editButton);


    dialog.show("Manage Slots");
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
    });
    dialog.textElement.append(tabHeader, addContainer, removeContainer, editContainer);
    setActiveTab(tabHeader, tab);
}

function createSelect(id) {
    const select = document.createElement("select");
    select.id = id;
    Object.assign(select.style, {
        width: "300px",
    });
    for (const key of Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"))) {
        let option = document.createElement("option");
        const slotName = key.substring(2);
        option.value = slotName;
        option.textContent = slotName;
        select.append(option);
    }
    return select;
}

let activeContainer = null;

function setActiveTab(tabHeader, activeTab) {
    let container = document.querySelector(`[data-tab="${activeTab}"]`);
    for (const tab of tabHeader.children) {
        if (tab.textContent == activeTab) {
            tab.style.backgroundColor = "var(--primary-bg)";
        } else {
            tab.style.backgroundColor = "";
        }
    }
    if (activeContainer) {
        activeContainer.style.display = "none";
    }
    container.style.display = "grid";
    activeContainer = container;
}

function set_edit_values(widgetName) {
    editSlotNames.value = widgetName;
    const slotName = 'm/' + widgetName;
    editSlotValues.value = '- ' + wildcards_dict[slotName].join("\n- ");
}

