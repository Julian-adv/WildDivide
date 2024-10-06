# Wildcard Divide

ComfyUI custom node that specifies wildcard prompts for multiple regions

![screenshot](docs/screenshot.png)
The above workflow is [docs/example.json](docs/example.json).

## Wildcard Divide Node

This node incorporates the syntax of [Impact Pack Wildcards](https://github.com/ltdrdata/ComfyUI-extension-tutorials/blob/Main/ComfyUI-Impact-Pack/tutorial/ImpactWildcard.md) while introducing additional syntactical features.

### Weighted Child Selection

You can assign selection weights to options by prefixing them with a numerical value. This number determines the likelihood of that particular option being chosen.

```yaml
hair:
  - 4, blonde
  - 5, black
  - 1, red
```

In this example, invoking `__hair__` will result in "blonde" being selected with a probability of 4/(4+5+1) = 4/10 = 0.4.
When a numerical prefix is omitted, a default weight of 1 is assumed.

This weighted selection mechanism is functionally equivalent to the following syntax in [Impact Pack Wildcards](https://github.com/ltdrdata/ComfyUI-extension-tutorials/blob/Main/ComfyUI-Impact-Pack/tutorial/ImpactWildcard.md):

```yaml
hair:
  - {4::blonde|5::black|1::red}
```

### Pattern-based Child Selection

Lines beginning with `/` are selected when the pattern matches the prompt up to that point. For example:

```yaml
outfit:
  - blouse, skirt, __legs__
  - shirt, pants, __legs__
  - swimsuit, __legs__
legs:
  - /skirt/ stockings
  - /pants/ socks
  - bare feet
```

If `__outfit__` expands to `blouse, skirt` (with a 1/3 probability), `__legs__` will subsequently expand to `stockings` because the `/skirt/` pattern matches.
In cases where no pattern matches (e.g., when `swimsuit` is selected), the default option `bare feet` would be chosen.

Lines starting with `/!` are selected when the pattern does not match the prompt. For instance:

```yaml
outfit:
  - blouse, skirt
  - dress
  - swimsuit
legs:
  - /!swimsuit/ stockings
  - bare feet
```

Here, `stockings` would be selected for any outfit that doesn't include `swimsuit` (i.e., `blouse, skirt` or `dress`).

Lines starting with `+/` (or `+/!`) add the corresponding option to the list of candidates when the pattern matches (or doesn't match) the prompt, rather than replacing the existing options. For example:

```yaml
outfit:
  - blouse, skirt
  - dress
  - swimsuit
legs:
  - +/skirt/ stockings
  - bare feet
```

In this scenario, if `__outfit__` expands to `blouse, skirt` (with a 1/3 probability), the `/skirt/` pattern will match. Consequently, `stockings` will be added to the list of candidates for `__legs__`, resulting in two options: `stockings` and `bare feet`. The final selection will then be made randomly from these two options, each with an equal probability.

### Split region

You can use `[SEP]` to divide an image into different regions. Each `[SEP]` divides the image into _n_ equal parts.

```yaml
scene: 2girls [SEP] blonde hair [SEP] black hair
```

For example, if written as above, `2girls` would be applied to the entire image, `blonde hair` to the left half of the image, and `black hair` to the right half.

### Split Direction

You can specify the orientation of the split using the `opt:horizontal` and `opt:vertical` options.

```yaml
scene:
  - opt:horizontal 2girls [SEP] blonde hair [SEP] black hair
  - opt:vertical sky [SEP] blue sky [SEP] red sky
```

This syntax allows for precise control over image segmentation:

1. Horizontal Split (Left to Right):
   If the first option is selected, the image is divided horizontally. In this case:
   - `2girls` applies to the entire image
   - `blonde hair` is applied to the left half
   - `black hair` is applied to the right half

2. Vertical Split (Top to Bottom):
   If the second option is chosen, the image is segmented vertically:
   - `sky` is applied across the entire image
   - `blue sky` affects the top half
   - `red sky` influences the bottom half

### Image Size Specification

You can define the dimensions of the output image using the `opt:`_width_`x`_height_ syntax. This feature allows for dynamic image size adjustment based on the selected option.

```yaml
scene:
  - opt:1216x832 2girls [SEP] blonde hair [SEP] black hair
  - opt:832x1216 sky [SEP] blue sky [SEP] red sky
```

In this example, selecting the second option would result in an image with dimensions of 832x1216 pixels.

To implement this functionality, ensure that you connect the width and height outputs to the empty latent image node in your workflow. This connection enables the dynamic resizing of the output based on the specified dimensions.
