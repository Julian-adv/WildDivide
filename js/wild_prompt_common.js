import { api } from "../../scripts/api.js";

let generator_node = null;
let setup_node = null;
let update_last_generated = null;
let wildcards_dict = {};

export function set_generator_node(node, setup_node_func, update_last_generated_func) {
    generator_node = node;
    setup_node = setup_node_func;
    update_last_generated = update_last_generated_func;
}

export function get_generator_node() {
    return generator_node;
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
    wildcards_dict = await load_wildcards();
    if (generator_node) {
        setup_node(generator_node, wildcards_dict);
        console.log("Wild prompt generator refreshed");
        app.graph.setDirtyCanvas(true);
        setTimeout(() => {
            update_last_generated(generator_node);
        }, 10);
    }
}

// Calculate Levenshtein distance between two strings
export function levenshtein_distance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // deletion
                    dp[i][j - 1],     // insertion
                    dp[i - 1][j - 1]  // substitution
                );
            }
        }
    }
    return dp[m][n];
}
