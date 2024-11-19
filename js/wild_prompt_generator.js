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

// Sets up the node with the wildcards.
function setup_node(node) {
    let copied_keys = Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"));

    // Get current values
    let current_values = {};
    node.widgets.forEach((widget) => current_values[widget.name] = widget.value);

    // Remove widgets except first 2
    node.widgets = node.widgets.slice(0, 2);
    let [width, height] = node.size;
    
    for (const key of copied_keys) {
        let widgetName = key.substring(2); // Remove "m/" prefix
        let values = ["disabled", "random", ...wildcards_dict[key]];
        // Preserve current value
        let value = current_values[widgetName];
        if (!values.includes(value)) {
            value = "disabled";
        }
        node.addWidget("combo", widgetName, value, () => {}, {
            property: widgetName,
            values: values,
        });
    }

    node.addWidget("button", "⚙️ Manage", null, () => {
        if (!dialog) {
            dialog = setup_dialog();
        }
        show_dialog(dialog);
    });
    node.size[0] = width;
}

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

function show_dialog(dialog) {
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

    const removeSlotValues = createSelect();
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

    const editContainer = document.createElement("div");
    Object.assign(editContainer.style, {
        display: "none",
        gridTemplateColumns: "auto 1fr",
        gap: "10px",
    });

    const editSlotNames = createSelect();
    editSlotNames.onchange = function () {
        const slotName = 'm/' + editSlotNames.value;
        editSlotValues.value = wildcards_dict[slotName].join("\n- ");
    };
    const editSlotLbl = document.createElement("label");
    Object.assign(editSlotLbl.style, {
        textAlign: "right",
    });
    editSlotLbl.textContent = "Slot Name:";
    editContainer.append(editSlotLbl, editSlotNames);

    const editSlotValues = document.createElement("textarea");
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
        setActiveTab(tabHeader, "Add", addContainer);
    };

    const removeButton = document.createElement("button");
    Object.assign(removeButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        fontSize: "14px",
    });
    removeButton.textContent = "Remove";
    removeButton.onclick = function () {
        setActiveTab(tabHeader, "Remove", removeContainer);
    };

    const editButton = document.createElement("button");
    Object.assign(editButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        fontSize: "14px",
    });
    editButton.textContent = "Edit";
    editButton.onclick = function () {
        setActiveTab(tabHeader, "Edit", editContainer);
    };

    tabHeader.append(addButton, removeButton, editButton);


    dialog.show("Manage Slots");
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
    });
    dialog.textElement.append(tabHeader, addContainer, removeContainer, editContainer);
    setActiveTab(tabHeader, "Add", addContainer);
}

function createSelect() {
    const select = document.createElement("select");
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

function setActiveTab(tabHeader, activeTab, container) {
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
