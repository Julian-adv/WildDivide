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

### Child selection pattern

Starting each line with / selects the line that fits that pattern. For example, if you write

```yaml
outfit:
  - /skirt/ stockings
  - /pants/ socks
  - bare feet
```

If a _skirt_ was present at the prompt, _stockings_ would be selected, and if _pants_ were present,
_socks_ would be selected. If there was no matching pattern, _bare feet_ would be selected.

### Split region

You can use `[SEP]` to divide an image into different regions. The first `[SEP]` applies to the entire image, and each subsequent `[SEP]` divides the image into _n_ equal parts.

```yaml
scene: score_9 [SEP] blonde hair [SEP] black hair
```

For example, if written as above, `score_9` would be applied to the entire image, `blonde hair` would be applied to the left half of the image, `black hair` would be applied to the right half of the image.

## Comfy Divide

![Comfy Divide](docs/screenshot1.png)

- Connect `positives` to `positives` in `Wildcard Encode (divided)`.
- `split_1`, `split_2`, `split_3` are not working currently.
