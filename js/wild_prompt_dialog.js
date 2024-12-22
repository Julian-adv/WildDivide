import { api } from "../../scripts/api.js";
import { refresh_wildcards, get_wildcards_dict} from "./wild_prompt_common.js";
import { update_last_generated } from "./wild_prompt_tooltip.js";
import { update_context_menu } from "./wild_prompt_context_menu.js";

let addDialog = null;
let edit_dialog = null;
let add_group_dialog = null;
let edit_group_dialog = null;

const DialogType = {
    ADD: 0,
    EDIT: 1,
    ADD_GROUP: 2,
    EDIT_GROUP: 3
}

export function show_add_dialog(group_name, node) {
    if (!addDialog) {
        addDialog = setup_dialog(DialogType.ADD, node, null);
    }
    show_dialog(addDialog, "Add Slot", group_name, "");
}

export function show_edit_dialog(widget_name, node) {
    if (!edit_dialog) {
        edit_dialog = setup_dialog(DialogType.EDIT, node, widget_name);
    }
    let group_name = "";
    let widget_only_name = widget_name;
    if (widget_name.includes("/")) {
        [group_name, widget_only_name] = widget_name.split("/");
    }

    edit_dialog.org_name = widget_name;
    show_dialog(edit_dialog, `Edit Slot: ${widget_name}`, group_name, widget_only_name);
}

export function show_edit_group_dialog(groupName, node) {
    if (!edit_group_dialog) {
        edit_group_dialog = setup_dialog(DialogType.EDIT_GROUP, node, null);
    }
    edit_group_dialog.org_name = groupName;
    show_dialog(edit_group_dialog, `Edit Group: ${groupName}`, groupName, "");
}

export function show_add_group_dialog(node) {
    if (!add_group_dialog) {
        add_group_dialog = setup_dialog(DialogType.ADD_GROUP, node, null);
    }
    show_dialog(add_group_dialog, "Add Group", "", "");
}

function setup_dialog(dialogType, node, widget_name) {
    const dialog = setup_common_dialog(dialogType, "Save", async function (dialog) {
        if (dialog.type === DialogType.EDIT_GROUP) {
            const new_name = group_from_dialog(dialog);
            if (dialog.org_name === new_name) {
                return;
            }
            if (new_name === "") {
                alert_message(dialog, "Group cannot be empty");
                return;
            }
            await edit_group(dialog.org_name, new_name);
            dialog.close();
        } else {
            const wildcards_dict = get_wildcards_dict();
            let values = get_values(dialog);
            const key = key_from_dialog(dialog);
            // check if key exists
            if (key == "") {
                alert_message(dialog, "Slot cannot be empty");
            } else if (wildcards_dict[`m/${key}`] && dialog.type !== DialogType.EDIT) {
                alert_message(dialog, "Slot already exists");
            } else {
                if (dialog.type === DialogType.EDIT && dialog.org_name !== key_from_dialog(dialog)) {
                    await api.fetchApi("/wilddivide/rename_slot", {
                        method: "POST",
                        body: JSON.stringify({ name: dialog.org_name, new_name: key }),
                    });
                }
                await save_slot(key, values);
                dialog.close();
                setTimeout(() => {
                    update_context_menu(node, widget_name);
                }, 20);
            }
        }
    });
    return dialog;
}

