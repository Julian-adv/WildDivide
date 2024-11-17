from . import wildcards

class WildPromptGenerator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": cls.get_menu_list()
        }

    @staticmethod
    def get_menu_list():
        menu = []
        dict = wildcards.get_wildcard_dict()
        for k in dict:
            if k.startswith("m/"):
                menu.append(k)
        menu_list = { "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF})}
        for key in menu:
            menu_list[key[2:]] = (["disabled", "random"] + dict[key], )
        return menu_list

    CATEGORY = "WildDivide"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "generate_prompt"

    def generate_prompt(self, **kwargs):
        prompt = wildcards.process("__m/template__", kwargs["seed"])
        return (prompt,)


NODE_CLASS_MAPPINGS = { "WildPromptGenerator": WildPromptGenerator }
NODE_DISPLAY_NAME_MAPPINGS = { "WildPromptGenerator": "Wild Prompt Generator" }