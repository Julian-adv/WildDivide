from server import PromptServer
from . import wildcards
from aiohttp import web


@PromptServer.instance.routes.get("/wilddivide/refresh")
async def wildcards_refresh(request):
    wildcards.wildcard_load()
    return web.Response(status=200)


@PromptServer.instance.routes.get("/wilddivide/wildcards/list")
async def wildcards_list(request):
    data = {"data": wildcards.get_wildcard_list()}
    return web.json_response(data)


@PromptServer.instance.routes.post("/wilddivide/wildcards")
async def populate_wildcards(request):
    data = await request.json()
    populated = wildcards.process(data["text"], data.get("seed", None))
    return web.json_response({"text": populated})


def onprompt_populate_wildcards(json_data):
    prompt = json_data["prompt"]

    updated_widget_values = {}
    for k, v in prompt.items():
        if "class_type" in v and (v["class_type"] == "WildcardDivide" or v["class_type"] == "WildcardEncode" or v["class_type"] == "WildcardProcessor"):
            inputs = v["inputs"]
            if inputs["mode"] and isinstance(inputs["populated_text"], str):
                if isinstance(inputs["seed"], list):
                    try:
                        input_node = prompt[inputs["seed"][0]]
                        if input_node["class_type"] == "ImpactInt":
                            input_seed = int(input_node["inputs"]["value"])
                            if not isinstance(input_seed, int):
                                continue
                        if input_node["class_type"] == "Seed (rgthree)":
                            input_seed = int(input_node["inputs"]["seed"])
                            if not isinstance(input_seed, int):
                                continue
                        else:
                            print(
                                f"[WildDivide] Only `ImpactInt`, `Seed (rgthree)` and `Primitive` Node are allowed as the seed for '{v['class_type']}'. It will be ignored. "
                            )
                            continue
                    except:
                        continue
                else:
                    input_seed = int(inputs["seed"])

                inputs["populated_text"] = wildcards.process(inputs["wildcard_text"], input_seed)
                inputs["mode"] = False

                PromptServer.instance.send_sync(
                    "impact-node-feedback",
                    {
                        "node_id": k,
                        "widget_name": "populated_text",
                        "type": "STRING",
                        "value": inputs["populated_text"],
                    },
                )
                updated_widget_values[k] = inputs["populated_text"]

    if "extra_data" in json_data and "extra_pnginfo" in json_data["extra_data"]:
        for node in json_data["extra_data"]["extra_pnginfo"]["workflow"]["nodes"]:
            key = str(node["id"])
            if key in updated_widget_values:
                node["widgets_values"][1] = updated_widget_values[key]
                node["widgets_values"][2] = False


def onprompt(json_data):
    try:
        onprompt_populate_wildcards(json_data)
        # core.current_prompt = json_data
    except Exception as e:
        print(f"[WARN] ComfyUI_WildDivide: Error on prompt - several features will not work.\n{e}")

    return json_data


PromptServer.instance.add_on_prompt_handler(onprompt)