function setup_common_dialog(dialogType, okLabel, okCallback) {
    const dialog = new app.ui.dialog.constructor();
    dialog.type = dialogType;

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

    // Alert container
    const alertContainer = document.createElement("div");
    Object.assign(alertContainer.style, {
        display: "flex",
        width: "100%",
        height: "35px",
    });
    dialog.alertMessage = document.createElement("p");
    dialog.alertMessage.style.cssText = `
        font-size: 14px;
        color: var(--error-color);
        width: 100%;
        height: 35px;
        text-align: center;
        margin: 0;
    `;
    dialog.alertMessage.textContent = "";
    alertContainer.append(dialog.alertMessage);
    dialog.element.append(alertContainer);

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
    okButton.onclick = () => okCallback(dialog);
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

function show_dialog(dialog, title, groupName, widgetName) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    })
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "grid",
        gridTemplateColumns: "auto 400px auto",
        alignItems: "baseline",
        gap: "0px 2px",
        marginTop: "10px",
        paddingRight: "10px"
    });

    // Group label
    const groupLabel = document.createElement("label");
    Object.assign(groupLabel.style, {
        textAlign: "right",
    });
    groupLabel.textContent = "Group";

    dialog.groupElement = document.createElement("input");
    Object.assign(dialog.groupElement.style, {
        width: "auto",
        margin: "0",
        padding: "3px 5px",
        border: "1px solid var(--p-form-field-border-color)",
    });
    dialog.groupElement.value = groupName || "";
    dialog.groupElement.disabled = (dialog.type === DialogType.EDIT);

    // Delete group button
    let delete_group_button = null;
    if (dialog.type === DialogType.EDIT_GROUP) {
        delete_group_button = document.createElement("button");
        Object.assign(delete_group_button.style, {
            fontSize: "14px",
            backgroundColor: "transparent",
            padding: "0px",
            border: "none",
            cursor: "pointer",
            width: "16px",
            height: "16px",
            color: "var(--p-form-field-float-label-color)",
        });
        delete_group_button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /> </svg>';
        delete_group_button.onclick = async function() {
            await delete_group(group_from_dialog(dialog));
            dialog.close();
        };
    } else {
        delete_group_button = document.createElement("span");
    }
    header.append(groupLabel, dialog.groupElement, delete_group_button);

    // Only show slot and value fields if not editing a group
    if (dialog.type === DialogType.ADD || dialog.type === DialogType.EDIT || dialog.type === DialogType.ADD_GROUP) {
        // Slot label
        const slotLabel = document.createElement("label");
        Object.assign(slotLabel.style, {
            textAlign: "right",
        });
        slotLabel.textContent = "Slot";

        dialog.slotElement = document.createElement("input");
        Object.assign(dialog.slotElement.style, {
            width: "auto",
            margin: "0",
            padding: "3px 5px",
            border: "1px solid var(--p-form-field-border-color)",
        });
        if (dialog.type === DialogType.EDIT) {
            dialog.slotElement.value = widgetName;
        } else {
            dialog.slotElement.value = "";
        }
        
        prevent_invalid_input(dialog.groupElement);
        prevent_invalid_input(dialog.slotElement);
        
        // Delete button
        let deleteSlotButton = null;
        if (dialog.type === DialogType.EDIT) {
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
            deleteSlotButton.onclick = async function() {
                await delete_slot(key_from_dialog(dialog));
                dialog.close();
            };
        } else {
            deleteSlotButton = document.createElement("span");
        }
        header.append(slotLabel, dialog.slotElement, deleteSlotButton);
    }

    // Filter label
    if (dialog.type === DialogType.EDIT) {
        const filterLabel = document.createElement("label");
        Object.assign(filterLabel.style, {
            textAlign: "right",
        });
        filterLabel.textContent = "Filter";

        const filter_container = document.createElement("div");
        Object.assign(filter_container.style, {
            display: "flex",
            gap: "2px",
            width: "100%",
        });

        dialog.filterElement = document.createElement("input");
        Object.assign(dialog.filterElement.style, {
            margin: "0",
            padding: "3px 5px",
            border: "1px solid var(--p-form-field-border-color)",
            flex: "1 1 auto",
        });
        dialog.filterElement.value = "";
        dialog.filterElement.disabled = (dialog.type !== DialogType.EDIT);
        dialog.filterElement.placeholder = "Filter values...";

        // Filter counter
        dialog.filter_counter = document.createElement("span");
        Object.assign(dialog.filter_counter.style, {
            fontSize: "12px",
            color: "var(--p-form-field-float-label-color)",
            alignSelf: "center",
            flex: "0 0 auto",
            whiteSpace: "nowrap",
        });

        filter_container.append(dialog.filterElement, dialog.filter_counter);

        const clear_filter_button = document.createElement("button");
        Object.assign(clear_filter_button.style, {
            fontSize: "14px",
            backgroundColor: "transparent",
            padding: "0px",
            border: "none",
            cursor: "pointer",
            width: "16px",
            height: "16px",
            color: "var(--p-form-field-float-label-color)",
            alignSelf: "center",
        })
        clear_filter_button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /> </svg>';
        clear_filter_button.onclick = function() {
            dialog.filterElement.value = "";
            dialog.filterElement.dispatchEvent(new Event('change'));
        }

        dialog.filterElement.addEventListener("input", () => {
            const filterText = dialog.filterElement.value.toLowerCase();
            let counter = 0;
            dialog.entries.forEach((entry, index) => {
                const value = entry.value.value;
                const condition = entry.condition.value;

                let visible = false;
                if (filterText) {
                    if (value.toLowerCase().includes(filterText)) {
                        visible = true;
                    }
                    if (condition.toLowerCase().includes(filterText)) {
                        visible = true;
                    }
                } else {
                    visible = true;
                }
                if (visible) {
                    counter += 1;
                    entry.style.display = "flex";
                } else {
                    entry.style.display = "none";
                }
            });
            dialog.filter_counter.textContent = `${counter} / ${dialog.entries.length}`;
        });

        dialog.filterElement.addEventListener("change", () => {
            if (!dialog.filterElement.value) {
                dialog.entries.forEach((entry, index) => {
                    entry.style.display = "flex";
                });
            }
        });

        dialog.filterElement.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                dialog.close();
            }
        });

        header.append(filterLabel, filter_container, clear_filter_button);
    }
    container.append(header);

    dialog.entries = [];

    if (dialog.type === DialogType.ADD || dialog.type === DialogType.EDIT || dialog.type === DialogType.ADD_GROUP) {
        const value_container = document.createElement("div");
        Object.assign(value_container.style, {
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: "6px",
            alignItems: "center",
        });

        const marker = document.createElement("div");
        Object.assign(marker.style, {
            width: "90%",
            display: "flex",
            flexDirection: "row",
            gap: "4px"
        });

        const adjust_prob_button = document.createElement("button");
        Object.assign(adjust_prob_button.style, {
            flex: "1",
            fontSize: "14px",
            backgroundColor: "transparent",
        })
        adjust_prob_button.textContent = "Adjust probabilities";
        adjust_prob_button.onclick = function () {
            adjust_probabilities(dialog);
        }

        const addButton = document.createElement("button");
        Object.assign(addButton.style, {
            flex: "1",
            fontSize: "14px",
            backgroundColor: "transparent",
        });
        addButton.textContent = "Add new value (shift+⏎)";
        addButton.onclick = function () {
            const valueElement = add_new_value(dialog, "-", "", "", "", marker);
            valueElement.focus();
        };
        marker.append(adjust_prob_button, addButton);
        value_container.append(marker);

        const values = widgetName == "" ? [["", "", ""]] : get_values_array(groupName, widgetName);

        add_column_header(container);
        values.forEach(([condition, prob, value]) => {
            add_new_value(dialog, "-", condition, prob, value, marker);
        });
        container.append(value_container);

        if (dialog.filter_counter) {
            dialog.filter_counter.textContent = `0 / ${dialog.entries.length}`;
        }
    }

    dialog.show(title);
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
        marginBottom: "10px",
    });
    dialog.textElement.append(container);
    if (dialog.type === DialogType.EDIT) {
        setTimeout(() => {
            dialog.entries[dialog.entries.length - 1].value.focus();
            dialog.entries[dialog.entries.length - 1].value.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    } else if (dialog.type === DialogType.ADD_GROUP || dialog.type === DialogType.EDIT_GROUP) {
        setTimeout(() => {
            dialog.groupElement.focus();
            dialog.groupElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    } else {
        setTimeout(() => {
            dialog.slotElement.focus();
            dialog.slotElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }
}

function alert_message(dialog, message) {
    dialog.alertMessage.textContent = message;
    setTimeout(() => {
        dialog.alertMessage.textContent = "";
    }, 4000);
}

function group_from_dialog(dialog) {
    return dialog.groupElement.value;
}

function key_from_dialog(dialog) {
    if (dialog.slotElement.value === "") {
        return "";
    }
    return dialog.groupElement.value ?
        `${dialog.groupElement.value}/${dialog.slotElement.value}` :
        dialog.slotElement.value;
}

function prevent_invalid_input(element) {
    element.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
    });
}

async function edit_group(name, new_name) {
    await api.fetchApi("/wilddivide/edit_group", {
        method: "POST",
        body: JSON.stringify({
            name: dialog.org_name,
            new_name: new_name
        }),
    })
    await refresh_wildcards();
}

async function delete_group(name) {
    if (window.confirm("Are you sure you want to delete this group?")) {
        await api.fetchApi("/wilddivide/delete_group", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        await refresh_wildcards();
    }
}

async function save_slot(name, values) {
    await api.fetchApi("/wilddivide/add_slot", {
        method: "POST",
        body: JSON.stringify({ name, values }),
    });
    await refresh_wildcards();
}

async function delete_slot(name) {
    if (window.confirm("Are you sure you want to delete this slot?")) {
        await api.fetchApi("/wilddivide/delete_slot", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        await refresh_wildcards();
    }
}

const label_width = "1em";
const condition_width = "150px";
const prob_width = "64px";
const value_width = "300px";
const delete_width = "16px";

function add_column_header(container) {
    const header_container = document.createElement("div");
    Object.assign(header_container.style, {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "4px",
        marginTop: "10px",
    })

    const label = document.createElement("label");
    Object.assign(label.style, {
        width: label_width,
    })
    header_container.append(label);

    const condition_element = document.createElement("label");
    Object.assign(condition_element.style, {
        width: condition_width,
    })
    condition_element.textContent = "Condition";
    header_container.append(condition_element);

    const prob_element = document.createElement("label");
    Object.assign(prob_element.style, {
        width: prob_width,
    })
    prob_element.textContent = "Prob %";
    header_container.append(prob_element);

    const value_element = document.createElement("label");
    Object.assign(value_element.style, {
        width: value_width,
    })
    value_element.textContent = "Value";
    header_container.append(value_element);

    const delete_element = document.createElement("span");
    Object.assign(delete_element.style, {
        width: delete_width,
    })
    header_container.append(delete_element);
    container.append(header_container);
}

function add_new_value(dialog, label, condition, prob, value, marker) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "4px",
        border: "none",
        padding: "0px",
        alignItems: "start",
    })
    const label_element = document.createElement("label");
    Object.assign(label_element.style, {
        width: label_width,
        textAlign: "right",
        cursor: "move",
    });
    label_element.textContent = label;
    label_element.draggable = true;

    const condition_element = document.createElement("textarea");
    condition_element.classList.add("comfy-multiline-input");
    Object.assign(condition_element.style, {
        width: "150px",
        height: "22px",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    })
    condition_element.value = condition;

    const prob_element = document.createElement("input");
    prob_element.type = "number";
    Object.assign(prob_element.style, {
        width: "50px",
        height: "22px",
        fontSize: "12px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "4px 5px",
        border: "none",
    })
    prob_element.value = prob;
    prob_element.calculated = prob === "" ? true : false;
    prob_element.addEventListener("input", () => {
        if (prob_element.value) {
            prob_element.calculated = false;
            prob_element.style.color = "";
        }
    })
    prob_element.addEventListener("focus", () => {
        if (prob_element.calculated) {
            prob_element.value = "";
        }
    })

    const value_element = document.createElement("textarea");
    value_element.classList.add("comfy-multiline-input");
    Object.assign(value_element.style, {
        width: "300px",
        height: "22px",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    });
    value_element.value = value;

    // Setup drag and drop
    label_element.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", dialog.entries.indexOf(container));
    });
    label_element.addEventListener("dragover", (e) => {
        e.preventDefault();
    });
    label_element.addEventListener("drop", (e) => {
        e.preventDefault();
        const dragged_index = parseInt(e.dataTransfer.getData("text/plain"));
        const target_index = dialog.entries.indexOf(container);
        if (dragged_index !== target_index) {
            const dragged_container = dialog.entries[dragged_index];
            
            // Update array order
            dialog.entries.splice(dragged_index, 1);
            dialog.entries.splice(target_index, 0, dragged_container);
            
            // Move DOM elements
            if (target_index > dragged_index) {
                container.after(dragged_container);
            } else {
                container.before(dragged_container);
            }
        }
    });
    
    // Shift+Enter to add new value
    value_element.addEventListener("keydown", function(e) {
        if (e.shiftKey && e.key === "Enter") {
            e.preventDefault();
            const value_element = add_new_value(dialog, "-", "", "", "", marker);
            value_element.focus();
        }
    });
    
    dialog.entries.push(container);

    condition_element.addEventListener("input", () => { adjust_textarea_height(condition_element); });
    value_element.addEventListener("input", () => { adjust_textarea_height(value_element); });
    setTimeout(() => {
        adjust_textarea_height(value_element);
        adjust_textarea_height(condition_element);
    }, 0);

    const delete_button = document.createElement("button");
    Object.assign(delete_button.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
        padding: "0px",
        border: "none",
        cursor: "pointer",
        width: "16px",
        height: "16px",
        color: "var(--p-form-field-float-label-color)",
    });
    delete_button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /> </svg>';
    delete_button.onclick = function() {
        dialog.entries.splice(dialog.entries.indexOf(container), 1);
        label_element.remove();
        condition_element.remove();
        prob_element.remove();
        value_element.remove();
        delete_button.remove();
    }
    container.append(label_element, condition_element, prob_element, value_element, delete_button);
    container.condition = condition_element;
    container.prob = prob_element;
    container.value = value_element;
    marker.before(container);
    return container;
}

