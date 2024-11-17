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
            console.log(wildcards_dict);
            console.log(node.widgets);
            setup_node(node);
        }
    },
});

// Called when the refresh button is clicked.
export async function refresh_wildcards() {
    await load_wildcards();
    if (generator_node) {
        setup_node(generator_node);
    }
}

// Sets up the node with the wildcards.
function setup_node(node) {
    let copied_keys = Object.keys(wildcards_dict).filter((key) => key.startsWith("m/"));

    // Remove widgets except first 2
    node.widgets = node.widgets.slice(0, 2);
    let nodeSize = node.size;
    
    for (const key of copied_keys) {
        let widgetName = key.substring(2); // Remove "m/" prefix
        node.addWidget("combo", widgetName, "disabled", () => {}, {
            property: widgetName,
            values: ["disabled", "random", ...wildcards_dict[key]],
        });
    }
    node.size[0] = nodeSize[0];
}