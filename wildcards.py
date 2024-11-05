import re
import random
import os
import nodes
import folder_paths
import yaml
import numpy as np
import threading


wildcards_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "wildcards"))
default_wildcards_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "wildcards"))

RE_WildCardQuantifier = re.compile(r"(?P<quantifier>\d+)#__(?P<keyword>[\w.\-+/*\\]+)__", re.IGNORECASE)
wildcard_lock = threading.Lock()
wildcard_dict = {}


def get_wildcard_list():
    with wildcard_lock:
        return [f"__{x}__" for x in wildcard_dict.keys()]


def get_wildcard_dict():
    global wildcard_dict
    with wildcard_lock:
        return wildcard_dict


def wildcard_normalize(x):
    return x.replace("\\", "/").replace(" ", "-").lower()


def read_wildcard(k, v):
    if isinstance(v, list):
        k = wildcard_normalize(k)
        wildcard_dict[k] = v
    elif isinstance(v, dict):
        for k2, v2 in v.items():
            new_key = f"{k}/{k2}"
            new_key = wildcard_normalize(new_key)
            read_wildcard(new_key, v2)
    elif isinstance(v, str):
        k = wildcard_normalize(k)
        wildcard_dict[k] = [v]


def read_wildcard_dict(wildcard_path):
    global wildcard_dict
    for root, directories, files in os.walk(wildcard_path, followlinks=True):
        for file in files:
            if file.endswith(".txt"):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, wildcard_path)
                key = wildcard_normalize(os.path.splitext(rel_path)[0])

                try:
                    with open(file_path, "r", encoding="ISO-8859-1") as f:
                        lines = f.read().splitlines()
                        wildcard_dict[key] = lines
                except yaml.reader.ReaderError:
                    with open(file_path, "r", encoding="UTF-8", errors="ignore") as f:
                        lines = f.read().splitlines()
                        wildcard_dict[key] = lines
            elif file.endswith(".yaml"):
                file_path = os.path.join(root, file)

                try:
                    with open(file_path, "r", encoding="ISO-8859-1") as f:
                        yaml_data = yaml.load(f, Loader=yaml.FullLoader)
                except yaml.reader.ReaderError as e:
                    print(f"Error reading {file_path}: {e}")
                    with open(file_path, "r", encoding="UTF-8", errors="ignore") as f:
                        yaml_data = yaml.load(f, Loader=yaml.FullLoader)

                for k, v in yaml_data.items():
                    read_wildcard(k, v)

    return wildcard_dict


def process_comment_out(text):
    lines = text.split("\n")

    lines0 = []
    flag = False
    for line in lines:
        if line.lstrip().startswith("#"):
            flag = True
            continue

        if len(lines0) == 0:
            lines0.append(line)
        elif flag:
            lines0[-1] += " " + line
            flag = False
        else:
            lines0.append(line)

    return "\n".join(lines0)


def weighted_random_choice(items):
    weighted_items = []
    total_weight = 0.0
    num_choices = 1
    start_index = 0

    if len(items) > 0:
        r = re.match(r"^ *([0-9]+)~([0-9]+) *$", items[0])
        if r is not None:
            num_choices = random.randint(int(r.group(1)), int(r.group(2)))
            start_index = 1

    for item in items[start_index:]:
        parts = item.split(",", 1)  # split on first comma
        if is_numeric_string(parts[0].strip()):
            weight = float(parts[0].strip())
            content = parts[1] if len(parts) > 1 else ""
        else:
            weight = 1.0
            content = item

        total_weight += weight
        weighted_items.append((weight, content))

    choices = []
    available_items = weighted_items.copy()
    for _ in range(min(num_choices, len(weighted_items))):
        r = random.uniform(0.0, total_weight)
        current_weight = 0.0

        for i, (weight, content) in enumerate(available_items):
            current_weight += weight
            if r <= current_weight:
                choices.append(content)
                available_items.pop(i)
                break

        total_weight = sum(weight for weight, _ in available_items)

    if len(choices) == 0:
        choices = [""]

    return ",".join(choices)


