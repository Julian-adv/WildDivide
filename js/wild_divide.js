import { ComfyApp, app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let wildcards_list = [];
async function load_wildcards() {
  let res = await api.fetchApi("/wilddivide/wildcards/list");
  let data = await res.json();
  wildcards_list = data.data;
}

load_wildcards();

export function get_wildcards_list() {
  return wildcards_list;
}

app.registerExtension({
  name: "Wild.Divide",
  nodeCreated(node, app) {
    if (node.comfyClass == "WildcardEncode" || node.comfyClass == "WildcardDivide") {
      node._value = "Select the LoRA to add to the text";
      node._wvalue = "Select the Wildcard to add to the text";

      var tbox_id = 0;
      var combo_id = 3;
      var has_lora = true;

      switch (node.comfyClass) {
        case "WildcardEncode":
        case "WildcardDivide":
          tbox_id = 0;
          combo_id = 3;
          break;
      }

      Object.defineProperty(node.widgets[combo_id + 1], "value", {
        set: (value) => {
          const stackTrace = new Error().stack;
          if (stackTrace.includes("inner_value_change")) {
            if (value != "Select the Wildcard to add to the text") {
              if (node.widgets[tbox_id].value != "")
                node.widgets[tbox_id].value += ", ";

              node.widgets[tbox_id].value += value;
            }
          }
        },
        get: () => {
          return "Select the Wildcard to add to the text";
        },
      });

      Object.defineProperty(node.widgets[combo_id + 1].options, "values", {
        set: (x) => {},
        get: () => {
          return wildcards_list;
        },
      });

      if (has_lora) {
        Object.defineProperty(node.widgets[combo_id], "value", {
          set: (value) => {
            const stackTrace = new Error().stack;
            if (stackTrace.includes("inner_value_change")) {
              if (value != "Select the LoRA to add to the text") {
                let lora_name = value;
                if (lora_name.endsWith(".safetensors")) {
                  lora_name = lora_name.slice(0, -12);
                }

                node.widgets[tbox_id].value += `<lora:${lora_name}>`;
                if (node.widgets_values) {
                  node.widgets_values[tbox_id] = node.widgets[tbox_id].value;
                }
              }
            }

            node._value = value;
          },

          get: () => {
            return "Select the LoRA to add to the text";
          },
        });
      }

      // Preventing validation errors from occurring in any situation.
      if (has_lora) {
        node.widgets[combo_id].serializeValue = () => {
          return "Select the LoRA to add to the text";
        };
      }
      node.widgets[combo_id + 1].serializeValue = () => {
        return "Select the Wildcard to add to the text";
      };
    }

    if (node.comfyClass == "WildcardEncode" || node.comfyClass == "WildcardDivide") {
      node.widgets[0].inputEl.placeholder = "Wildcard Prompt (User input)";
      node.widgets[1].inputEl.placeholder =
        "Populated Prompt (Will be generated automatically)";
      node.widgets[1].inputEl.disabled = true;

      const populated_text_widget = node.widgets.find(
        (w) => w.name == "populated_text"
      );
      const mode_widget = node.widgets.find((w) => w.name == "mode");

      // mode combo
      Object.defineProperty(mode_widget, "value", {
        set: (value) => {
          node._mode_value = value == true || value == "Populate";
          populated_text_widget.inputEl.disabled =
            value == true || value == "Populate";
        },
        get: () => {
          if (node._mode_value != undefined) return node._mode_value;
          else return true;
        },
      });
    }
  },
});