function adjust_textarea_height(textarea) {
    textarea.style.height = "auto";
    
    // Create temporary span to calculate text width
    const span = document.createElement('span');
    span.style.cssText = `
        position: absolute; 
        visibility: hidden;
        white-space: pre;
        font-family: ${getComputedStyle(textarea).fontFamily};
        font-size: ${getComputedStyle(textarea).fontSize};
        padding: ${getComputedStyle(textarea).padding};
    `;
    span.textContent = textarea.value;
    document.body.appendChild(span);
    
    const textWidth = span.offsetWidth;
    document.body.removeChild(span);
    
    // Actual textarea width (excluding padding)
    const textareaWidth = textarea.clientWidth - 
        (parseInt(getComputedStyle(textarea).paddingLeft) + 
         parseInt(getComputedStyle(textarea).paddingRight));
    
    if (textarea.value.includes("\n") || textWidth > textareaWidth) {
        textarea.style.height = textarea.scrollHeight + "px";
    } else {
        textarea.style.height = "3ex";
    }
}

function get_values_array(group, key) {
    const wildcards_dict = get_wildcards_dict();
    const values = wildcards_dict['m/' + join_group_key(group, key)];
    return values.map(str => {
        let condition = "";
        let value = str;
        const match = str.match(/^(.*?)\s*=>\s*([\s\S]*)$/);
        if (match) {
            condition = match[1];
            value = match[2];
        }
        const match2 = value.match(/^\s*(\d+\.?\d*|\d*\.?\d+)\s*,\s*([\s\S]*)$/);
        return match2 ? [condition, match2[1], match2[2]] : [condition, "", value];
    });
}