def process(text, seed=None):
    text = process_comment_out(text)

    if seed is not None:
        random.seed(seed)
    random_gen = np.random.default_rng(seed)

    local_wildcard_dict = get_wildcard_dict()

    def replace_options(string):
        replacements_found = False

        def replace_option(match):
            nonlocal replacements_found
            options = match.group(1).split("|")

            multi_select_pattern = options[0].split("$$")
            select_range = None
            select_sep = " "
            range_pattern = r"(\d+)(-(\d+))?"
            range_pattern2 = r"-(\d+)"
            wildcard_pattern = r"__([\w.\-+/*\\]+)__"

            if len(multi_select_pattern) > 1:
                r = re.match(range_pattern, options[0])

                if r is None:
                    r = re.match(range_pattern2, options[0])
                    a = "1"
                    b = r.group(1).strip()
                else:
                    a = r.group(1).strip()
                    b = r.group(3)
                    if b is not None:
                        b = b.strip()

                if r is not None:
                    if b is not None and is_numeric_string(a) and is_numeric_string(b):
                        # PATTERN: num1-num2
                        select_range = int(a), int(b)
                    elif is_numeric_string(a):
                        # PATTERN: num
                        x = int(a)
                        select_range = (x, x)

                    if select_range is not None and len(multi_select_pattern) == 2:
                        # PATTERN: count$$
                        matches = re.findall(wildcard_pattern, multi_select_pattern[1])
                        if len(options) == 1 and matches:
                            # count$$<single wildcard>
                            options = local_wildcard_dict.get(matches[0])
                        else:
                            # count$$opt1|opt2|...
                            options[0] = multi_select_pattern[1]
                    elif select_range is not None and len(multi_select_pattern) == 3:
                        # PATTERN: count$$ sep $$
                        select_sep = multi_select_pattern[1]
                        options[0] = multi_select_pattern[2]

            adjusted_probabilities = []

            total_prob = 0

            for option in options:
                parts = option.split("::", 1)
                if len(parts) == 2 and is_numeric_string(parts[0].strip()):
                    config_value = float(parts[0].strip())
                else:
                    config_value = 1  # Default value if no configuration is provided

                adjusted_probabilities.append(config_value)
                total_prob += config_value

            normalized_probabilities = [prob / total_prob for prob in adjusted_probabilities]

            if select_range is None:
                select_count = 1
            else:
                select_count = random_gen.integers(low=select_range[0], high=select_range[1] + 1, size=1)

            if select_count > len(options):
                random_gen.shuffle(options)
                selected_items = options
            else:
                selected_items = random_gen.choice(
                    options,
                    p=normalized_probabilities,
                    size=select_count,
                    replace=False,
                )

            selected_items2 = [re.sub(r"^\s*[0-9.]+::", "", x, 1) for x in selected_items]
            replacement = select_sep.join(selected_items2)
            if "::" in replacement:
                pass

            replacements_found = True
            return replacement

        pattern = r"{([^{}]*?)}"
        replaced_string = re.sub(pattern, replace_option, string)

        return replaced_string, replacements_found

    def regexp_or_weighted_choice(items, prefix):
        always_items = []
        conditional_items = []
        for item in items:
            if item is None or not isinstance(item, str):
                always_items.append("")
            elif item.startswith("/"):
                pattern, replacement = item[1:].split("/", 1)
                if re.search(pattern, prefix, re.IGNORECASE):
                    conditional_items.append(replacement if replacement is not None else "")
            elif item.startswith("+/"):
                pattern, replacement = item[2:].split("/", 1)
                if re.search(pattern, prefix, re.IGNORECASE):
                    always_items.append(replacement if replacement is not None else "")
            elif item.startswith("-/"):
                pattern, replacement = item[2:].split("/", 1)
                if not re.search(pattern, prefix, re.IGNORECASE):
                    always_items.append(replacement if replacement is not None else "")
            elif item.startswith("/!"):
                pattern, replacement = item[2:].split("/", 1)
                if not re.search(pattern, prefix, re.IGNORECASE):
                    conditional_items.append(replacement if replacement is not None else "")
            elif item.startswith("+/!"):
                pattern, replacement = item[3:].split("/", 1)
                if not re.search(pattern, prefix, re.IGNORECASE):
                    always_items.append(replacement if replacement is not None else "")
            else:
                always_items.append(item)
        if len(conditional_items) > 0:
            return weighted_random_choice(conditional_items)
        if len(always_items) == 0:
            return ""
        return weighted_random_choice(always_items)

    def replace_wildcard(string):
        pattern = r"__([\w.\-+/*\\]+)__"
        match = re.search(pattern, string)

        replacements_found = False

        if match is not None:
            match_str = match.group(1)
            keyword = match_str.lower()
            keyword = wildcard_normalize(keyword)
            if keyword in local_wildcard_dict:
                # replacement = random_gen.choice(local_wildcard_dict[keyword])
                replacement = regexp_or_weighted_choice(local_wildcard_dict[keyword], string[:match.start()])
                replacements_found = True
                string = string.replace(f"__{match_str}__", replacement, 1)
            elif "*" in keyword:
                subpattern = keyword.replace("*", ".*").replace("+", "\\+")
                total_patterns = []
                found = False
                for k, v in local_wildcard_dict.items():
                    if re.match(subpattern, k) is not None or re.match(subpattern, k + "/") is not None:
                        total_patterns += v
                        found = True

                if found:
                    replacement = regexp_or_weighted_choice(total_patterns, string[:match.start()])
                    replacements_found = True
                    string = string.replace(f"__{match_str}__", replacement, 1)
            elif "/" not in keyword:
                string_fallback = string.replace(f"__{match_str}__", f"__*/{match_str}__", 1)
                string, replacements_found = replace_wildcard(string_fallback)

        return string, replacements_found

    replace_depth = 1000
    stop_unwrap = False
    while not stop_unwrap and replace_depth > 1:
        replace_depth -= 1  # prevent infinite loop

        option_quantifier = [e.groupdict() for e in RE_WildCardQuantifier.finditer(text)]
        for match in option_quantifier:
            keyword = match["keyword"].lower()
            quantifier = int(match["quantifier"]) if match["quantifier"] else 1
            replacement = "__|__".join(
                [
                    keyword,
                ]
                * quantifier
            )
            wilder_keyword = keyword.replace("*", "\\*")
            RE_TEMP = re.compile(rf"(?P<quantifier>\d+)#__(?P<keyword>{wilder_keyword})__", re.IGNORECASE)
            text = RE_TEMP.sub(f"__{replacement}__", text)

        # pass1: replace options
        pass1, is_replaced1 = replace_options(text)

        while is_replaced1:
            pass1, is_replaced1 = replace_options(pass1)

        # pass2: replace wildcards
        text, is_replaced2 = replace_wildcard(pass1)
        stop_unwrap = not is_replaced1 and not is_replaced2

    return text


