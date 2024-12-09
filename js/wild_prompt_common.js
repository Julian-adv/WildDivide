import { api } from "../../scripts/api.js";

let generator_node = null;
let wildcards_dict = {};

export function set_generator_node(node) {
    generator_node = node;
}

export async function load_wildcards() {
    let res = await api.fetchApi("/wilddivide/wildcards/dict");
    let data = await res.json();
    wildcards_dict = data.data;
    return wildcards_dict;
}

export function get_wildcards_dict() {
    return wildcards_dict;
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
