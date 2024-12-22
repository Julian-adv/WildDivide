from . import wildcards

last_generated = {}

class WildPromptGenerator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "auto_template": ("BOOLEAN",),
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
            def process_value(x):
                if "=>" in x:
                    right_part = x.split("=>")[1].strip()
                else:
                    right_part = x.strip()
                if "," in right_part:
                    parts = right_part.split(",", 1)
                    try:
                        float(parts[0].strip())
                        return parts[1].strip()
                    except ValueError:
                        pass
                return right_part
            
            values = [process_value(x) for x in dict[key]]
            menu_list[key[2:]] = (["disabled", "random"] + values, )
        return menu_list

    CATEGORY = "WildDivide"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "generate_prompt"

    def generate_prompt(self, **kwargs):
        global last_generated

        if kwargs["auto_template"]:
            template = self.generate_template(**kwargs)
        else:
            template = "__m/template__"
        print(template)

        prompt, last_generated = wildcards.process(template, kwargs["seed"], kwargs)
        return { "ui": { "last_generated": last_generated.items() }, "result": (prompt, ) }

    def generate_template(self, **kwargs):
        template = ""
        prev_group = ""
        group = ""
        for k in kwargs:
            if kwargs[k] == "disabled" or k == "seed" or k == "auto_template" or k == "template":
                continue
            if "/" in k:
                group = k.split("/")[0]
                if group != prev_group:
                    prev_group = group
                    template += "[SEP] "
            if kwargs[k] == "random":
                template += f"__m/{k}__, "
                continue
            template += f"{kwargs[k]}, "
        return template

def get_last_generated():
    global last_generated
    return last_generated

NODE_CLASS_MAPPINGS = { "WildPromptGenerator": WildPromptGenerator }
NODE_DISPLAY_NAME_MAPPINGS = { "WildPromptGenerator": "Wild Prompt Generator" }