def is_numeric_string(input_str):
    return re.match(r"^-?\d+(\.\d+)?$", input_str) is not None


def safe_float(x):
    if is_numeric_string(x):
        return float(x)
    else:
        return 1.0


def extract_lora_values(string):
    pattern = r"<lora:([^>]+)>"
    matches = re.findall(pattern, string)

    def touch_lbw(text):
        return re.sub(r"LBW=[A-Za-z][A-Za-z0-9_-]*:", r"LBW=", text)

    items = [touch_lbw(match.strip(":")) for match in matches]

    added = set()
    result = []
    for item in items:
        item = item.split(":")

        lora = None
        a = None
        b = None
        lbw = None
        lbw_a = None
        lbw_b = None

        if len(item) > 0:
            lora = item[0]

            for sub_item in item[1:]:
                if is_numeric_string(sub_item):
                    if a is None:
                        a = float(sub_item)
                    elif b is None:
                        b = float(sub_item)
                elif sub_item.startswith("LBW="):
                    for lbw_item in sub_item[4:].split(";"):
                        if lbw_item.startswith("A="):
                            lbw_a = safe_float(lbw_item[2:].strip())
                        elif lbw_item.startswith("B="):
                            lbw_b = safe_float(lbw_item[2:].strip())
                        elif lbw_item.strip() != "":
                            lbw = lbw_item

        if a is None:
            a = 1.0
        if b is None:
            b = a

        if lora is not None and lora not in added:
            result.append((lora, a, b, lbw, lbw_a, lbw_b))
            added.add(lora)

    return result


