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

### Pattern-Based Selection

Entries beginning with `/` are evaluated against the preceding prompt context. The system selects candidates based on pattern matches. Here's an example:

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

### Selection Logic

When `__outfit__` expands (with equal 1/3 probability for each option):

- If it resolves to `blouse, skirt`, then `__legs__` will select from either `stockings` or `bare feet`, as the `/skirt/` pattern matches the context.
- If it resolves to `shirt, pants`, then `__legs__` will select from either `socks` or `bare feet`, as the `/pants/` pattern matches the context.
- Entries without patterns (like `bare feet`) are always included in the candidate pool.

This allows for contextually appropriate selections based on previously expanded wildcards.

#### Pattern Alternatives

When a line includes `!`, the text after `!` will be selected when the pattern does not match the prompt. For example:

```yaml
outfit:
  - blouse, skirt
  - dress
  - swimsuit
legs:
  - /swimsuit/ bare feet ! stockings
```

In this example, `stockings` will be selected when the outfit doesn't contain `swimsuit` (i.e., when `blouse, skirt` or `dress` is selected). Conversely, if `swimsuit` is selected, `bare feet` will be chosen.

#### Exclusive Pattern Matching

When a pattern ends with `=`, it becomes an exclusive pattern that will remove all non-matching options from consideration. For example:

```yaml
outfit:
  - blouse, skirt
  - dress
  - swimsuit
legs:
  - /skirt/= stockings
  - bare feet
```

In this example:
- When `__outfit__` selects `blouse, skirt` (1/3 probability):
  - The `/skirt/=` pattern matches
  - Due to the `=` suffix, all non-matching options (in this case, `bare feet`) are excluded
  - Therefore, `stockings` will be selected with 100% probability

- When `__outfit__` selects either `dress` or `swimsuit`:
  - The `/skirt/=` pattern doesn't match
  - Only the non-pattern option `bare feet` remains available
  - Therefore, `bare feet` will be selected with 100% probability

#### Pattern Matching with Conditional Exclusion

The `=~` suffix creates a sophisticated pattern matching rule that combines conditional exclusion with fallback behavior. When a pattern ends with `=~`, it implements the following logic:

```yaml
outfit:
  - blouse, skirt
  - dress
  - swimsuit
legs:
  - /skirt/=~ stockings
  - bare feet
  - socks
```

This operates in two distinct modes:

1. **When Pattern Matches:**
   If `__outfit__` contains `skirt` (probability: 1/3):
   - The `/skirt/=~` pattern activates
   - All non-matching options (`bare feet`, `socks`) are excluded
   - `stockings` is selected with 100% probability

2. **When Pattern Fails:**
   If "skirt" is not present in `__outfit__`:
   - The pattern-matched option (`stockings`) remains in the candidate pool
   - All options become eligible for selection
   - Random selection occurs between `stockings`, `bare feet`, and `socks`

This mechanism provides a elegant way to enforce specific combinations while maintaining flexibility when conditions aren't met.

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

## Wild Prompt Generator Node

This node helps create prompts for the Wildcard Divide node.

![screenshot_generator](docs/screenshot_generator.png)

### Usage

#### Adding a New Slot

Click the **Add Slot** button to open a dialog where you can add a new slot to the wildcards file.

![screenshot_add_slot](docs/screenshot_add_slot.png)

After clicking **Save**, the wildcards will be stored in
 `custom_nodes/WildDivide/wildcards/m.yaml`.
For image generation, be sure to add a `template` slot. Use the format `__m/slot_name__` to
 reference other slots within the template.

![screenshot_add_template](docs/screenshot_add_template.png)

#### Configuring Slot Values

Select slot values from the dropdown menu:

![screenshot_slot_values](docs/screenshot_slot_values.png)

- _disabled_: Replaces the slot with an empty string.
- _random_: Randomly selects a value from the available options.
- _specific value_: Replaces `__m/slot__` with your selected value.

#### Retrieving Previous Random Values

The **Get last random values** button retrieves the most recently generated random
 selections, making it easier to fine-tune your prompt.

#### Creating Groups

Click the **Add group** button to create a new group of related slots.

![screenshot_add_group](docs/screenshot_add_group.png)

Use the format `__m/group/slot__` to reference slots within the group.
Make sure to update the `template` slot to include these group references.

![screenshot_edit_template](docs/screenshot_edit_template.png)

#### Reordering Slots

Rearrange slots easily using drag-and-drop functionality.

#### Viewing Random Selections

Check the box to display tooltips showing the last generated random values for each slot.

![screenshot_show_random](docs/screenshot_show_random.png)

#### Adding Conditions to Slot Values

You can apply conditions to slot values, which are evaluated against the prompt generated up to that point. For example:

![screenshot_condition](docs/screenshot_condition.png)

In this example, `brown eyes` is added to the candidate pool only if `black hair` is part of the prompt.

Special characters define conditions:

- `~`: Negates a pattern match.
- `&`: Logical AND.
- `|`: Logical OR.

For instance, `~(black hair|brown hair)` means the condition is true if neither `black hair` nor `brown hair` matches.

There are two candidate pools: **normal** and **exclusive**. You can control which pool a
 value is added to by ending the pattern with `?` or `=`:

| Pattern ends with | If Pattern Matches | If Pattern Does Not Match |
| --- | --- | --- |
| = | Added to the exclusive pool | Not added to any pool |
| ? | Added to the exclusive pool | Added to the normal pool |
| none | Added to the normal pool | Not added to any pool |

When selecting a value, the system prioritizes the exclusive pool if it’s not empty. Otherwise, it selects from the normal pool.

Examples:

![screenshot_normal_pool](docs/screenshot_normal_pool.png)

| Pattern | If Pattern Matches | If Pattern Does Not Match |
| --- | --- | --- |
| pants  | `stockings`, `thigh highs`, `socks` | `stockings`, `thigh highs` |
| pants= | `socks` | `stockings`, `thigh highs` |
| pants? | `socks` | `stockings`, `thigh highs`, `socks` |

In this case, if pants matches the prompt, the value is selected from the normal pool
(`stockings`, `thigh highs`, and `socks`). If not, `socks` is excluded, leaving only
`stockings` and `thigh highs` as options.

If the pattern is `pants=` and it matches, the value is chosen exclusively from the pool
(`socks`). If it doesn’t match, `socks` is excluded entirely, leaving only `stockings`
and `thigh highs`.

If the pattern is `pants?` and it matches, the value is chosen from the exclusive pool
(`socks`). If it doesn’t match, the value is selected from the normal pool
(`stockings`, `thigh highs`, and `socks`).