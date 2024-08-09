import torch
import folder_paths
from nodes import MAX_RESOLUTION, ConditioningCombine, ConditioningSetMask
from comfy_extras.nodes_mask import MaskComposite, SolidMask
from .attention_couple import AttentionCouple
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
        wildcard_text = kwargs["wildcard_text"]
        print(f"WildDivide {wildcard_text}")
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
                "split_1": (
                    "FLOAT",
                    {"default": 0.25, "min": 0, "max": 1.0, "step": 0.01},
                ),
                "split_2": (
                    "FLOAT",
                    {"default": 0.50, "min": 0, "max": 1.0, "step": 0.01},
                ),
                "split_3": (
                    "FLOAT",
                    {"default": 0.75, "min": 0, "max": 1.0, "step": 0.01},
                ),
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
        split_1=0.25,
        split_2=0.50,
        split_3=0.75,
    ):

        divisions = len(positives) - 1
        splits = [split_1[0], split_2[0], split_3[0]][: divisions - 1]

        # if len(positives) != divisions:
        #     raise ValueError(
        #         f"Number of additional positive conditionings ({len(positives)}) must match the number of divisions ({divisions})"
        #     )
        # Generate default splits based on divisions
        default_splits = self.generate_default_splits(divisions)

        # Use custom splits if provided, otherwise use default splits
        # custom_splits = [split_1, split_2, split_3][: divisions - 1]
        # splits = custom_splits if all(custom_splits) else default_splits
        splits = default_splits

        for i in range(1, len(splits)):
            if splits[i] <= splits[i - 1]:
                raise ValueError(f"split_{i+1} must be greater than split_{i}")

        mask_rects = self.calculate_mask_rects(orientation[0], divisions, splits, width[0], height[0])

        solid_mask_zero = SolidMask().solid(0.0, width[0], height[0])[0]
        solid_mask_one = SolidMask().solid(1.0, width[0], height[0])[0]
        mask_composites = []

        for rect in mask_rects:
            print(rect)
            solid_mask = SolidMask().solid(1.0, rect[2], rect[3])[0]
            mask_composite = MaskComposite().combine(solid_mask_zero, solid_mask, rect[0], rect[1], "add")[0]
            mask_composites.append(mask_composite)

        # Apply base conditioning (positive_base) to the entire image
        base_conditioning = ConditioningSetMask().append(positives[0], solid_mask_one, "default", 1.0)[0]

        # Apply additional conditionings to specific regions
        region_conditionings = [
            ConditioningSetMask().append(positive, mask_composite, "default", 1.0)[0]
            for positive, mask_composite in zip(positives[1:], mask_composites)
        ]

        # Combine all conditionings
        combined_conditioning = base_conditioning
        for cond in region_conditionings:
            combined_conditioning = ConditioningCombine().combine(combined_conditioning, cond)[0]
        # combined_conditioning = region_conditionings[0]
        # for cond in region_conditionings[1:]:
        #     combined_conditioning = ConditioningCombine().combine(combined_conditioning, cond)[0]

        max = 0
        for cond in combined_conditioning:
            print(cond[0].shape)
            max = cond[0].shape[1] if cond[0].shape[1] > max else max
        for cond in combined_conditioning:
            if cond[0].shape[1] < max:
                cond[0] = torch.cat(
                    [
                        cond[0],
                        torch.zeros(
                            (cond[0].shape[0], max - cond[0].shape[1], cond[0].shape[2]), device=cond[0].device
                        ),
                    ],
                    dim=1,
                )
                # cond[0] = torch.cat(
                #     [cond[0], cond[0]],
                #     dim=1,
                # )
                print(f"cat: {cond[0].shape}")
        return AttentionCouple().attention_couple(model[0], combined_conditioning, negative[0], "Attention")

    def generate_default_splits(self, divisions):
        return [i / divisions for i in range(1, divisions)]

    def calculate_mask_rects(self, orientation, divisions, splits, width, height):
        mask_rects = []

        if orientation == "horizontal":
            widths = [int(width * split) for split in splits] + [width]
            for i in range(divisions):
                x = 0 if i == 0 else widths[i - 1]
                w = widths[i] - x
                mask_rects.append((x, 0, w, height))
        elif orientation == "vertical":
            heights = [int(height * split) for split in splits] + [height]
            for i in range(divisions):
                y = 0 if i == 0 else heights[i - 1]
                h = heights[i] - y
                mask_rects.append((0, y, width, h))

        return mask_rects


import threading

threading.Thread(target=wildcards.wildcard_load).start()

NODE_CLASS_MAPPINGS = {"WildcardEncode": WildcardEncode, "Comfy Divide": ComfyDivide}
NODE_DISPLAY_NAME_MAPPINGS = {
    "WildcardEncode": "Wildcard Encode (triple)",
    "Comfy Divide": "Comfy Divide",
}
