# WildDivide

ComfyUI custom node that specifies wildcard prompts for multiple regions

![screenshot](docs/screenshot.png)
The above workflow is [docs/example.json](docs/example.json).

## Wildcard Encode (divided)

It has the same syntax as [Impact Pack Wildcards](https://github.com/ltdrdata/ComfyUI-extension-tutorials/blob/Main/ComfyUI-Impact-Pack/tutorial/ImpactWildcard.md).
In addition, it supports the following syntax

### Child selection weight

If you write a number at the beginning, that number becomes the weight to select that line.

```yaml
hair:
  - 4, blonde
  - 5, black
  - 1, red
```

For example, writing `__hair__` will select blonde with a 4/(4+5+1) = 4/10 probability.
If a number is omitted, it is assumed to be 1.
Functionally, this is the same as writing as below in [Impact Pack Wildcards](https://github.com/ltdrdata/ComfyUI-extension-tutorials/blob/Main/ComfyUI-Impact-Pack/tutorial/ImpactWildcard.md).

```yaml
hair:
  - { 4::blonde|5::black|1::red }
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
scene: blonde hair [SEP] black hair
```

For example, if written as above, `blonde hair` would be applied to the left half of the image, `black hair` would be applied to the right half of the image.

## Comfy Divide

![Comfy Divide](docs/screenshot1.png)

- Connect `positives` to `positives` in `Wildcard Encode (divided)`.
