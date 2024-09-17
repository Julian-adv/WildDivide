import torch
import folder_paths
from nodes import MAX_RESOLUTION, ConditioningCombine, ConditioningSetMask
from comfy_extras.nodes_mask import MaskComposite, SolidMask
from .attention_couple import AttentionCoupleWildDivide
from . import wildcards


class WildcardEncode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "wildcard_text": (
                    "STRING",
                    {"multiline": True, "dynamicPrompts": False},
                ),
                "populated_text": (
                    "STRING",
                    {"multiline": True, "dynamicPrompts": False},
                ),
                "mode": (
                    "BOOLEAN",
                    {"default": True, "label_on": "Populate", "label_off": "Fixed"},
                ),
                "Select to add LoRA": (
                    ["Select the LoRA to add to the text"] + folder_paths.get_filename_list("loras"),
                ),
                "Select to add Wildcard": (["Select the Wildcard to add to the text"],),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            },
        }

    CATEGORY = "WildDivide"

    RETURN_TYPES = (
        "MODEL",
        "CLIP",
        "CONDITIONING",
        "STRING",
    )
    RETURN_NAMES = (
        "model",
        "clip",
        "positives",
        "populated_text",
    )
    OUTPUT_IS_LIST = (False, False, True, False)
    FUNCTION = "doit"

    @staticmethod
    def process_with_loras(**kwargs):
        return wildcards.process_with_loras(**kwargs)

    @staticmethod
    def get_wildcard_list():
        return wildcards.get_wildcard_list()

    def doit(self, *args, **kwargs):
        populated = kwargs["populated_text"]
        processed = []
        model, clip, positives = wildcards.process_with_loras(
            wildcard_opt=populated,
            model=kwargs["model"],
            clip=kwargs["clip"],
            seed=kwargs["seed"],
            processed=processed,
        )
        return model, clip, positives, processed[0]


class ComfyDivide:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "positives": ("CONDITIONING",),  # Base conditioning for the entire image
                "negative": ("CONDITIONING",),
                "orientation": (["horizontal", "vertical"],),
                "width": (
                    "INT",
                    {"default": 512, "min": 16, "max": MAX_RESOLUTION, "step": 8},
                ),
                "height": (
                    "INT",
                    {"default": 512, "min": 16, "max": MAX_RESOLUTION, "step": 8},
                ),
            },
            "optional": {
                "overall": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = (
        "MODEL",
        "CONDITIONING",
        "CONDITIONING",
    )
    RETURN_NAMES = (
        "model",
        "positive",
        "negative",
    )
    INPUT_IS_LIST = True
    FUNCTION = "process"
    CATEGORY = "WildDivide"

    def process(
        self,
        model,
        positives,
        negative,
        orientation,
        width,
        height,
        overall=True,
    ):

        divisions = len(positives)
        if divisions == 1:
            overall = False
        if overall:
            divisions -= 1
        if divisions <= 0:
            raise Exception("Divisions should be more than 0")

        mask_rects = self.calculate_mask_rects(orientation[0], divisions, width[0], height[0])
        if overall:
            mask_rects.insert(0, (0, 0, width[0], height[0]))

        for i in range(len(mask_rects)):
            print(f"mask_rects[{i}]: {mask_rects[i]}")

        solid_mask_zero = SolidMask().solid(0.0, width[0], height[0])[0]
        solid_masks = [SolidMask().solid(1.0, rect[2], rect[3])[0] for rect in mask_rects]
        mask_composites = [
            MaskComposite().combine(solid_mask_zero, solid_mask, rect[0], rect[1], "add")[0]
            for rect, solid_mask in zip(mask_rects, solid_masks)
        ]
        conditioning_masks = [
            ConditioningSetMask().append(positive, mask_composite, "default", 1.0)[0]
            for positive, mask_composite in zip(positives, mask_composites)
        ]

        positive_combined = conditioning_masks[0]
        for i in range(1, len(conditioning_masks)):
            positive_combined = ConditioningCombine().combine(positive_combined, conditioning_masks[i])[0]
        max_length = max([cond[0].shape[1] for cond in positive_combined])
        for cond in positive_combined:
            if cond[0].shape[1] < max_length:
                pad_length = max_length - cond[0].shape[1]
                last_token_embedding = cond[0][:, -1:, :]
                padding = last_token_embedding.repeat(1, pad_length, 1)
                cond[0] = torch.cat([cond[0], padding], dim=1)
        return AttentionCoupleWildDivide().attention_couple(model[0], positive_combined, negative[0], "Attention")

    def calculate_mask_rects(self, orientation, divisions, width, height):
        mask_rects = []

        if orientation == "horizontal":
            rect_width = width // divisions
            for i in range(divisions):
                x = i * rect_width
                w = rect_width if i < divisions - 1 else width - x
                mask_rects.append((x, 0, w, height))
        elif orientation == "vertical":
            rect_height = height // divisions
            for i in range(divisions):
                y = i * rect_height
                h = rect_height if i < divisions - 1 else height - y
                mask_rects.append((0, y, width, h))

        return mask_rects


import threading

threading.Thread(target=wildcards.wildcard_load).start()

NODE_CLASS_MAPPINGS = {"WildcardEncode": WildcardEncode, "Comfy Divide": ComfyDivide}
NODE_DISPLAY_NAME_MAPPINGS = {
    "WildcardEncode": "Wildcard Encode (divided)",
    "Comfy Divide": "Comfy Divide",
}
