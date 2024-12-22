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

export function values_for_key(widget_name) {
    const key = `m/${widget_name}`;
    const mapped_values = wildcards_dict[key].map((value) => {
        if (value.includes("=>")) {
            value = value.split("=>")[1].trim();
        }
        const match = value.match(/^\s*(\d+\.?\d*|\d*\.?\d+)\s*,\s*([\s\S]*)$/);
        if (match) {
            return match[2];
        }
        return value;
    });
    const values = ["disabled", "random", ...mapped_values];
    return values;
}

export function find_similar_value(value, values) {
    if (value == null || value == undefined) {
        return "random";
    } else if (values.includes(value)) {
        return value;
    } else {
        // Try to find the most similar value using Levenshtein distance
        let bestMatch = null;
        let minDistance = Infinity;
        const valueNormalized = value.toLowerCase();
        
        for (const similar_value of values) {
            const similarNormalized = similar_value.toLowerCase();
            
            // Calculate Levenshtein distance
            const distance = levenshtein_distance(valueNormalized, similarNormalized);
            const maxLength = Math.max(value.length, similar_value.length);
            const similarity = 1 - (distance / maxLength);  // Normalize by length
            
            if (similarity > 0.3 && distance < minDistance) {  // 70% similarity threshold
                minDistance = distance;
                bestMatch = similar_value;
            }
        }
        
        return bestMatch || "random";
    }
}

// Calculate Levenshtein distance between two strings
function levenshtein_distance(str1, str2) {
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

export function setValueColor(el, value) {
    el.textContent = value;
    if (el.tooltip) {
        el.tooltip.textContent = value;
    }
    if (value == 'disabled') {
        el.style.color = "var(--p-form-field-disabled-color)";
    } else if (value == 'random') {
        el.style.color = "var(--p-primary-color)";
    } else {
        el.style.color = "var(--fg-color)";
    }
}