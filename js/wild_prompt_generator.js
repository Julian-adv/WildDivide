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

    let slotName = null;
    let slotValues = null;

    node.addWidget("button", "➕ add slot", null, () => {
        const container = document.createElement("div");
        Object.assign(container.style, {
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "10px",
        });

        slotName = document.createElement("input");
        const nameLbl = document.createElement("label");
        Object.assign(nameLbl.style, {
            textAlign: "right",
        });
        slotName.value = "";
        nameLbl.textContent = "Slot Name:";
        container.append(nameLbl, slotName);

        slotValues = document.createElement("textarea");
        slotValues.classList.add("comfy-multiline-input");
        Object.assign(slotValues.style, {
            width: "300px",
            height: "300px",
        });
        const valueLbl = document.createElement("label");
        Object.assign(valueLbl.style, {
            textAlign: "right",
        });
        slotValues.value = "";
        valueLbl.textContent = "Values:";
        container.append(valueLbl, slotValues);

        dialog.show("");
        dialog.textElement.append(container);
    });
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

    const saveButton = document.createElement("button");
    Object.assign(saveButton.style, {
        padding: "2px 10px",
        marginTop: "0",
        backgroundColor: "var(--primary-bg)",
    });
    saveButton.textContent = "Save";
    saveButton.onclick = function () {
        if (slotName.value.trim() != "") {
            console.log(slotName.value, slotValues.value);
            api.fetchApi("/wilddivide/add_slot", {
                method: "POST",
                body: JSON.stringify({
                    name: slotName.value,
                    values: slotValues.value,
                }),
            });
        }

        dialog.close();
    };
    buttonContainer.append(saveButton);
    buttonContainer.append(closeButton);
    node.size[0] = width;
}