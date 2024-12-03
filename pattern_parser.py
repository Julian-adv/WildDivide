# parse pattern and return tree
# pattern := <pattern> '|' <and_pattern>
#         |  <and_pattern>
# and_pattern := <not_pattern> '&' <not_pattern>
#             |  <not_pattern>
# not_pattern := term_pattern
#             |  '~' term_pattern
# term_pattern := string
#              |  '(' pattern ')'
# string := [^|&~()]+
import re

class PatternNode:
    def __init__(self, type, value=None, left=None, right=None):
        self.type = type
        self.value = value
        self.left = left
        self.right = right

class PatternParser:
    def __init__(self, pattern):
        self.pattern = pattern
        self.pos = 0
        
    def peek(self):
        if self.pos >= len(self.pattern):
            return None
        return self.pattern[self.pos]
    
    def consume(self):
        if self.pos >= len(self.pattern):
            return None
        char = self.pattern[self.pos]
        self.pos += 1
        return char
    
    def skip_whitespace(self):
        while self.peek() and self.peek().isspace():
            self.consume()
    
    def parse_string(self):
        self.skip_whitespace()
        result = ""
        # Any character except |, &, ~, (, ) is allowed
        while self.peek() and self.peek() not in '|&~()':
            result += self.consume()
        if not result:
            raise ValueError(f"Expected string at position {self.pos}")
        return PatternNode("TERM", value=result)
    
    def parse_term(self):
        self.skip_whitespace()
        char = self.peek()
        if not char:
            raise ValueError("Unexpected end of pattern")
            
        if char == '(':
            self.consume()  # consume '('
            result = self.parse_pattern()
            self.skip_whitespace()
            if self.peek() != ')':
                raise ValueError(f"Expected ')' at position {self.pos}")
            self.consume()  # consume ')'
            return result
        else:
            return self.parse_string()
    
    def parse_not(self):
        self.skip_whitespace()
        if self.peek() == '~':
            self.consume()
            term = self.parse_term()
            return PatternNode("NOT", left=term)
        return self.parse_term()
    
    def parse_and(self):
        left = self.parse_not()
        self.skip_whitespace()
        
        while self.peek() == '&':
            self.consume()
            right = self.parse_not()
            left = PatternNode("AND", left=left, right=right)
            self.skip_whitespace()
            
        return left
    
    def parse_pattern(self):
        left = self.parse_and()
        self.skip_whitespace()
        
        while self.peek() == '|':
            self.consume()
            right = self.parse_and()
            left = PatternNode("OR", left=left, right=right)
            self.skip_whitespace()
            
        return left

def parse_pattern(pattern):
    """
    Parse a given pattern string into a tree structure.
    
    Args:
        pattern (str): Pattern string to parse
        
    Returns:
        PatternNode: Root node of the parsed pattern tree
        
    Example:
        "a|b" -> OR node(left=TERM("a"), right=TERM("b"))
        "a&b" -> AND node(left=TERM("a"), right=TERM("b"))
        "~a" -> NOT node(left=TERM("a"))
        "(a|b)&c" -> AND node(left=OR node(left=TERM("a"), right=TERM("b")), right=TERM("c"))
    """
    parser = PatternParser(pattern)
    return parser.parse_pattern()

def evaluate_pattern(node, values):
    """
    Evaluate a parsed pattern tree.
    
    Args:
        node (PatternNode): Node of the pattern tree to evaluate
        values (str): String to evaluate against
        
    Returns:
        bool: Whether the pattern evaluates to true for the given values
    """
    if node.type == "TERM":
        return bool(re.search(node.value, values))
    elif node.type == "NOT":
        return not evaluate_pattern(node.left, values)
    elif node.type == "AND":
        return evaluate_pattern(node.left, values) and evaluate_pattern(node.right, values)
    elif node.type == "OR":
        return evaluate_pattern(node.left, values) or evaluate_pattern(node.right, values)
    else:
        raise ValueError(f"Unknown node type: {node.type}")