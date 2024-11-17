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
    node.size[0] = width;
}