export function join_group_key(group, key) {
    return group == "" ? key : `${group}/${key}`;
}

function adjust_probabilities(dialog) {
    let total_prob = 0;
    let empty_count = 0;
    let filled_count = 0;
    dialog.entries.forEach((entry) => {
        const prob = entry.prob.value || "";
        if (prob && !entry.prob.calculated) {
            total_prob += parseFloat(prob);
            filled_count++;
        } else {
            empty_count++;
        }
    })
    if (total_prob > 100) {
        const ratio = 100 / total_prob;
        dialog.entries.forEach((entry) => {
            if (entry.prob.value) {
                entry.prob.value = (parseFloat(entry.prob.value) * ratio).toFixed(1);
            }
        })
    } else {
        const rest_prob = 100 - total_prob;
        const empty_prob = (rest_prob / empty_count).toFixed(1);
        dialog.entries.forEach((entry) => {
            if (!entry.prob.value || entry.prob.calculated) {
                entry.prob.value = empty_prob;
                entry.prob.style.color = "var(--p-form-field-disabled-background)";
                entry.prob.calculated = true;
            }
        })
    }
}

function get_values(dialog) {
    return "- " + dialog.entries.map((entry, index) => {
        const condition = entry.condition.value || "";
        const prob = entry.prob.calculated ? "" : (entry.prob.value || "");
        const value = entry.value.value || "";
        return condition ? (prob ? `${condition} => ${prob},${value}`
                                    : `${condition} => ${value}`)
                            : (prob ? `${prob},${value}` : value);
    }).join("\n- ");
}