def remove_lora_tags(string):
    pattern = r"<lora:[^>]+>"
    result = re.sub(pattern, "", string)

    return result


def resolve_lora_name(lora_name_cache, name):
    if os.path.exists(name):
        return name
    else:
        if len(lora_name_cache) == 0:
            lora_name_cache.extend(folder_paths.get_filename_list("loras"))

        for x in lora_name_cache:
            if x.endswith(name):
                return x


def process_pass1(pass1, lora_name_cache, model, clip, clip_encoder=None, seed=None, processed=None):
    loras = extract_lora_values(pass1)
    pass2 = remove_lora_tags(pass1)

    for lora_name, model_weight, clip_weight, lbw, lbw_a, lbw_b in loras:
        lora_name_ext = lora_name.split(".")
        if ("." + lora_name_ext[-1]) not in folder_paths.supported_pt_extensions:
            lora_name = lora_name + ".safetensors"

        orig_lora_name = lora_name
        lora_name = resolve_lora_name(lora_name_cache, lora_name)

        if lora_name is not None:
            path = folder_paths.get_full_path("loras", lora_name)
        else:
            path = None

        if path is not None:
            print(f"LOAD LORA: {lora_name}: {model_weight}, {clip_weight}, LBW={lbw}, A={lbw_a}, B={lbw_b}")

            def default_lora():
                return nodes.LoraLoader().load_lora(model, clip, lora_name, model_weight, clip_weight)

            if lbw is not None:
                if "LoraLoaderBlockWeight //Inspire" not in nodes.NODE_CLASS_MAPPINGS:
                    # utils.try_install_custom_node(
                    #     'https://github.com/ltdrdata/ComfyUI-Inspire-Pack',
                    #     "To use 'LBW=' syntax in wildcards, 'Inspire Pack' extension is required.")

                    print(
                        f"'LBW(Lora Block Weight)' is given, but the 'Inspire Pack' is not installed. The LBW= attribute is being ignored."
                    )
                    model, clip = default_lora()
                else:
                    cls = nodes.NODE_CLASS_MAPPINGS["LoraLoaderBlockWeight //Inspire"]
                    model, clip, _ = cls().doit(
                        model,
                        clip,
                        lora_name,
                        model_weight,
                        clip_weight,
                        False,
                        0,
                        lbw_a,
                        lbw_b,
                        "",
                        lbw,
                    )
            else:
                model, clip = default_lora()
        else:
            print(f"LORA NOT FOUND: {orig_lora_name}")

    pass3 = [x.strip() for x in pass2.split("BREAK")]
    pass3 = [x for x in pass3 if x != ""]

    if len(pass3) == 0:
        pass3 = [""]

    result = None

    for prompt in pass3:
        if clip_encoder is None:
            cur = nodes.CLIPTextEncode().encode(clip, prompt)[0]
        else:
            cur = clip_encoder.encode(clip, prompt)[0]

        if result is not None:
            result = nodes.ConditioningConcat().concat(result, cur)[0]
        else:
            result = cur

    if processed is not None:
        processed.append(pass1)
        processed.append(pass2)
        processed.append(pass3)
    return model, clip, result

