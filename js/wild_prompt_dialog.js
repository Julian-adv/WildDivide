import { api } from "../../scripts/api.js";
import { refresh_wildcards, get_wildcards_dict} from "./wild_prompt_common.js";
import { update_last_generated } from "./wild_prompt_tooltip.js";
import { update_context_menu } from "./wild_prompt_generator.js";

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

export function show_edit_dialog(widgetName, node) {
    if (!edit_dialog) {
        edit_dialog = setup_dialog(DialogType.EDIT, node, widgetName);
    }
    let groupName = "";
    if (widgetName.includes("/")) {
        [groupName, widgetName] = widgetName.split("/");
    }

    edit_dialog.org_name = widgetName;
    show_dialog(edit_dialog, `Edit Slot: ${widgetName}`, groupName, widgetName);
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

            let values = "- " + dialog.valueElements.map((element, index) => {
                const condition = dialog.conditionElements[index].value || "";
                const value = element.value || "";
                return condition ? `${condition} => ${value}` : value;
            }).join("\n- ");

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
                    update_last_generated(node);
                    update_context_menu(node, widget_name);
                }, 10);
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
            dialog.valueElements.forEach((valueElement, index) => {
                const conditionElement = dialog.conditionElements[index];
                const value = valueElement.value;
                const condition = conditionElement.value;

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
                    conditionElement.previousElementSibling.style.display = "block";
                    conditionElement.style.display = "block";
                    valueElement.style.display = "block";
                    valueElement.nextElementSibling.style.display = "block";
                } else {
                    conditionElement.previousElementSibling.style.display = "none";
                    conditionElement.style.display = "none";
                    valueElement.style.display = "none";
                    valueElement.nextElementSibling.style.display = "none";
                }
            });
            dialog.filter_counter.textContent = `${counter} / ${dialog.valueElements.length}`;
        });

        dialog.filterElement.addEventListener("change", () => {
            if (!dialog.filterElement.value) {
                dialog.valueElements.forEach((valueElement, index) => {
                    const conditionElement = dialog.conditionElements[index];
                    conditionElement.previousElementSibling.style.display = "block";
                    conditionElement.style.display = "block";
                    valueElement.style.display = "block";
                    valueElement.nextElementSibling.style.display = "block";
                });
            }
        });

        header.append(filterLabel, filter_container, clear_filter_button);
    }
    container.append(header);

    dialog.valueElements = [];
    dialog.conditionElements = [];

    if (dialog.type === DialogType.ADD || dialog.type === DialogType.EDIT || dialog.type === DialogType.ADD_GROUP) {
        const value_container = document.createElement("div");
        Object.assign(value_container.style, {
            display: "grid",
            gridTemplateColumns: "auto 1fr 2fr auto",
            alignItems: "baseline",
            gap: "0px 2px",
            marginTop: "10px",
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: "10px"
        });

        const marker = document.createElement("span");
        const addButton = document.createElement("button");
        Object.assign(addButton.style, {
            fontSize: "14px",
            backgroundColor: "transparent",
            gridColumn: "2 / span 2",
        });
        addButton.textContent = "Add new value (shift+⏎)";
        addButton.onclick = function () {
            const valueElement = add_new_value(dialog, "-", "", "", marker);
            valueElement.focus();
        };
        value_container.append(marker, addButton);

        const values = widgetName == "" ? [["", ""]] : get_values_array(groupName, widgetName);

        add_column_header(dialog, marker);
        values.forEach(([condition, value]) => {
            add_new_value(dialog, "-", condition, value, marker);
        });
        container.append(value_container);

        dialog.filter_counter.textContent = `0 / ${dialog.valueElements.length}`;
    }

    dialog.show(title);
    Object.assign(dialog.textElement.style, {
        marginTop: "0",
        marginBottom: "10px",
    });
    dialog.textElement.append(container);
    if (dialog.type === DialogType.EDIT) {
        setTimeout(() => {
            dialog.valueElements[dialog.valueElements.length - 1].focus();
            dialog.valueElements[dialog.valueElements.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
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

function add_column_header(dialog, marker) {
    const dummy = document.createElement("span");
    marker.before(dummy);

    const condition_element = document.createElement("label");
    Object.assign(condition_element.style, {
        paddingTop: "5px",
    })
    condition_element.textContent = "Condition";
    marker.before(condition_element);

    const value_element = document.createElement("label");
    value_element.textContent = "Value";
    marker.before(value_element);

    const dummy2 = document.createElement("span");
    marker.before(dummy2);
}

function add_new_value(dialog, label, condition, value, marker) {
    const labelElement = document.createElement("label");
    Object.assign(labelElement.style, {
        textAlign: "right",
        cursor: "move",
    });
    labelElement.textContent = label;
    labelElement.draggable = true;

    const condition_element = document.createElement("textarea");
    condition_element.classList.add("comfy-multiline-input");
    Object.assign(condition_element.style, {
        width: "150px",
        height: "3ex",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    })
    condition_element.value = condition;

    const valueElement = document.createElement("textarea");
    valueElement.classList.add("comfy-multiline-input");
    Object.assign(valueElement.style, {
        width: "300px",
        height: "3ex",
        fontSize: "14px",
        resize: "none",
        overflow: "hidden",
        borderRadius: "4px",
        padding: "2px 5px",
    });
    valueElement.value = value;

    // Setup drag and drop
    labelElement.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", dialog.valueElements.indexOf(valueElement));
    });
    labelElement.addEventListener("dragover", (e) => {
        e.preventDefault();
    });
    labelElement.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData("text/plain"));
        const targetIndex = dialog.valueElements.indexOf(valueElement);
        if (draggedIndex !== targetIndex) {
            const draggedValueElement = dialog.valueElements[draggedIndex];
            const draggedConditionElement = draggedValueElement.previousElementSibling;
            const draggedLabelElement = draggedConditionElement.previousElementSibling;
            const draggedDeleteButton = draggedValueElement.nextElementSibling;
            
            // Update array order
            dialog.valueElements.splice(draggedIndex, 1);
            dialog.valueElements.splice(targetIndex, 0, draggedValueElement);
            dialog.conditionElements.splice(draggedIndex, 1);
            dialog.conditionElements.splice(targetIndex, 0, draggedConditionElement);
            
            // Move DOM elements
            if (targetIndex > draggedIndex) {
                valueElement.nextElementSibling.after(draggedDeleteButton);
                valueElement.nextElementSibling.after(draggedValueElement);
                valueElement.nextElementSibling.after(draggedConditionElement);
                valueElement.nextElementSibling.after(draggedLabelElement);
            } else {
                labelElement.before(draggedLabelElement);
                draggedLabelElement.after(draggedConditionElement)
                draggedConditionElement.after(draggedValueElement);
                draggedValueElement.after(draggedDeleteButton);
            }
        }
    });
    
    // Shift+Enter to add new value
    valueElement.addEventListener("keydown", function(e) {
        if (e.shiftKey && e.key === "Enter") {
            e.preventDefault();
            const valueElement = add_new_value(dialog, "-", "", "", marker);
            valueElement.focus();
        }
    });
    
    dialog.valueElements.push(valueElement);
    dialog.conditionElements.push(condition_element);

    condition_element.addEventListener("input", () => { adjust_textarea_height(condition_element); });
    valueElement.addEventListener("input", () => { adjust_textarea_height(valueElement); });
    setTimeout(() => {
        adjust_textarea_height(valueElement);
        adjust_textarea_height(condition_element);
    }, 0);

    const deleteButton = document.createElement("button");
    Object.assign(deleteButton.style, {
        fontSize: "14px",
        backgroundColor: "transparent",
        padding: "0px",
        border: "none",
        cursor: "pointer",
        width: "16px",
        height: "16px",
        color: "var(--p-form-field-float-label-color)",
    });
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"> <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /> </svg>';
    deleteButton.onclick = function() {
        dialog.valueElements.splice(dialog.valueElements.indexOf(valueElement), 1);
        dialog.conditionElements.splice(dialog.conditionElements.indexOf(condition_element), 1);
        labelElement.remove();
        condition_element.remove();
        valueElement.remove();
        deleteButton.remove();
    }
    marker.before(labelElement, condition_element, valueElement, deleteButton);
    return valueElement;
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
        const match = str.match(/^(.*?)\s*=>\s*(.*)$/);
        return match ? [match[1], match[2]] : ["", str];
    });
}

export function join_group_key(group, key) {
    return group == "" ? key : `${group}/${key}`;
}