from . import wildcards

last_generated = {}

class WildPromptGenerator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            },
            "optional": cls.get_menu_list()
        }

    @staticmethod
    def get_menu_list():
        menu = []
        dict = wildcards.get_wildcard_dict()
        for k in dict:
            if k.startswith("m/"):
                menu.append(k)
        menu_list = {}
        for key in menu:
            values = [x.split("=>")[1].strip() if "=>" in x else x for x in dict[key]]
            menu_list[key[2:]] = (["disabled", "random"] + values, )
        return menu_list

    CATEGORY = "WildDivide"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "generate_prompt"

    def generate_prompt(self, **kwargs):
        global last_generated
        prompt, last_generated = wildcards.process("__m/template__", kwargs["seed"], kwargs)
        return { "ui": { "last_generated": last_generated.items() }, "result": (prompt, ) }

def get_last_generated():
    global last_generated
    return last_generated

NODE_CLASS_MAPPINGS = { "WildPromptGenerator": WildPromptGenerator }
NODE_DISPLAY_NAME_MAPPINGS = { "WildPromptGenerator": "Wild Prompt Generator" }