def extract_options(text):
    """
    Extracts all options starting with 'opt:' from the text and removes them.
    
    :param text: Text to process
    :return: (Modified text, Options dictionary)
    """
    options = {}
    pattern = r'opt:(\w+)'
    
    def replace_option(match):
        option = match.group(1)
        size_match = re.match(r'(\d+)x(\d+)', option)
        if size_match:
            options['width'] = int(size_match.group(1))
            options['height'] = int(size_match.group(2))
        else:
            options[option] = True
        return ''
    
    # Find options, remove them, and store in dictionary
    modified_text = re.sub(pattern, replace_option, text)
    return modified_text, options

def process_with_loras(wildcard_opt, model, clip, clip_encoder=None, seed=None, processed=None):
    """
    process wildcard text including loras

    :param wildcard_opt: wildcard text
    :param model: model
    :param clip: clip
    :param clip_encoder: you can pass custom encoder such as adv_cliptext_encode
    :param seed: seed for populating
    :param processed: output variable - [pass1, pass2, pass3] will be saved into passed list
    :return: model, clip, conditioning, options
    """

    lora_name_cache = []

    pass1_result = process(wildcard_opt, seed)
    pass1_result, options = extract_options(pass1_result)
    pass1_parts = pass1_result.split("[SEP]")
    result = []

    for part in pass1_parts:
        model, clip, part_result = process_pass1(part, lora_name_cache, model, clip, clip_encoder, seed, processed)
        result.append(part_result)

    return model, clip, result, options


def starts_with_regex(pattern, text):
    regex = re.compile(pattern)
    return bool(regex.match(text))


def split_to_dict(text):
    pattern = r"\[([A-Za-z0-9_. ]+)\]([^\[]+)(?=\[|$)"
    matches = re.findall(pattern, text)

    result_dict = {key: value.strip() for key, value in matches}

    return result_dict


class WildcardChooser:
    def __init__(self, items, randomize_when_exhaust):
        self.i = 0
        self.items = items
        self.randomize_when_exhaust = randomize_when_exhaust

    def get(self, seg):
        if self.i >= len(self.items):
            self.i = 0
            if self.randomize_when_exhaust:
                random.shuffle(self.items)

        item = self.items[self.i]
        self.i += 1

        return item


class WildcardChooserDict:
    def __init__(self, items):
        self.items = items

    def get(self, seg):
        text = ""
        if "ALL" in self.items:
            text = self.items["ALL"]

        if seg.label in self.items:
            text += self.items[seg.label]

        return text


def split_string_with_sep(input_string):
    sep_pattern = r"\[SEP(?:\:\w+)?\]"

    substrings = re.split(sep_pattern, input_string)

    result_list = [None]
    matches = re.findall(sep_pattern, input_string)
    for i, substring in enumerate(substrings):
        result_list.append(substring)
        if i < len(matches):
            if matches[i] == "[SEP]":
                result_list.append(None)
            elif matches[i] == "[SEP:R]":
                result_list.append(random.randint(0, 1125899906842624))
            else:
                try:
                    seed = int(matches[i][5:-1])
                except:
                    seed = None
                result_list.append(seed)

    iterable = iter(result_list)
    return list(zip(iterable, iterable))


def process_wildcard_for_segs(wildcard):
    if wildcard.startswith("[LAB]"):
        raw_items = split_to_dict(wildcard)

        items = {}
        for k, v in raw_items.items():
            v = v.strip()
            if v != "":
                items[k] = v

        return "LAB", WildcardChooserDict(items)

    elif starts_with_regex(r"\[(ASC|DSC|RND)\]", wildcard):
        mode = wildcard[1:4]
        items = split_string_with_sep(wildcard[5:])

        if mode == "RND":
            random.shuffle(items)
            return mode, WildcardChooser(items, True)
        else:
            return mode, WildcardChooser(items, False)

    else:
        return None, WildcardChooser([(None, wildcard)], False)


def wildcard_load():
    global wildcard_dict
    wildcard_dict = {}

    with wildcard_lock:
        read_wildcard_dict(wildcards_path)

        try:
            read_wildcard_dict(default_wildcards_path)
        except Exception as e:
            print(f"[WildDivide] Failed to load custom wildcards directory. {e}")

        print(f"[WildDivide] Wildcards loading done.")

